// customorbit.ts
// Ported from src/celephem/customorbit.cpp
//
// Copyright (C) 2001, Chris Laurel <claurel@shatters.net>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { Vec3 } from './types';
import {
  anomaly,
  AUtoKilometers,
  J2000,
  KM_PER_AU,
  SolarMass,
  yearToJD,
} from './astro';
import {
  degToRad,
  mat3MulVec,
  pfmod,
  quatMul,
  quatToRotationMatrix,
  radToDeg,
  square,
  vec3,
  xRotation,
  yRotation,
} from './math';
import { CachingOrbit, MixedOrbit, Orbit } from './orbit';

const TWOPI = 6.28318530717958647692;
const LPEJ = 0.23509484; // Longitude of perihelion of Jupiter

// These are required because the orbits of the Jovian and Saturnian
// satellites are computed in units of their parent planets' radii.
const JupiterRadius = 71398.0;
const SaturnRadius = 60330.0;

// The expressions for custom orbits are complex, so the bounding radii are
// generally must computed from mean orbital elements.  It's important that
// a sphere with the bounding radius completely enclose the orbit, so we
// multiply by this factor to make the bounding radius a bit larger than
// the apocenter distance computed from the mean elements.
const BoundingRadiusSlack = 1.2;

type PlanetElements = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];
type StaticElements = readonly number[];

const gElements: readonly StaticElements[] = [
  [
    /*     mercury... */
    178.179078,    415.2057519,    3.011e-4,    0.0,
    75.899697,    1.5554889,    2.947e-4,    0.0,
    .20561421,    2.046e-5,    3e-8,        0.0,
    7.002881,    1.8608e-3,    -1.83e-5,    0.0,
    47.145944,    1.1852083,    1.739e-4,    0.0,
    .3870986,    6.74,         -0.42
  ],
  [
    /*     venus... */
    342.767053,    162.5533664,    3.097e-4,    0.0,
    130.163833,    1.4080361,    -9.764e-4,    0.0,
    6.82069e-3,    -4.774e-5,    9.1e-8,        0.0,
    3.393631,    1.0058e-3,    -1e-6,        0.0,
    75.779647,    .89985,        4.1e-4,        0.0,
    .7233316,    16.92,        -4.4
  ],
  [
    /*     mars... */
    293.737334,    53.17137642,    3.107e-4,    0.0,
    3.34218203e2, 1.8407584,    1.299e-4,    -1.19e-6,
    9.33129e-2,    9.2064e-5,    7.7e-8,        0.0,
    1.850333,    -6.75e-4,    1.26e-5,    0.0,
    48.786442,    .7709917,    -1.4e-6,    -5.33e-6,
    1.5236883,    9.36,        -1.52
  ],
  [
    /*     jupiter... */
    238.049257,    8.434172183,    3.347e-4,    -1.65e-6,
    1.2720972e1, 1.6099617,    1.05627e-3,    -3.43e-6,
    4.833475e-2, 1.6418e-4,    -4.676e-7,    -1.7e-9,
    1.308736,    -5.6961e-3,    3.9e-6,        0.0,
    99.443414,    1.01053,    3.5222e-4,    -8.51e-6,
    5.202561,    196.74,        -9.4
  ],
  [
    /*     saturn... */
    266.564377,    3.398638567,    3.245e-4,    -5.8e-6,
    9.1098214e1, 1.9584158,    8.2636e-4,    4.61e-6,
    5.589232e-2, -3.455e-4,    -7.28e-7,    7.4e-10,
    2.492519,    -3.9189e-3,    -1.549e-5,    4e-8,
    112.790414,    .8731951,    -1.5218e-4,    -5.31e-6,
    9.554747,    165.6,        -8.88
  ],
  [
    /*     uranus... */
    244.19747,    1.194065406,    3.16e-4,    -6e-7,
    1.71548692e2, 1.4844328,    2.372e-4,    -6.1e-7,
    4.63444e-2,    -2.658e-5,    7.7e-8,        0.0,
    .772464,    6.253e-4,    3.95e-5,    0.0,
    73.477111,    .4986678,    1.3117e-3,    0.0,
    19.21814,    65.8,        -7.19
  ],
  [
    /*     neptune... */
    84.457994,    .6107942056,    3.205e-4,    -6e-7,
    4.6727364e1, 1.4245744,    3.9082e-4,    -6.05e-7,
    8.99704e-3,    6.33e-6,    -2e-9,        0.0,
    1.779242,    -9.5436e-3,    -9.1e-6,    0.0,
    130.681389,    1.098935,    2.4987e-4,    -4.718e-6,
    30.10957,    62.2,        -6.87
  ],
  [
    /*     pluto...(osculating 1984 jan 21) */
    95.3113544,    .3980332167,    0.0,        0.0,
    224.017,    0.0,        0.0,        0.0,
    .25515,    0.0,        0.0,        0.0,
    17.1329,    0.0,        0.0,        0.0,
    110.191,    0.0,        0.0,        0.0,
    39.8151,    8.2,        -1.0
  ]
];

const gPlanetElements: PlanetElements[] = Array.from({ length: 8 }, () => [
  0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

function computePlanetElements(t: number, pList: readonly number[]): void {
  // Parameter t represents the Julian centuries elapsed since 1900.
  // In other words, t = (jd - 2415020.0) / 36525.0
  for (const planet of pList) {
    const ep = gElements[planet];
    const pp = gPlanetElements[planet];
    const aa = ep[1] * t;
    pp[0] = ep[0] + 360 * (aa - Math.trunc(aa)) + (ep[3] * t + ep[2]) * t * t;
    pp[0] = pfmod(pp[0], 360.0);
    pp[1] = ep[1] * 9.856263e-3 + (ep[2] + ep[3]) / 36525;

    for (let j = 4; j < 20; j += 4) {
      pp[j / 4 + 1] =
        ((ep[j + 3] * t + ep[j + 2]) * t + ep[j + 1]) * t + ep[j + 0];
    }

    pp[6] = ep[20];
    pp[7] = ep[21];
    pp[8] = ep[22];
  }
}

function computePlanetCoords(
  p: number,
  map: number,
  da: number,
  dhl: number,
  dl: number,
  dm: number,
  dml: number,
  dr: number,
  ds: number
): { eclLong: number; eclLat: number; distance: number } {
  const s = gPlanetElements[p][3] + ds;
  const ma = map + dm;
  const { trueAnomaly: nu } = anomaly(ma, s);
  let distance =
    ((gPlanetElements[p][6] + da) * (1 - s * s)) / (1 + s * Math.cos(nu));
  let lp = radToDeg(nu) + gPlanetElements[p][2] + radToDeg(dml - dm);
  lp = degToRad(lp);
  const om = degToRad(gPlanetElements[p][5]);
  const lo = lp - om;
  const slo = Math.sin(lo);
  const clo = Math.cos(lo);
  const inc = degToRad(gPlanetElements[p][4]);
  distance += dr;
  const spsi = slo * Math.sin(inc);
  const y = slo * Math.cos(inc);
  const eclLat = Math.asin(spsi) + dhl;
  let eclLong = Math.atan(y / clo) + om + degToRad(dl);
  if (clo < 0) {
    eclLong += Math.PI;
  }
  eclLong = pfmod(eclLong, TWOPI);
  distance *= KM_PER_AU;
  return { eclLong, eclLat, distance };
}

function sinD(theta: number): number {
  return Math.sin(degToRad(theta));
}

function cosD(theta: number): number {
  return Math.cos(degToRad(theta));
}

function fromPolar(lon: number, lat: number, distance: number): Vec3 {
  const sLon = Math.sin(lon);
  const cLon = Math.cos(lon);
  const sLat = Math.sin(lat);
  const cLat = Math.cos(lat);
  return vec3(
    cLon * sLat * distance,
    cLat * distance,
    -sLon * sLat * distance
  );
}

interface GalileanElements {
  l1: number;
  l2: number;
  l3: number;
  l4: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  gamma: number;
  phi: number;
  psi: number;
  G: number;
  Gp: number;
}

function computeGalileanElements(t: number): GalileanElements {
  // Parameter t is Julian days, epoch 1950.0.
  const l1 = 1.8513962 + 3.551552269981 * t;
  const l2 = 3.0670952 + 1.769322724929 * t;
  const l3 = 2.1041485 + 0.87820795239 * t;
  const l4 = 1.473836 + 0.37648621522 * t;

  const p1 = 1.69451 + 2.8167146e-3 * t;
  const p2 = 2.702927 + 8.248962e-4 * t;
  const p3 = 3.28443 + 1.24396e-4 * t;
  const p4 = 5.851859 + 3.21e-5 * t;

  const w1 = 5.451267 - 2.3176901e-3 * t;
  const w2 = 1.753028 - 5.695121e-4 * t;
  const w3 = 2.080331 - 1.25263e-4 * t;
  const w4 = 5.630757 - 3.07063e-5 * t;

  const gamma =
    5.7653e-3 * Math.sin(2.85674 + 1.8347e-5 * t) +
    6.002e-4 * Math.sin(0.60189 - 2.82274e-4 * t);
  const phi = 3.485014 + 3.033241e-3 * t;
  const psi = 5.524285 - 3.63e-8 * t;
  const G = 0.527745 + 1.45023893e-3 * t + gamma;
  const Gp = 0.5581306 + 5.83982523e-4 * t;

  return {
    l1,
    l2,
    l3,
    l4,
    p1,
    p2,
    p3,
    p4,
    w1,
    w2,
    w3,
    w4,
    gamma,
    phi,
    psi,
    G,
    Gp,
  };
}

export class PlutoOrbit extends CachingOrbit {
  private static readonly pList: readonly number[] = [7];

  computePosition(jd: number): Vec3 {
    const p = 7; // Planet 7
    const dl = 0.0;
    const dr = 0.0;
    const dml = 0.0;
    const ds = 0.0;
    const dm = 0.0;
    const da = 0.0;
    const dhl = 0.0;

    // Calculate the Julian centuries elapsed since 1900
    const t = (jd - 2415020.0) / 36525.0;

    computePlanetElements(t, PlutoOrbit.pList);

    const map = degToRad(gPlanetElements[p][0] - gPlanetElements[p][2]);

    let { eclLong, eclLat, distance } = computePlanetCoords(
      p,
      map,
      da,
      dhl,
      dl,
      dm,
      dml,
      dr,
      ds
    );

    // Corrections for internal coordinate system
    eclLat -= Math.PI / 2;
    eclLong += Math.PI;

    return fromPolar(eclLong, eclLat, distance);
  }

  getPeriod(): number {
    return 90779.235;
  }

  getBoundingRadius(): number {
    return 7.38e9 * BoundingRadiusSlack;
  }
}

// Compute for mean anomaly M the point on the ellipse with
// semimajor axis a and eccentricity e.  This helper function assumes
// a low eccentricity; orbit.cpp has functions appropriate for solving
// Kepler's equation for larger values of e.
function ellipsePosition(a: number, e: number, M: number): Vec3 {
  // Solve Kepler's equation--for a low eccentricity orbit, just a few
  // iterations is enough.
  let E = M;
  for (let k = 0; k < 3; k++) {
    E = M + e * Math.sin(E);
  }

  return vec3(
    a * (Math.cos(E) - e),
    0.0,
    a * Math.sqrt(1 - square(e)) * -Math.sin(E)
  );
}

export class PhobosOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    const epoch = 2433283.0 - 0.5; // 00:00 1 Jan 1950
    const a = 9380.0;
    const e = 0.0151;
    const w0 = 150.247;
    const M0 = 92.474;
    const i = 1.075;
    const node0 = 164.931;
    const n = 1128.8444155;
    const Pw = 1.131;
    const Pnode = 2.262;

    const refplane_RA = 317.724;
    const refplane_Dec = 52.924;
    const marspole_RA = 317.681;
    const marspole_Dec = 52.886;

    let t = jd - epoch;
    t += 10.5 / 1440.0; // light time correction?
    const T = t / 365.25;

    const dnode = 360.0 / Pnode;
    const dw = 360.0 / Pw;
    const node = degToRad(node0 + T * dnode);
    const w = degToRad(w0 + T * dw - T * dnode);
    const M = degToRad(M0 + t * n - T * dw);

    const p = ellipsePosition(a, e, M);

    // Orientation of the orbital plane with respect to the Laplacian plane
    const Rorbit = quatToRotationMatrix(
      quatMul(quatMul(yRotation(node), xRotation(degToRad(i))), yRotation(w))
    );

    // Rotate to the Earth's equatorial plane
    const N = degToRad(refplane_RA);
    const J = degToRad(90.0 - refplane_Dec);
    const RLaplacian = quatToRotationMatrix(
      quatMul(quatMul(yRotation(N), xRotation(J)), yRotation(-N))
    );

    // Rotate to the Martian equatorial plane
    const Nmars = degToRad(marspole_RA);
    const Jmars = degToRad(90.0 - marspole_Dec);
    const RMars_eq = quatToRotationMatrix(
      quatMul(quatMul(yRotation(Nmars), xRotation(-Jmars)), yRotation(-Nmars))
    );

    return mat3MulVec(RMars_eq, mat3MulVec(RLaplacian, mat3MulVec(Rorbit, p)));
  }

  getPeriod(): number {
    return 0.319;
  }

  getBoundingRadius(): number {
    return 9380 * BoundingRadiusSlack;
  }
}

export class DeimosOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    const epoch = 2433283.0 - 0.5;
    const a = 23460.0;
    const e = 0.0002;
    const w0 = 290.496;
    const M0 = 296.230;
    const i = 1.793;
    const node0 = 339.600;
    const n = 285.1618919;
    const Pw = 26.892;
    const Pnode = 54.536;

    const refplane_RA = 316.700;
    const refplane_Dec = 53.564;
    const marspole_RA = 317.681;
    const marspole_Dec = 52.886;

    let t = jd - epoch;
    t += 10.5 / 1440.0; // light time correction?
    const T = t / 365.25;

    const dnode = 360.0 / Pnode;
    const dw = 360.0 / Pw;
    const node = degToRad(node0 + T * dnode);
    const w = degToRad(w0 + T * dw - T * dnode);
    const M = degToRad(M0 + t * n - T * dw);

    const p = ellipsePosition(a, e, M);

    // Orientation of the orbital plane with respect to the Laplacian plane
    const Rorbit = quatToRotationMatrix(
      quatMul(quatMul(yRotation(node), xRotation(degToRad(i))), yRotation(w))
    );

    // Rotate to the Earth's equatorial plane
    const N = degToRad(refplane_RA);
    const J = degToRad(90 - refplane_Dec);
    const RLaplacian = quatToRotationMatrix(
      quatMul(quatMul(yRotation(N), xRotation(J)), yRotation(-N))
    );

    // Rotate to the Martian equatorial plane
    const Nmars = degToRad(marspole_RA);
    const Jmars = degToRad(90 - marspole_Dec);
    const RMars_eq = quatToRotationMatrix(
      quatMul(quatMul(yRotation(Nmars), xRotation(-Jmars)), yRotation(-Nmars))
    );

    return mat3MulVec(RMars_eq, mat3MulVec(RLaplacian, mat3MulVec(Rorbit, p)));
  }

  getPeriod(): number {
    return 1.262441;
  }

  getBoundingRadius(): number {
    return 23462 * BoundingRadiusSlack;
  }
}

const JupAscendingNode = degToRad(22.203);

export class IoOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    // Epoch for Galilean satellites is 1976.0 Aug 10
    const t = jd - 2443000.5;

    const { l1, l2, l3, p1, p2, p3, p4, w1, w2, w3, w4, phi, psi, G } =
      computeGalileanElements(t);

    // Calculate periodic terms for longitude
    let sigma =
      0.47259 * Math.sin(2 * (l1 - l2)) -
      0.03478 * Math.sin(p3 - p4) +
      0.01081 * Math.sin(l2 - 2 * l3 + p3) +
      7.38e-3 * Math.sin(phi) +
      7.13e-3 * Math.sin(l2 - 2 * l3 + p2) -
      6.74e-3 * Math.sin(p1 + p3 - 2 * LPEJ - 2 * G) +
      6.66e-3 * Math.sin(l2 - 2 * l3 + p4) +
      4.45e-3 * Math.sin(l1 - p3) -
      3.54e-3 * Math.sin(l1 - l2) -
      3.17e-3 * Math.sin(2 * (psi - LPEJ)) +
      2.65e-3 * Math.sin(l1 - p4) -
      1.86e-3 * Math.sin(G) +
      1.62e-3 * Math.sin(p2 - p3) +
      1.58e-3 * Math.sin(4 * (l1 - l2)) -
      1.55e-3 * Math.sin(l1 - l3) -
      1.38e-3 * Math.sin(psi + w3 - 2 * LPEJ - 2 * G) -
      1.15e-3 * Math.sin(2 * (l1 - 2 * l2 + w2)) +
      8.9e-4 * Math.sin(p2 - p4) +
      8.5e-4 * Math.sin(l1 + p3 - 2 * LPEJ - 2 * G) +
      8.3e-4 * Math.sin(w2 - w3) +
      5.3e-4 * Math.sin(psi - w2);
    sigma = pfmod(sigma, 360.0);
    sigma = degToRad(sigma);
    let L = l1 + sigma;

    // Calculate periodic terms for the tangent of the latitude
    let B =
      6.393e-4 * Math.sin(L - w1) +
      1.825e-4 * Math.sin(L - w2) +
      3.29e-5 * Math.sin(L - w3) -
      3.11e-5 * Math.sin(L - psi) +
      9.3e-6 * Math.sin(L - w4) +
      7.5e-6 * Math.sin(3 * L - 4 * l2 - 1.9927 * sigma + w2) +
      4.6e-6 * Math.sin(L + psi - 2 * LPEJ - 2 * G);
    B = Math.atan(B);

    // Calculate the periodic terms for distance
    let R =
      -4.1339e-3 * Math.cos(2 * (l1 - l2)) -
      3.87e-5 * Math.cos(l1 - p3) -
      2.14e-5 * Math.cos(l1 - p4) +
      1.7e-5 * Math.cos(l1 - l2) -
      1.31e-5 * Math.cos(4 * (l1 - l2)) +
      1.06e-5 * Math.cos(l1 - l3) -
      6.6e-6 * Math.cos(l1 + p3 - 2 * LPEJ - 2 * G);
    R = 5.90569 * JupiterRadius * (1 + R);

    const T = (jd - 2433282.423) / 36525.0;
    const P = 1.3966626 * T + 3.088e-4 * T * T;
    L += degToRad(P);

    L += JupAscendingNode;

    // Corrections for internal coordinate system
    B -= Math.PI / 2;
    L += Math.PI;

    return fromPolar(L, B, R);
  }

  getPeriod(): number {
    return 1.769138;
  }

  getBoundingRadius(): number {
    return 423329 * BoundingRadiusSlack;
  }
}

export class EuropaOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    // Epoch for Galilean satellites is 1976 Aug 10
    const t = jd - 2443000.5;

    const { l1, l2, l3, l4, p1, p2, p3, p4, w1, w2, w3, w4, phi, psi, G, Gp } =
      computeGalileanElements(t);

    // Calculate periodic terms for longitude
    let sigma =
      1.06476 * Math.sin(2 * (l2 - l3)) +
      0.04256 * Math.sin(l1 - 2 * l2 + p3) +
      0.03581 * Math.sin(l2 - p3) +
      0.02395 * Math.sin(l1 - 2 * l2 + p4) +
      0.01984 * Math.sin(l2 - p4) -
      0.01778 * Math.sin(phi) +
      0.01654 * Math.sin(l2 - p2) +
      0.01334 * Math.sin(l2 - 2 * l3 + p2) +
      0.01294 * Math.sin(p3 - p4) -
      0.01142 * Math.sin(l2 - l3) -
      0.01057 * Math.sin(G) -
      7.75e-3 * Math.sin(2 * (psi - LPEJ)) +
      5.24e-3 * Math.sin(2 * (l1 - l2)) -
      4.6e-3 * Math.sin(l1 - l3) +
      3.16e-3 * Math.sin(psi - 2 * G + w3 - 2 * LPEJ) -
      2.03e-3 * Math.sin(p1 + p3 - 2 * LPEJ - 2 * G) +
      1.46e-3 * Math.sin(psi - w3) -
      1.45e-3 * Math.sin(2 * G) +
      1.25e-3 * Math.sin(psi - w4) -
      1.15e-3 * Math.sin(l1 - 2 * l3 + p3) -
      9.4e-4 * Math.sin(2 * (l2 - w2)) +
      8.6e-4 * Math.sin(2 * (l1 - 2 * l2 + w2)) -
      8.6e-4 * Math.sin(5 * Gp - 2 * G + 0.9115) -
      7.8e-4 * Math.sin(l2 - l4) -
      6.4e-4 * Math.sin(3 * l3 - 7 * l4 + 4 * p4) +
      6.4e-4 * Math.sin(p1 - p4) -
      6.3e-4 * Math.sin(l1 - 2 * l3 + p4) +
      5.8e-4 * Math.sin(w3 - w4) +
      5.6e-4 * Math.sin(2 * (psi - LPEJ - G)) +
      5.6e-4 * Math.sin(2 * (l2 - l4)) +
      5.5e-4 * Math.sin(2 * (l1 - l3)) +
      5.2e-4 * Math.sin(3 * l3 - 7 * l4 + p3 + 3 * p4) -
      4.3e-4 * Math.sin(l1 - p3) +
      4.1e-4 * Math.sin(5 * (l2 - l3)) +
      4.1e-4 * Math.sin(p4 - LPEJ) +
      3.2e-4 * Math.sin(w2 - w3) +
      3.2e-4 * Math.sin(2 * (l3 - G - LPEJ));
    sigma = pfmod(sigma, 360.0);
    sigma = degToRad(sigma);
    let L = l2 + sigma;

    // Calculate periodic terms for the tangent of the latitude
    let B =
      8.1004e-3 * Math.sin(L - w2) +
      4.512e-4 * Math.sin(L - w3) -
      3.284e-4 * Math.sin(L - psi) +
      1.160e-4 * Math.sin(L - w4) +
      2.72e-5 * Math.sin(l1 - 2 * l3 + 1.0146 * sigma + w2) -
      1.44e-5 * Math.sin(L - w1) +
      1.43e-5 * Math.sin(L + psi - 2 * LPEJ - 2 * G) +
      3.5e-6 * Math.sin(L - psi + G) -
      2.8e-6 * Math.sin(l1 - 2 * l3 + 1.0146 * sigma + w3);
    B = Math.atan(B);

    // Calculate the periodic terms for distance
    let R =
      9.3848e-3 * Math.cos(l1 - l2) -
      3.116e-4 * Math.cos(l2 - p3) -
      1.744e-4 * Math.cos(l2 - p4) -
      1.442e-4 * Math.cos(l2 - p2) +
      5.53e-5 * Math.cos(l2 - l3) +
      5.23e-5 * Math.cos(l1 - l3) -
      2.9e-5 * Math.cos(2 * (l1 - l2)) +
      1.64e-5 * Math.cos(2 * (l2 - w2)) +
      1.07e-5 * Math.cos(l1 - 2 * l3 + p3) -
      1.02e-5 * Math.cos(l2 - p1) -
      9.1e-6 * Math.cos(2 * (l1 - l3));
    R = 9.39657 * JupiterRadius * (1 + R);

    const T = (jd - 2433282.423) / 36525.0;
    const P = 1.3966626 * T + 3.088e-4 * T * T;
    L += degToRad(P);

    L += JupAscendingNode;

    // Corrections for internal coordinate system
    B -= Math.PI / 2;
    L += Math.PI;

    return fromPolar(L, B, R);
  }

  getPeriod(): number {
    return 3.5511810791;
  }

  getBoundingRadius(): number {
    return 678000 * BoundingRadiusSlack;
  }
}

export class GanymedeOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    // Epoch for Galilean satellites is 1976 Aug 10
    const t = jd - 2443000.5;

    const { l1, l2, l3, l4, p1, p2, p3, p4, w2, w3, w4, phi, psi, G, Gp } =
      computeGalileanElements(t);

    // Calculate periodic terms for longitude
    let sigma =
      0.1649 * Math.sin(l3 - p3) +
      0.09081 * Math.sin(l3 - p4) -
      0.06907 * Math.sin(l2 - l3) +
      0.03784 * Math.sin(p3 - p4) +
      0.01846 * Math.sin(2 * (l3 - l4)) -
      0.01340 * Math.sin(G) -
      0.01014 * Math.sin(2 * (psi - LPEJ)) +
      7.04e-3 * Math.sin(l2 - 2 * l3 + p3) -
      6.2e-3 * Math.sin(l2 - 2 * l3 + p2) -
      5.41e-3 * Math.sin(l3 - l4) +
      3.81e-3 * Math.sin(l2 - 2 * l3 + p4) +
      2.35e-3 * Math.sin(psi - w3) +
      1.98e-3 * Math.sin(psi - w4) +
      1.76e-3 * Math.sin(phi) +
      1.3e-3 * Math.sin(3 * (l3 - l4)) +
      1.25e-3 * Math.sin(l1 - l3) -
      1.19e-3 * Math.sin(5 * Gp - 2 * G + 0.9115) +
      1.09e-3 * Math.sin(l1 - l2) -
      1.0e-3 * Math.sin(3 * l3 - 7 * l4 + 4 * p4) +
      9.1e-4 * Math.sin(w3 - w4) +
      8.0e-4 * Math.sin(3 * l3 - 7 * l4 + p3 + 3 * p4) -
      7.5e-4 * Math.sin(2 * l2 - 3 * l3 + p3) +
      7.2e-4 * Math.sin(p1 + p3 - 2 * LPEJ - 2 * G) +
      6.9e-4 * Math.sin(p4 - LPEJ) -
      5.8e-4 * Math.sin(2 * l3 - 3 * l4 + p4) -
      5.7e-4 * Math.sin(l3 - 2 * l4 + p4) +
      5.6e-4 * Math.sin(l3 + p3 - 2 * LPEJ - 2 * G) -
      5.2e-4 * Math.sin(l2 - 2 * l3 + p1) -
      5.0e-4 * Math.sin(p2 - p3) +
      4.8e-4 * Math.sin(l3 - 2 * l4 + p3) -
      4.5e-4 * Math.sin(2 * l2 - 3 * l3 + p4) -
      4.1e-4 * Math.sin(p2 - p4) -
      3.8e-4 * Math.sin(2 * G) -
      3.7e-4 * Math.sin(p3 - p4 + w3 - w4) -
      3.2e-4 * Math.sin(3 * l3 - 7 * l4 + 2 * p3 + 2 * p4) +
      3.0e-4 * Math.sin(4 * (l3 - l4)) +
      2.9e-4 * Math.sin(l3 + p4 - 2 * LPEJ - 2 * G) -
      2.8e-4 * Math.sin(w3 + psi - 2 * LPEJ - 2 * G) +
      2.6e-4 * Math.sin(l3 - LPEJ - G) +
      2.4e-4 * Math.sin(l2 - 3 * l3 + 2 * l4) +
      2.1e-4 * Math.sin(2 * (l3 - LPEJ - G)) -
      2.1e-4 * Math.sin(l3 - p2) +
      1.7e-4 * Math.sin(l3 - p3);
    sigma = pfmod(sigma, 360.0);
    sigma = degToRad(sigma);
    let L = l3 + sigma;

    // Calculate periodic terms for the tangent of the latitude
    let B =
      3.2402e-3 * Math.sin(L - w3) -
      1.6911e-3 * Math.sin(L - psi) +
      6.847e-4 * Math.sin(L - w4) -
      2.797e-4 * Math.sin(L - w2) +
      3.21e-5 * Math.sin(L + psi - 2 * LPEJ - 2 * G) +
      5.1e-6 * Math.sin(L - psi + G) -
      4.5e-6 * Math.sin(L - psi - G) -
      4.5e-6 * Math.sin(L + psi - 2 * LPEJ) +
      3.7e-6 * Math.sin(L + psi - 2 * LPEJ - 3 * G) +
      3.0e-6 * Math.sin(2 * l2 - 3 * L + 4.03 * sigma + w2) -
      2.1e-6 * Math.sin(2 * l2 - 3 * L + 4.03 * sigma + w3);
    B = Math.atan(B);

    // Calculate the periodic terms for distance
    let R =
      -1.4388e-3 * Math.cos(l3 - p3) -
      7.919e-4 * Math.cos(l3 - p4) +
      6.342e-4 * Math.cos(l2 - l3) -
      1.761e-4 * Math.cos(2 * (l3 - l4)) +
      2.94e-5 * Math.cos(l3 - l4) -
      1.56e-5 * Math.cos(3 * (l3 - l4)) +
      1.56e-5 * Math.cos(l1 - l3) -
      1.53e-5 * Math.cos(l1 - l2) +
      7.0e-6 * Math.cos(2 * l2 - 3 * l3 + p3) -
      5.1e-6 * Math.cos(l3 + p3 - 2 * LPEJ - 2 * G);
    R = 14.98832 * JupiterRadius * (1 + R);

    const T = (jd - 2433282.423) / 36525.0;
    const P = 1.3966626 * T + 3.088e-4 * T * T;
    L += degToRad(P);

    L += JupAscendingNode;

    // Corrections for internal coordinate system
    B -= Math.PI / 2;
    L += Math.PI;

    return fromPolar(L, B, R);
  }

  getPeriod(): number {
    return 7.154553;
  }

  getBoundingRadius(): number {
    return 1070000 * BoundingRadiusSlack;
  }
}

export class CallistoOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    // Epoch for Galilean satellites is 1976 Aug 10
    const t = jd - 2443000.5;

    const { l1, l2, l3, l4, p3, p4, w3, w4, psi, G, Gp } =
      computeGalileanElements(t);

    // Calculate periodic terms for longitude
    let sigma =
      0.84287 * Math.sin(l4 - p4) +
      0.03431 * Math.sin(p4 - p3) -
      0.03305 * Math.sin(2 * (psi - LPEJ)) -
      0.03211 * Math.sin(G) -
      0.01862 * Math.sin(l4 - p3) +
      0.01186 * Math.sin(psi - w4) +
      6.23e-3 * Math.sin(l4 + p4 - 2 * G - 2 * LPEJ) +
      3.87e-3 * Math.sin(2 * (l4 - p4)) -
      2.84e-3 * Math.sin(5 * Gp - 2 * G + 0.9115) -
      2.34e-3 * Math.sin(2 * (psi - p4)) -
      2.23e-3 * Math.sin(l3 - l4) -
      2.08e-3 * Math.sin(l4 - LPEJ) +
      1.78e-3 * Math.sin(psi + w4 - 2 * p4) +
      1.34e-3 * Math.sin(p4 - LPEJ) +
      1.25e-3 * Math.sin(2 * (l4 - G - LPEJ)) -
      1.17e-3 * Math.sin(2 * G) -
      1.12e-3 * Math.sin(2 * (l3 - l4)) +
      1.07e-3 * Math.sin(3 * l3 - 7 * l4 + 4 * p4) +
      1.02e-3 * Math.sin(l4 - G - LPEJ) +
      9.6e-4 * Math.sin(2 * l4 - psi - w4) +
      8.7e-4 * Math.sin(2 * (psi - w4)) -
      8.5e-4 * Math.sin(3 * l3 - 7 * l4 + p3 + 3 * p4) +
      8.5e-4 * Math.sin(l3 - 2 * l4 + p4) -
      8.1e-4 * Math.sin(2 * (l4 - psi)) +
      7.1e-4 * Math.sin(l4 + p4 - 2 * LPEJ - 3 * G) +
      6.1e-4 * Math.sin(l1 - l4) -
      5.6e-4 * Math.sin(psi - w3) -
      5.4e-4 * Math.sin(l3 - 2 * l4 + p3) +
      5.1e-4 * Math.sin(l2 - l4) +
      4.2e-4 * Math.sin(2 * (psi - G - LPEJ)) +
      3.9e-4 * Math.sin(2 * (p4 - w4)) +
      3.6e-4 * Math.sin(psi + LPEJ - p4 - w4) +
      3.5e-4 * Math.sin(2 * Gp - G + 3.2877) -
      3.5e-4 * Math.sin(l4 - p4 + 2 * LPEJ - 2 * psi) -
      3.2e-4 * Math.sin(l4 + p4 - 2 * LPEJ - G) +
      3.0e-4 * Math.sin(2 * Gp - 2 * G + 2.6032) +
      2.9e-4 * Math.sin(3 * l3 - 7 * l4 + 2 * p3 + 2 * p4) +
      2.8e-4 * Math.sin(l4 - p4 + 2 * psi - 2 * LPEJ) -
      2.8e-4 * Math.sin(2 * (l4 - w4)) -
      2.7e-4 * Math.sin(p3 - p4 + w3 - w4) -
      2.6e-4 * Math.sin(5 * Gp - 3 * G + 3.2877) +
      2.5e-4 * Math.sin(w4 - w3) -
      2.5e-4 * Math.sin(l2 - 3 * l3 + 2 * l4) -
      2.3e-4 * Math.sin(3 * (l3 - l4)) +
      2.1e-4 * Math.sin(2 * l4 - 2 * LPEJ - 3 * G) -
      2.1e-4 * Math.sin(2 * l3 - 3 * l4 + p4) +
      1.9e-4 * Math.sin(l4 - p4 - G) -
      1.9e-4 * Math.sin(2 * l4 - p3 - p4) -
      1.8e-4 * Math.sin(l4 - p4 + G) -
      1.6e-4 * Math.sin(l4 + p3 - 2 * LPEJ - 2 * G);
    sigma = pfmod(sigma, 360.0);
    sigma = degToRad(sigma);
    let L = l4 + sigma;

    // Calculate periodic terms for the tangent of the latitude
    let B =
      -7.6579e-3 * Math.sin(L - psi) +
      4.4134e-3 * Math.sin(L - w4) -
      5.112e-4 * Math.sin(L - w3) +
      7.73e-5 * Math.sin(L + psi - 2 * LPEJ - 2 * G) +
      1.04e-5 * Math.sin(L - psi + G) -
      1.02e-5 * Math.sin(L - psi - G) +
      8.8e-6 * Math.sin(L + psi - 2 * LPEJ - 3 * G) -
      3.8e-6 * Math.sin(L + psi - 2 * LPEJ - G);
    B = Math.atan(B);

    // Calculate the periodic terms for distance
    let R =
      -7.3546e-3 * Math.cos(l4 - p4) +
      1.621e-4 * Math.cos(l4 - p3) +
      9.74e-5 * Math.cos(l3 - l4) -
      5.43e-5 * Math.cos(l4 + p4 - 2 * LPEJ - 2 * G) -
      2.71e-5 * Math.cos(2 * (l4 - p4)) +
      1.82e-5 * Math.cos(l4 - LPEJ) +
      1.77e-5 * Math.cos(2 * (l3 - l4)) -
      1.67e-5 * Math.cos(2 * l4 - psi - w4) +
      1.67e-5 * Math.cos(psi - w4) -
      1.55e-5 * Math.cos(2 * (l4 - LPEJ - G)) +
      1.42e-5 * Math.cos(2 * (l4 - psi)) +
      1.05e-5 * Math.cos(l1 - l4) +
      9.2e-6 * Math.cos(l2 - l4) -
      8.9e-6 * Math.cos(l4 - LPEJ - G) -
      6.2e-6 * Math.cos(l4 + p4 - 2 * LPEJ - 3 * G) +
      4.8e-6 * Math.cos(2 * (l4 - w4));

    R = 26.36273 * JupiterRadius * (1 + R);

    const T = (jd - 2433282.423) / 36525.0;
    const P = 1.3966626 * T + 3.088e-4 * T * T;
    L += degToRad(P);

    L += JupAscendingNode;

    // Corrections for internal coordinate system
    B -= Math.PI / 2;
    L += Math.PI;

    return fromPolar(L, B, R);
  }

  getPeriod(): number {
    return 16.689018;
  }

  getBoundingRadius(): number {
    return 1890000 * BoundingRadiusSlack;
  }
}

const SatAscendingNode = 168.8112;
const SatTilt = 28.0817;

function saturnMoonPosition(
  lam: number,
  gam: number,
  Om: number,
  r: number
): Vec3 {
  let u = lam - Om;
  let w = Om - SatAscendingNode;

  u = degToRad(u);
  w = degToRad(w);
  gam = -degToRad(gam);
  r = r * SaturnRadius;

  // Corrections for Celestia's coordinate system
  u = -u;
  w = -w;

  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cgam = Math.cos(gam);
  const sgam = Math.sin(gam);

  const x = r * (cu * cw - su * sw * cgam);
  const y = r * su * sgam;
  const z = r * (su * cw * cgam + cu * sw);

  return vec3(x, y, z);
}

function outerSaturnMoonParams(
  a: number,
  e: number,
  i: number,
  Om_: number,
  M: number,
  lam_: number
): { lam: number; gam: number; r: number; w: number } {
  const s1 = sinD(SatTilt);
  const c1 = cosD(SatTilt);
  const e_2 = e * e;
  const e_3 = e_2 * e;
  const e_4 = e_3 * e;
  const e_5 = e_4 * e;
  let C =
    (2 * e - 0.25 * e_3 + 0.0520833333 * e_5) * sinD(M) +
    (1.25 * e_2 - 0.458333333 * e_4) * sinD(2 * M) +
    (1.083333333 * e_3 - 0.671875 * e_5) * sinD(3 * M) +
    1.072917 * e_4 * sinD(4 * M) +
    1.142708 * e_5 * sinD(5 * M);
  const g = Om_ - SatAscendingNode;
  const a1 = sinD(i) * sinD(g);
  const a2 = c1 * sinD(i) * cosD(g) - s1 * cosD(i);
  const u = radToDeg(Math.atan2(a1, a2));
  const h = c1 * sinD(i) - s1 * cosD(i) * cosD(g);
  const psi = radToDeg(Math.atan2(s1 * sinD(g), h));

  C = radToDeg(C);
  const lam = lam_ + C + u - g - psi;
  const gam = radToDeg(Math.asin(Math.sqrt(square(a1) + square(a2))));
  const r = (a * (1 - e * e)) / (1 + e * cosD(M + C));
  const w = SatAscendingNode + u;

  return { lam, gam, r, w };
}

export class PhoebeOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    const t = jd - 2433282.5;
    const T = t / 365.25;

    const a = AUtoKilometers(Math.fround(0.0865752)) / SaturnRadius;
    const lam_ = 277.872 - 0.6541068 * t - 90;
    const e = 0.16326;
    const pi = 280.165 - 0.19586 * T;
    const i = 173.949 - 0.020 * T;
    const Om = 245.998 - 0.41353 * T;

    const { lam, gam, r, w } = outerSaturnMoonParams(
      a,
      e,
      i,
      Om,
      lam_ - pi,
      lam_
    );

    return saturnMoonPosition(lam, gam, w, r);
  }

  getPeriod(): number {
    return 548.2122790;
  }

  getBoundingRadius(): number {
    return 15100000 * BoundingRadiusSlack;
  }
}

type LTerms = readonly [number, number, number];
type ZTerms = readonly [number, number, number, number, number];
type ZetaTerms = readonly [number, number];

export class UranianSatelliteOrbit extends CachingOrbit {
  private a: number;
  private n: number;
  private L0: number;
  private L1: number;
  private L_k: LTerms;
  private L_theta: LTerms;
  private L_phi: LTerms;
  private z_k: ZTerms;
  private z_theta: ZTerms;
  private z_phi: ZTerms;
  private zeta_k: ZetaTerms;
  private zeta_theta: ZetaTerms;
  private zeta_phi: ZetaTerms;

  constructor(
    _a: number,
    _n: number,
    _L0: number,
    _L1: number,
    _L_k: LTerms,
    _L_theta: LTerms,
    _L_phi: LTerms,
    _z_k: ZTerms,
    _z_theta: ZTerms,
    _z_phi: ZTerms,
    _zeta_k: ZetaTerms,
    _zeta_theta: ZetaTerms,
    _zeta_phi: ZetaTerms
  ) {
    super();
    this.a = _a;
    this.n = _n;
    this.L0 = _L0;
    this.L1 = _L1;
    this.L_k = _L_k;
    this.L_theta = _L_theta;
    this.L_phi = _L_phi;
    this.z_k = _z_k;
    this.z_theta = _z_theta;
    this.z_phi = _z_phi;
    this.zeta_k = _zeta_k;
    this.zeta_theta = _zeta_theta;
    this.zeta_phi = _zeta_phi;
  }

  getPeriod(): number {
    return (2.0 * Math.PI) / this.n;
  }

  getBoundingRadius(): number {
    return this.a * BoundingRadiusSlack;
  }

  computePosition(jd: number): Vec3 {
    const t = jd - 2444239.5;

    let L = this.L0 + this.L1 * t;
    for (let i = 0; i < 3; ++i) {
      L += this.L_k[i] * Math.sin(this.L_theta[i] * t + this.L_phi[i]);
    }

    let a0 = 0.0;
    let a1 = 0.0;
    for (let i = 0; i < 5; ++i) {
      const w = this.z_theta[i] * t + this.z_phi[i];
      const sw = Math.sin(w);
      const cw = Math.cos(w);
      a0 += this.z_k[i] * cw;
      a1 += this.z_k[i] * sw;
    }

    let b0 = 0.0;
    let b1 = 0.0;
    for (let i = 0; i < 2; ++i) {
      const w = this.zeta_theta[i] * t + this.zeta_phi[i];
      const sw = Math.sin(w);
      const cw = Math.cos(w);
      b0 += this.zeta_k[i] * cw;
      b1 += this.zeta_k[i] * sw;
    }

    const e = Math.sqrt(square(a0) + square(a1));
    const p = Math.atan2(a1, a0);
    const gamma = 2.0 * Math.asin(Math.sqrt(square(b0) + square(b1)));
    const theta = Math.atan2(b1, b0);

    L += degToRad(174.99);

    // Now that we have all the orbital elements, compute the position
    const M = L - p;

    // Iterate a few times to compute the eccentric anomaly from the
    // mean anomaly.
    let ecc = M;
    for (let i = 0; i < 4; ++i) {
      ecc = M + e * Math.sin(ecc);
    }

    const x = this.a * (Math.cos(ecc) - e);
    const z = this.a * Math.sqrt(1 - square(e)) * -Math.sin(ecc);

    const R = quatToRotationMatrix(
      quatMul(quatMul(yRotation(theta), xRotation(gamma)), yRotation(p - theta))
    );
    return mat3MulVec(R, vec3(x, 0, z));
  }
}

const uran_n: readonly number[] = [
  4.44352267, 2.49254257, 1.51595490, 0.72166316, 0.46658054,
];
const uran_a: readonly number[] = [129800, 191200, 266000, 435800, 583600];
const uran_L0: readonly number[] = [
  -0.23805158, 3.09804641, 2.28540169, 0.85635879, -0.91559180,
];
const uran_L1: readonly number[] = [
  4.44519055, 2.49295252, 1.51614811, 0.72171851, 0.46669212,
];
const uran_L_k: readonly LTerms[] = [
  [0.02547217, -0.00308831, -3.181e-4],
  [-1.86050e-3, 2.1999e-4, 0],
  [6.6057e-4, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const uran_L_theta: readonly LTerms[] = [
  [-2.18167e-4, -4.36336e-4, -6.54502e-4],
  [-2.18167e-4, -4.36336e-4, 0],
  [-2.18167e-4, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const uran_L_phi: readonly LTerms[] = [
  [1.32, 2.64, 3.97],
  [1.32, 2.64, 0],
  [1.32, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const uran_z_k: readonly ZTerms[] = [
  [1.31238e-3, -1.2331e-4, -1.9410e-4, 0, 0],
  [1.18763e-3, 8.6159e-4, 0, 0, 0],
  [-2.2795e-4, 3.90496e-3, 3.0917e-4, 2.2192e-4, 5.4923e-4],
  [9.3281e-4, 1.12089e-3, 7.9343e-4, 0, 0],
  [-7.5868e-4, 1.39734e-3, -9.8726e-4, 0, 0],
];
const uran_z_theta: readonly ZTerms[] = [
  [1.5273e-4, 0.08606, 0.709, 0, 0],
  [4.727824e-5, 2.179316e-5, 0, 0, 0],
  [4.727824e-5, 2.179132e-5, 1.580524e-5, 2.9363068e-6, -0.01157],
  [1.580524e-5, 2.9363068e-6, -6.9008e-3, 0, 0],
  [1.580524e-5, 2.9363068e-6, -6.9008e-3, 0, 0],
];
const uran_z_phi: readonly ZTerms[] = [
  [0.61, 0.15, 6.04, 0, 0],
  [2.41, 2.07, 0, 0, 0],
  [2.41, 2.07, 0.74, 0.43, 5.71],
  [0.74, 0.43, 1.82, 0, 0],
  [0.74, 0.43, 1.82, 0, 0],
];
const uran_zeta_k: readonly ZetaTerms[] = [
  [0.03787171, 0],
  [3.5825e-4, 2.9008e-4],
  [1.11336e-3, 3.5014e-4],
  [6.8572e-4, 3.7832e-4],
  [-5.9633e-4, 4.5169e-4],
];
const uran_zeta_theta: readonly ZetaTerms[] = [
  [-1.54449e-4, 0],
  [-4.782474e-5, -2.156628e-5],
  [-2.156628e-5, -1.401373e-5],
  [-1.401373e-5, -1.9713918e-6],
  [-1.401373e-5, -1.9713918e-6],
];
const uran_zeta_phi: readonly ZetaTerms[] = [
  [5.70, 0],
  [0.40, 0.59],
  [0.59, 1.75],
  [1.75, 4.21],
  [1.75, 4.21],
];

function createUranianSatelliteOrbit(n: number): Orbit {
  const idx = n - 1;
  return new UranianSatelliteOrbit(
    uran_a[idx],
    uran_n[idx],
    uran_L0[idx],
    uran_L1[idx],
    uran_L_k[idx],
    uran_L_theta[idx],
    uran_L_phi[idx],
    uran_z_k[idx],
    uran_z_theta[idx],
    uran_z_phi[idx],
    uran_zeta_k[idx],
    uran_zeta_theta[idx],
    uran_zeta_phi[idx]
  );
}

/*! Orbit of Triton, from Emelyanov and Samorodov (2015), MNRAS 454, p.2205-2215
 *  "Analytical theory of motion and new ephemeris of Triton from observations"
 *  Positions are calculated in Neptunocentric coordinates referred to the Earth
 *  equator/equinox of J2000.0.
 */
export class TritonOrbit extends CachingOrbit {
  private static readonly KI: readonly number[] = [
    0.0,
    0.00096486,
    0.00664662,
    0.00004687,
    0.00095975,
    -0.00037627,
    -0.00000225,
  ];
  private static readonly Ku: readonly number[] = [
    -0.00012327,
    -0.00279453,
    -0.04335625,
    -0.00017215,
    -0.00233686,
    0.00170605,
    0.00000730,
  ];
  private static readonly KOmega: readonly number[] = [
    0.00063339,
    -0.00178908,
    -0.01560110,
    -0.00009186,
    -0.00218071,
    0.00096231,
    0.00000536,
  ];
  private static readonly k1: readonly number[] = [2, 2, 0, -2, 2, 0, -2];
  private static readonly k2: readonly number[] = [0, 1, 1, 1, 2, 2, 2];

  computePosition(jd: number): Vec3 {
    // Parameters of the Sun's relative motion around Neptune (INPOP10 ephemeris)
    const OmegaSun = 200.788181;
    const u0Sun = 258.727508;
    const duSun = 0.00598084154;

    // Parameters of Triton's motion (^k = 0; with all observations)
    const a = 354696.76;
    const I0 = 157.268439;
    const u0 = 31.791760;
    const du = 61.25871809;
    const Omega0 = 73.395781;
    const dOmega = 0.001452458;
    const alpha0 = degToRad(299.090);
    const delta0 = degToRad(43.019);

    const t0 = 2378520.5;
    const ts = 2451545.0;

    const t = jd - t0;

    // Compute the argument of latitude of the Sun's orbit
    const uSun = u0Sun + duSun * (jd - ts);

    let Omega = Omega0 + dOmega * t;

    // Compute the long-period perturbations from the Sun
    let deltaI = 0.0;
    let deltau = 0.0;
    let deltaOmega = 0.0;
    for (let i = 0; i < 7; i++) {
      const perturbArg = degToRad(
        TritonOrbit.k1[i] * uSun + TritonOrbit.k2[i] * (OmegaSun - Omega)
      );
      deltaI += TritonOrbit.KI[i] * Math.cos(perturbArg);
      deltau += TritonOrbit.Ku[i] * Math.sin(perturbArg);
      deltaOmega += TritonOrbit.KOmega[i] * Math.sin(perturbArg);
    }

    // Compute the orbital elements of Triton at epoch
    const I = degToRad(I0 + deltaI);
    const u = degToRad(u0 + du * t + deltau);
    Omega = degToRad(Omega + deltaOmega);

    // Compute the position on the orbital coordinate system:
    //   X points towards the node of the x-y plane on Earth's equator.
    //   Z is parallel to the angular momentum vector of Triton's orbit.
    const sinI = Math.sin(I);
    const cosI = Math.cos(I);
    const sinu = Math.sin(u);
    const cosu = Math.cos(u);
    const sinOmega = Math.sin(Omega);
    const cosOmega = Math.cos(Omega);
    const x = a * (cosu * cosOmega - sinu * sinOmega * cosI);
    const y = a * (cosu * sinOmega + sinu * cosOmega * cosI);
    const z = a * sinu * sinI;

    // Rotate to the Earth's equatorial plane
    const sinAlpha = Math.sin(alpha0);
    const cosAlpha = Math.cos(alpha0);
    const sinDelta = Math.sin(delta0);
    const cosDelta = Math.cos(delta0);
    const xg =
      -sinAlpha * x - cosAlpha * sinDelta * y + cosAlpha * cosDelta * z;
    const yg =
      cosAlpha * x - sinAlpha * sinDelta * y + sinAlpha * cosDelta * z;
    const zg = cosDelta * y + sinDelta * z;

    // Convert to Celestia's coordinate system
    return vec3(xg, zg, -yg);
  }

  getPeriod(): number {
    return 5.87685421025;
  }

  getBoundingRadius(): number {
    return 354700 * BoundingRadiusSlack;
  }
}

/*! Ephemeris for Helene, Telesto, and Calypso, from
 *  "An upgraded theory for Helene, Telesto, and Calypso"
 *  Oberti P., Vienne A., 2002, A&A
 *  Translated to C++ by Chris Laurel from FORTRAN source available at:
 *    ftp://ftp.imcce.fr/pub/ephem/satel/htc20
 *
 *  Coordinates are Saturnocentric and referred to the ecliptic
 *     and equinox of J2000.0.
 */
const HeleneTerms: readonly number[] = [
  0,0,0,0,1,
  1,0,0,0,1,
  1,1,0,0,1,
  0,0,1,0,1,
  1,0,1,0,1,
  0,0,2,0,1,
  1,0,2,0,1,
  0,0,3,0,1,
  0,1,0,0,-1,
  1,1,0,0,-1,
  0,0,1,0,-1,
  1,0,1,0,-1,
  0,0,2,0,-1,
  1,0,2,0,-1,
  0,0,3,0,-1,
  1,0,0,1,0,
  0,1,0,0,1,
  1,0,3,0,1,
  1,0,3,0,-1,
  1,1,1,0,1,
  1,1,-1,0,1,
  0,0,0,1,0,
  0,1,1,0,1,
  0,1,-1,0,1,
];

const HeleneAmps: readonly number[] = [
  -0.002396,-0.000399,0.000442,0.001278,-0.004939,0.002466,
   0.000557,-0.002152,0.001074,0.005500,0.000916,-0.001015,-0.000003,
   0.,0.,0.000003,-0.000011,0.000006,-0.000066,0.000265,-0.000133,
   -0.000676,-0.000107,0.000122,-0.000295,-0.000047,0.000053,
   0.000151,-0.000607,0.000303,0.000015,0.000017,-0.000010,-0.000044,
   0.000033,-0.000013,-0.000019,0.000014,-0.000006,-0.000035,
   -0.000038,0.000023,0.000002,0.,0.,-0.000002,0.000004,-0.000002,
   -0.000002,0.000008,-0.000004,0.,0.,0.,0.000009,0.,-0.000002,0.,0.,
   0.,-0.000067,0.000264,-0.000132,-0.000677,-0.000110,0.000123,
   0.000294,0.000048,-0.000053,-0.000154,0.000608,-0.000304,0.000015,
   0.000016,-0.000010,-0.000044,0.000033,-0.000013,0.000019,
   -0.000014,0.000006,0.000035,0.000038,-0.000023,0.000002,0.,0.,
   -0.000002,0.000004,-0.000002,0.,0.000005,0.000010,0.,0.,0.,0.,
   0.000002,0.,-0.000013,-0.000002,0.000002,0.,0.000002,0.,-0.000004,
   -0.000002,0.,0.,-0.000002,0.,0.000004,0.000002,0.,0.,0.,0.,
   -0.000003,0.,0.,0.,0.,0.,-0.000003,0.,0.,0.,0.,0.,0.,0.000005,
   0.000010,0.,0.,0.,0.,0.000003,0.,0.,0.,0.,0.,0.000003,0.
];

const TelestoTerms: readonly number[] = [
  1,0,0,1,0,
  0,0,0,0,1,
  1,0,0,0,1,
  1,1,0,0,1,
  0,0,1,0,1,
  1,0,1,0,1,
  1,1,0,0,-1,
  0,0,1,0,-1,
  1,0,1,0,-1,
  0,1,0,0,1,
  0,1,0,0,-1,
  0,0,0,1,0
];

const TelestoAmps: readonly number[] = [
  0.000002,0.000010,0.000019,0.,0.,0.,
  -0.001933,-0.000253,0.000320,0.001237,-0.005767,0.002904,
  0.000372,-0.001733,0.000873,0.006432,0.000842,-0.001066,
  -0.000002,0.,0.,0.000003,-0.000014,0.000007,
  -0.000006,0.000029,-0.000015,-0.000108,-0.000014,0.000018,
  -0.000033,-0.000004,0.000005,0.000020,-0.000097,0.000049,
  0.000007,0.,0.,0.,0.,0.,
  -0.000006,0.000029,-0.000015,-0.000108,-0.000014,0.000018,
  0.000032,0.000004,-0.000005,-0.000021,0.000097,-0.000049,
  0.,0.000002,0.,-0.000016,-0.000002,0.000003,
  0.,0.000007,-0.000003,0.,0.,0.,
  0.,0.,0.,0.000002,0.000010,0.000019
];

const CalypsoTerms: readonly number[] = [
  1,0,0,1,0,
  0,0,0,0,1,
  0,1,0,0,1,
  1,0,0,0,1,
  1,1,0,0,1,
  0,0,1,0,1,
  1,0,1,0,1,
  0,0,2,0,1,
  0,1,0,0,-1,
  0,0,1,0,-1,
  1,0,1,0,-1,
  0,0,2,0,-1,
  1,0,2,0,1,
  1,1,0,0,-1,
  1,0,2,0,-1,
  0,0,1,1,0,
  0,0,1,-1,0,
  0,0,0,1,0,
  0,1,1,0,-1,
  0,1,-1,0,-1,
  1,1,1,0,-1,
  1,1,-1,0,-1,
  1,0,1,1,0,
  1,0,1,-1,0
];

const CalypsoAmps: readonly number[] = [
  0.000005,0.000027,0.000052,0.,0.,0.,0.000651,0.001615,
  -0.000910,-0.006145,0.002170,-0.000542,-0.000011,0.000004,0.,0.,
  0.,0.,-0.001846,0.000652,-0.000163,-0.002166,-0.005375,0.003030,
  -0.000004,-0.000010,0.000006,0.,0.,0.,-0.000077,0.000028,
  -0.000007,-0.000092,-0.000225,0.000127,-0.000028,-0.000067,
  0.000038,0.000257,-0.000092,0.000023,-0.000002,0.,0.,0.000004,
  -0.000006,0.000003,-0.000004,0.,0.,-0.000009,-0.000022,0.000012,
  -0.000078,0.000027,-0.000007,-0.000089,-0.000225,0.000127,
  0.000027,0.000068,-0.000038,-0.000257,0.000089,-0.000022,
  -0.000002,0.,0.,0.000004,-0.000006,0.000003,0.,-0.000002,0.,
  0.000007,0.000003,-0.000002,0.,0.000003,-0.000002,-0.000025,
  0.000009,-0.000002,0.,0.000002,0.,-0.000007,-0.000003,0.000002,
  0.,0.,-0.000002,0.,0.,0.,0.,0.,-0.000002,0.,0.,0.,0.,0.,0.,
  0.000005,0.000027,0.000052,0.,0.,0.,0.000002,0.,0.,0.,0.,0.,
  0.000002,0.,0.,0.,0.,0.,0.,-0.000002,0.,0.,0.,0.,0.,-0.000002,0.,
  0.,0.,0.,0.,0.,0.000002,0.,0.,0.,0.,0.,-0.000002
];

interface HTC20Angles {
  nu1: number;
  nu2: number;
  nu3: number;
  lambda: number;
  phi1: number;
  phi2: number;
  phi3: number;
  theta: number;
}

const HeleneAngles: HTC20Angles = {
  nu1: 2.29427177,
  nu2: -0.00802443,
  nu3: 2.29714724,
  lambda: 2.29571726,
  phi1: 3.27342548,
  phi2: 1.30770422,
  phi3: 0.77232982,
  theta: 3.07410251,
};

const TelestoAngles: HTC20Angles = {
  nu1: 3.32489098,
  nu2: -0.00948045,
  nu3: 3.33170385,
  lambda: 3.32830561,
  phi1: 6.24233590,
  phi2: 4.62624497,
  phi3: 0.04769409,
  theta: 3.24465053,
};

const CalypsoAngles: HTC20Angles = {
  nu1: -3.32489617,
  nu2: 0.00946761,
  nu3: -3.33170262,
  lambda: 3.32830561,
  phi1: 5.41384760,
  phi2: 1.36874776,
  phi3: 5.64157287,
  theta: 3.25074880,
};

export class HTC20Orbit extends CachingOrbit {
  private nTerms: number;
  private args: readonly number[];
  private amplitudes: readonly number[];
  private angles: HTC20Angles;
  private period: number;

  constructor(
    _nTerms: number,
    _args: readonly number[],
    _amplitudes: readonly number[],
    _angles: HTC20Angles,
    _period: number,
    _boundingRadius?: number
  ) {
    super();
    this.nTerms = _nTerms;
    this.args = _args;
    this.amplitudes = _amplitudes;
    this.angles = _angles;
    this.period = _period;
  }

  computePosition(jd: number): Vec3 {
    const t = jd - J2000 - 4156.0 / 86400.0;
    let posX = 0.0;
    let posY = 0.0;
    let posZ = 0.0;

    for (let i = 0; i < this.nTerms; i++) {
      const rowOffset = i * 5;
      const ang =
        this.args[rowOffset + 1] * (this.angles.nu1 * t + this.angles.phi1) +
        this.args[rowOffset + 2] * (this.angles.nu2 * t + this.angles.phi2) +
        this.args[rowOffset + 3] * (this.angles.nu3 * t + this.angles.phi3) +
        this.args[rowOffset + 4] * (this.angles.lambda * t + this.angles.theta);

      const u = this.args[rowOffset] === 0.0 ? Math.cos(ang) : Math.sin(ang);
      const ampOffset = i * 6;
      posX += this.amplitudes[ampOffset] * u;
      posY += this.amplitudes[ampOffset + 1] * u;
      posZ += this.amplitudes[ampOffset + 2] * u;
    }

    // Convert to Celestia's coordinate system
    const scale = AUtoKilometers(1.0);
    return vec3(posX * scale, posZ * scale, -posY * scale);
  }

  getPeriod(): number {
    return this.period;
  }

  getBoundingRadius(): number {
    return 354800 * BoundingRadiusSlack;
  }
}

export function createPlutoOrbit(): Orbit {
  return new MixedOrbit(
    new PlutoOrbit(),
    yearToJD(-4000),
    yearToJD(4000),
    SolarMass
  );
}

export function createPhobosOrbit(): Orbit {
  return new PhobosOrbit();
}

export function createDeimosOrbit(): Orbit {
  return new DeimosOrbit();
}

export function createIoOrbit(): Orbit {
  return new IoOrbit();
}

export function createEuropaOrbit(): Orbit {
  return new EuropaOrbit();
}

export function createGanymedeOrbit(): Orbit {
  return new GanymedeOrbit();
}

export function createCallistoOrbit(): Orbit {
  return new CallistoOrbit();
}

export function createPhoebeOrbit(): Orbit {
  return new PhoebeOrbit();
}

export function createHeleneOrbit(): Orbit {
  return new HTC20Orbit(
    24,
    HeleneTerms,
    HeleneAmps,
    HeleneAngles,
    2.736915,
    380000
  );
}

export function createTelestoOrbit(): Orbit {
  return new HTC20Orbit(
    12,
    TelestoTerms,
    TelestoAmps,
    TelestoAngles,
    1.887802,
    300000
  );
}

export function createCalypsoOrbit(): Orbit {
  return new HTC20Orbit(
    24,
    CalypsoTerms,
    CalypsoAmps,
    CalypsoAngles,
    1.887803,
    300000
  );
}

export function createMirandaOrbit(): Orbit {
  return createUranianSatelliteOrbit(1);
}

export function createArielOrbit(): Orbit {
  return createUranianSatelliteOrbit(2);
}

export function createUmbrielOrbit(): Orbit {
  return createUranianSatelliteOrbit(3);
}

export function createTitaniaOrbit(): Orbit {
  return createUranianSatelliteOrbit(4);
}

export function createOberonOrbit(): Orbit {
  return createUranianSatelliteOrbit(5);
}

export function createTritonOrbit(): Orbit {
  return new TritonOrbit();
}
