// lunar.ts
// Ported from LunarOrbit in src/celephem/customorbit.cpp
//
// Copyright (C) 2001, Chris Laurel <claurel@shatters.net>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { Vec3 } from './types';
import { EarthMass, J2000, LunarMass, yearToJD } from './astro';
import { degToRad, pfmod, vec3 } from './math';
import { CachingOrbit, MixedOrbit, Orbit } from './orbit';

const TWOPI = 6.28318530717958647692;
const BoundingRadiusSlack = 1.2;

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

function obliquity(t: number): number {
  return degToRad(
    2.345229444e1 -
      ((((-1.81e-3 * t + 5.9e-3) * t + 4.6845e1) * t) / 3600.0)
  );
}

function nutation(t: number): { deps: number; dpsi: number } {
  const t2 = t * t;

  let a = 100.0021358 * t;
  let b = 360.0 * (a - Math.trunc(a));
  const ls = 279.697 + 0.000303 * t2 + b;

  a = 1336.855231 * t;
  b = 360.0 * (a - Math.trunc(a));
  const ld = 270.434 - 0.001133 * t2 + b;

  a = 99.99736056000026 * t;
  b = 360.0 * (a - Math.trunc(a));
  let ms = 358.476 - 0.00015 * t2 + b;

  a = 13255523.59 * t;
  b = 360.0 * (a - Math.trunc(a));
  let md = 296.105 + 0.009192 * t2 + b;

  a = 5.372616667 * t;
  b = 360.0 * (a - Math.trunc(a));
  let nm = 259.183 + 0.002078 * t2 - b;

  // convert to radian forms for use with trig functions.
  const tls = 2.0 * degToRad(ls);
  nm = degToRad(nm);
  const tnm = 2.0 * degToRad(nm);
  ms = degToRad(ms);
  const tld = 2.0 * degToRad(ld);
  md = degToRad(md);

  // find delta psi and eps, in arcseconds.
  let dpsi =
    (-17.2327 - 0.01737 * t) * Math.sin(nm) +
    (-1.2729 - 0.00013 * t) * Math.sin(tls) +
    0.2088 * Math.sin(tnm) -
    0.2037 * Math.sin(tld) +
    (0.1261 - 0.00031 * t) * Math.sin(ms) +
    0.0675 * Math.sin(md) -
    (0.0497 - 0.00012 * t) * Math.sin(tls + ms) -
    0.0342 * Math.sin(tld - nm) -
    0.0261 * Math.sin(tld + md) +
    0.0214 * Math.sin(tls - ms) -
    0.0149 * Math.sin(tls - tld + md) +
    0.0124 * Math.sin(tls - nm) +
    0.0114 * Math.sin(tld - md);
  let deps =
    (9.21 + 0.00091 * t) * Math.cos(nm) +
    (0.5522 - 0.00029 * t) * Math.cos(tls) -
    0.0904 * Math.cos(tnm) +
    0.0884 * Math.cos(tld) +
    0.0216 * Math.cos(tls + ms) +
    0.0183 * Math.cos(tld - nm) +
    0.0113 * Math.cos(tld + md) -
    0.0093 * Math.cos(tls - ms) -
    0.0066 * Math.cos(tls - nm);

  // convert to radians.
  dpsi = degToRad(dpsi / 3600.0);
  deps = degToRad(deps / 3600.0);

  return { deps, dpsi };
}

function eclipticToEquatorial(
  fEclLat: number,
  fEclLon: number
): { RA: number; dec: number } {
  const t = 0.0;
  let eps = obliquity(t);
  const { deps } = nutation(t);
  eps += deps;

  const seps = Math.sin(eps);
  const ceps = Math.cos(eps);

  const sy = Math.sin(fEclLat);
  let cy = Math.cos(fEclLat);
  if (Math.abs(cy) < 1e-20) {
    cy = 1e-20;
  }
  const ty = sy / cy;
  const sx = Math.sin(fEclLon);
  const cx = Math.cos(fEclLon);

  const dec = Math.asin(sy * ceps + cy * seps * sx);
  let RA = Math.atan((sx * ceps - ty * seps) / cx);
  if (cx < 0.0) {
    RA += Math.PI;
  }
  RA = pfmod(RA, TWOPI);

  return { RA, dec };
}

function epochConvert(
  jdFrom: number,
  jdTo: number,
  a0: number,
  d0: number
): { a: number; d: number } {
  const T = (jdFrom - J2000) / 36525.0;
  const t = (jdTo - jdFrom) / 36525.0;

  let zeta =
    (2306.2181 + 1.39656 * T - 0.000139 * T * T) * t +
    (0.30188 - 0.000344 * T) * t * t +
    0.017998 * t * t * t;
  let z =
    (2306.2181 + 1.39656 * T - 0.000139 * T * T) * t +
    (1.09468 + 0.000066 * T) * t * t +
    0.018203 * t * t * t;
  let theta =
    (2004.3109 - 0.8533 * T - 0.000217 * T * T) * t -
    (0.42665 + 0.000217 * T) * t * t -
    0.041833 * t * t * t;

  zeta = degToRad(zeta / 3600.0);
  z = degToRad(z / 3600.0);
  theta = degToRad(theta / 3600.0);

  const A = Math.cos(d0) * Math.sin(a0 + zeta);
  const B =
    Math.cos(theta) * Math.cos(d0) * Math.cos(a0 + zeta) -
    Math.sin(theta) * Math.sin(d0);
  const C =
    Math.sin(theta) * Math.cos(d0) * Math.cos(a0 + zeta) +
    Math.cos(theta) * Math.sin(d0);

  const a = Math.atan2(A, B) + z;
  const d = Math.asin(C);

  return { a, d };
}

export class LunarOrbit extends CachingOrbit {
  computePosition(jd: number): Vec3 {
    const jd19 = jd - 2415020.0;
    const t = jd19 / 36525.0;
    const t2 = t * t;

    let m1 = jd19 / 27.32158213;
    m1 = 360.0 * (m1 - Math.trunc(m1));
    let m2 = jd19 / 365.2596407;
    m2 = 360.0 * (m2 - Math.trunc(m2));
    let m3 = jd19 / 27.55455094;
    m3 = 360.0 * (m3 - Math.trunc(m3));
    let m4 = jd19 / 29.53058868;
    m4 = 360.0 * (m4 - Math.trunc(m4));
    let m5 = jd19 / 27.21222039;
    m5 = 360.0 * (m5 - Math.trunc(m5));
    let m6 = jd19 / 6798.363307;
    m6 = 360.0 * (m6 - Math.trunc(m6));

    let ld = 270.434164 + m1 - (0.001133 - 0.0000019 * t) * t2;
    let ms = 358.475833 + m2 - (0.00015 + 0.0000033 * t) * t2;
    let md = 296.104608 + m3 + (0.009192 + 0.0000144 * t) * t2;
    let de = 350.737486 + m4 - (0.001436 - 0.0000019 * t) * t2;
    let f = 11.250889 + m5 - (0.003211 + 0.0000003 * t) * t2;
    let n = 259.183275 - m6 + (0.002078 + 0.000022 * t) * t2;

    const a = degToRad(51.2 + 20.2 * t);
    const sa = Math.sin(a);
    const sn = Math.sin(degToRad(n));
    const b = 346.56 + (132.87 - 0.0091731 * t) * t;
    const sb = 0.003964 * Math.sin(degToRad(b));
    const c = degToRad(n + 275.05 - 2.3 * t);
    const sc = Math.sin(c);

    ld = ld + 0.000233 * sa + sb + 0.001964 * sn;
    ms = ms - 0.001778 * sa;
    md = md + 0.000817 * sa + sb + 0.002541 * sn;
    f = f + sb - 0.024691 * sn - 0.004328 * sc;
    de = de + 0.002011 * sa + sb + 0.001964 * sn;
    const e = 1.0 - (0.002495 + 7.52e-6 * t) * t;
    const e2 = e * e;

    ld = degToRad(ld);
    ms = degToRad(ms);
    n = degToRad(n);
    de = degToRad(de);
    f = degToRad(f);
    md = degToRad(md);

    let l =
      6.28875 * Math.sin(md) +
      1.27402 * Math.sin(2 * de - md) +
      0.658309 * Math.sin(2 * de) +
      0.213616 * Math.sin(2 * md) -
      e * 0.185596 * Math.sin(ms) -
      0.114336 * Math.sin(2 * f) +
      0.058793 * Math.sin(2 * (de - md)) +
      0.057212 * e * Math.sin(2 * de - ms - md) +
      0.05332 * Math.sin(2 * de + md) +
      0.045874 * e * Math.sin(2 * de - ms) +
      0.041024 * e * Math.sin(md - ms);
    l =
      l -
      0.034718 * Math.sin(de) -
      e * 0.030465 * Math.sin(ms + md) +
      0.015326 * Math.sin(2 * (de - f)) -
      0.012528 * Math.sin(2 * f + md) -
      0.01098 * Math.sin(2 * f - md) +
      0.010674 * Math.sin(4 * de - md) +
      0.010034 * Math.sin(3 * md) +
      0.008548 * Math.sin(4 * de - 2 * md) -
      e * 0.00791 * Math.sin(ms - md + 2 * de) -
      e * 0.006783 * Math.sin(2 * de + ms);
    l =
      l +
      0.005162 * Math.sin(md - de) +
      e * 0.005 * Math.sin(ms + de) +
      0.003862 * Math.sin(4 * de) +
      e * 0.004049 * Math.sin(md - ms + 2 * de) +
      0.003996 * Math.sin(2 * (md + de)) +
      0.003665 * Math.sin(2 * de - 3 * md) +
      e * 0.002695 * Math.sin(2 * md - ms) +
      0.002602 * Math.sin(md - 2 * (f + de)) +
      e * 0.002396 * Math.sin(2 * (de - md) - ms) -
      0.002349 * Math.sin(md + de);
    l =
      l +
      e2 * 0.002249 * Math.sin(2 * (de - ms)) -
      e * 0.002125 * Math.sin(2 * md + ms) -
      e2 * 0.002079 * Math.sin(2 * ms) +
      e2 * 0.002059 * Math.sin(2 * (de - ms) - md) -
      0.001773 * Math.sin(md + 2 * (de - f)) -
      0.001595 * Math.sin(2 * (f + de)) +
      e * 0.00122 * Math.sin(4 * de - ms - md) -
      0.00111 * Math.sin(2 * (md + f)) +
      0.000892 * Math.sin(md - 3 * de);
    l =
      l -
      e * 0.000811 * Math.sin(ms + md + 2 * de) +
      e * 0.000761 * Math.sin(4 * de - ms - 2 * md) +
      e2 * 0.000704 * Math.sin(md - 2 * (ms + de)) +
      e * 0.000693 * Math.sin(ms - 2 * (md - de)) +
      e * 0.000598 * Math.sin(2 * (de - f) - ms) +
      0.00055 * Math.sin(md + 4 * de) +
      0.000538 * Math.sin(4 * md) +
      e * 0.000521 * Math.sin(4 * de - ms) +
      0.000486 * Math.sin(2 * md - de);
    l = l + e2 * 0.000717 * Math.sin(md - 2 * ms);

    let eclLon = ld + degToRad(l);
    eclLon = pfmod(eclLon, TWOPI);

    let g =
      5.12819 * Math.sin(f) +
      0.280606 * Math.sin(md + f) +
      0.277693 * Math.sin(md - f) +
      0.173238 * Math.sin(2 * de - f) +
      0.055413 * Math.sin(2 * de + f - md) +
      0.046272 * Math.sin(2 * de - f - md) +
      0.032573 * Math.sin(2 * de + f) +
      0.017198 * Math.sin(2 * md + f) +
      0.009267 * Math.sin(2 * de + md - f) +
      0.008823 * Math.sin(2 * md - f) +
      e * 0.008247 * Math.sin(2 * de - ms - f);
    g =
      g +
      0.004323 * Math.sin(2 * (de - md) - f) +
      0.0042 * Math.sin(2 * de + f + md) +
      e * 0.003372 * Math.sin(f - ms - 2 * de) +
      e * 0.002472 * Math.sin(2 * de + f - ms - md) +
      e * 0.002222 * Math.sin(2 * de + f - ms) +
      e * 0.002072 * Math.sin(2 * de - f - ms - md) +
      e * 0.001877 * Math.sin(f - ms + md) +
      0.001828 * Math.sin(4 * de - f - md) -
      e * 0.001803 * Math.sin(f + ms) -
      0.00175 * Math.sin(3 * f);
    g =
      g +
      e * 0.00157 * Math.sin(md - ms - f) -
      0.001487 * Math.sin(f + de) -
      e * 0.001481 * Math.sin(f + ms + md) +
      e * 0.001417 * Math.sin(f - ms - md) +
      e * 0.00135 * Math.sin(f - ms) +
      0.00133 * Math.sin(f - de) +
      0.001106 * Math.sin(f + 3 * md) +
      0.00102 * Math.sin(4 * de - f) +
      0.000833 * Math.sin(f + 4 * de - md) +
      0.000781 * Math.sin(md - 3 * f) +
      0.00067 * Math.sin(f + 4 * de - 2 * md);
    g =
      g +
      0.000606 * Math.sin(2 * de - 3 * f) +
      0.000597 * Math.sin(2 * (de + md) - f) +
      e * 0.000492 * Math.sin(2 * de + md - ms - f) +
      0.00045 * Math.sin(2 * (md - de) - f) +
      0.000439 * Math.sin(3 * md - f) +
      0.000423 * Math.sin(f + 2 * (de + md)) +
      0.000422 * Math.sin(2 * de - f - 3 * md) -
      e * 0.000367 * Math.sin(ms + f + 2 * de - md) -
      e * 0.000353 * Math.sin(ms + f + 2 * de) +
      0.000331 * Math.sin(f + 4 * de);
    g =
      g +
      e * 0.000317 * Math.sin(2 * de + f - ms + md) +
      e2 * 0.000306 * Math.sin(2 * (de - ms) - f) -
      0.000283 * Math.sin(md + 3 * f);

    const w1 = 0.0004664 * Math.cos(n);
    const w2 = 0.0000754 * Math.cos(c);
    const eclLat = degToRad(g) * (1.0 - w1 - w2);

    let hp =
      0.950724 +
      0.051818 * Math.cos(md) +
      0.009531 * Math.cos(2 * de - md) +
      0.007843 * Math.cos(2 * de) +
      0.002824 * Math.cos(2 * md) +
      0.000857 * Math.cos(2 * de + md) +
      e * 0.000533 * Math.cos(2 * de - ms) +
      e * 0.000401 * Math.cos(2 * de - md - ms) +
      e * 0.00032 * Math.cos(md - ms) -
      0.000271 * Math.cos(de) -
      e * 0.000264 * Math.cos(ms + md) -
      0.000198 * Math.cos(2 * f - md);
    hp =
      hp +
      0.000173 * Math.cos(3 * md) +
      0.000167 * Math.cos(4 * de - md) -
      e * 0.000111 * Math.cos(ms) +
      0.000103 * Math.cos(4 * de - 2 * md) -
      0.000084 * Math.cos(2 * md - 2 * de) -
      e * 0.000083 * Math.cos(2 * de + ms) +
      0.000079 * Math.cos(2 * de + 2 * md) +
      0.000072 * Math.cos(4 * de) +
      e * 0.000064 * Math.cos(2 * de - ms + md) -
      e * 0.000063 * Math.cos(2 * de + ms - md) +
      e * 0.000041 * Math.cos(ms + de);
    hp =
      hp +
      e * 0.000035 * Math.cos(2 * md - ms) -
      0.000033 * Math.cos(3 * md - 2 * de) -
      0.00003 * Math.cos(md + de) -
      0.000029 * Math.cos(2 * (f - de)) -
      e * 0.000029 * Math.cos(2 * md + ms) +
      e2 * 0.000026 * Math.cos(2 * (de - ms)) -
      0.000023 * Math.cos(2 * (f - de) + md) +
      e * 0.000019 * Math.cos(4 * de - ms - md);

    const horzPar = degToRad(hp);

    const distance = 6378.14 / Math.sin(horzPar);

    const eq = eclipticToEquatorial(eclLat, eclLon);
    let { a: RA, d: dec } = epochConvert(jd, J2000, eq.RA, eq.dec);

    // Corrections for internal coordinate system
    dec -= Math.PI / 2.0;
    RA += Math.PI;

    return fromPolar(RA, dec, distance);
  }

  getPeriod(): number {
    return 27.321661;
  }

  getBoundingRadius(): number {
    return 405504 * BoundingRadiusSlack;
  }
}

export function createMoonOrbit(): Orbit {
  return new MixedOrbit(
    new LunarOrbit(),
    yearToJD(-2000),
    yearToJD(4000),
    EarthMass + LunarMass
  );
}
