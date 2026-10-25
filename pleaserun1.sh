#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib/ephemeris scripts

cat > package.json <<'EOF'
{
  "name": "celestia-web",
  "version": "0.1.0",
  "private": true,
  "license": "GPL-2.0-or-later",
  "scripts": {
    "dump": "tsx scripts/dump_positions.ts"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "tsx": "4.16.2",
    "typescript": "5.5.3"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["lib/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > lib/ephemeris/types.ts <<'EOF'
// types.ts
//
// Copyright (C) 2001-present, the Celestia Development Team
// Original version by Chris Laurel <claurel@gmail.com>
// TypeScript port for celestia-web
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BodyName =
  | 'Sun'
  | 'Mercury'
  | 'Venus'
  | 'Earth'
  | 'Moon'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune';

export const BODY_ORDER: readonly BodyName[] = [
  'Sun',
  'Mercury',
  'Venus',
  'Earth',
  'Moon',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
] as const;

export type VSOPTermTuple = [number, number, number];
export type VSOPJsonData = Record<string, VSOPTermTuple[]>;

export interface KeplerElements {
  semimajorAxis: number;
  eccentricity: number;
  inclination: number;
  longAscendingNode: number;
  argPericenter: number;
  meanAnomaly: number;
  period: number;
}

export interface OrbitSampleProc {
  sample(t: number, position: Vec3, velocity: Vec3): void;
}
EOF

cat > lib/ephemeris/math.ts <<'EOF'
// math.ts
// Ported from src/celmath/mathlib.h, src/celmath/geomutil.h, src/celmath/solve.h
//
// Copyright (C) 2001-2009, the Celestia Development Team
// Original version by Chris Laurel <claurel@shatters.net>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { Vec3 } from './types';

export function degToRad(d: number): number {
  return (d / 180.0) * Math.PI;
}

export function radToDeg(r: number): number {
  return r * 180.0 * (1.0 / Math.PI);
}

export function square(x: number): number {
  return x * x;
}

export function cube(x: number): number {
  return x * x * x;
}

export function sign(x: number): number {
  return x < 0.0 ? -1.0 : x > 0.0 ? 1.0 : 0.0;
}

// Always returns a positive value in the range [0, y)
export function pfmod(x: number, y: number): number {
  const quotient = Math.floor(Math.abs(x / y));
  return x < 0.0 ? x + (quotient + 1.0) * y : x - quotient * y;
}

export function solveIterationFixed(
  f: (x: number) => number,
  x0: number,
  maxIter: number
): [number, number] {
  let x = 0.0;
  let x2 = x0;
  for (let i = 0; i < maxIter; i++) {
    x = x2;
    x2 = f(x);
  }
  return [x2, x2 - x];
}

// Vector3 helpers matching Eigen::Vector3d
export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vecSquaredNorm(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vecNorm(v: Vec3): number {
  return Math.sqrt(vecSquaredNorm(v));
}

// Quaternion (w, x, y, z) and 3x3 Matrix matching Eigen::Quaterniond / Eigen::Matrix3d
export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

export function xRotation(radians: number): Quat {
  const half = radians * 0.5;
  return { w: Math.cos(half), x: Math.sin(half), y: 0.0, z: 0.0 };
}

export function yRotation(radians: number): Quat {
  const half = radians * 0.5;
  return { w: Math.cos(half), x: 0.0, y: Math.sin(half), z: 0.0 };
}

export function zRotation(radians: number): Quat {
  const half = radians * 0.5;
  return { w: Math.cos(half), x: 0.0, y: 0.0, z: Math.sin(half) };
}

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatToRotationMatrix(q: Quat): Mat3 {
  const tx = 2.0 * q.x;
  const ty = 2.0 * q.y;
  const tz = 2.0 * q.z;
  const twx = tx * q.w;
  const twy = ty * q.w;
  const twz = tz * q.w;
  const txx = tx * q.x;
  const txy = ty * q.x;
  const txz = tz * q.x;
  const tyy = ty * q.y;
  const tyz = tz * q.y;
  const tzz = tz * q.z;

  return [
    1.0 - (tyy + tzz), txy - twz, txz + twy,
    txy + twz, 1.0 - (txx + tzz), tyz - twx,
    txz - twy, tyz + twx, 1.0 - (txx + tyy),
  ];
}

export function mat3MulVec(m: Mat3, v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}
EOF

cat > lib/ephemeris/astro.ts <<'EOF'
// astro.ts
// Ported from src/celastro/astro.h, src/celastro/astro.cpp, src/celastro/date.h, src/celastro/date.cpp
//
// Copyright (C) 2001-present, the Celestia Development Team
// Original version by Chris Laurel <claurel@gmail.com>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { KeplerElements, Vec3 } from './types';
import {
  cube,
  degToRad,
  square,
  vecCross,
  vecDot,
  vecNorm,
  vecScale,
  vecSquaredNorm,
  vecSub,
} from './math';

export const J2000 = 2451545.0;
export const DAYS_PER_YEAR = 365.25;
export const SECONDS_PER_DAY = 86400.0;
export const MINUTES_PER_DAY = 1440.0;
export const HOURS_PER_DAY = 24.0;

export const J2000Obliquity = degToRad(23.4392911);
export const speedOfLight = 299792.458; // km/s
export const G = 6.67430e-11; // N m^2 / kg^2

export const SolarMass = 1.3271244e20 / G; // kg
export const EarthMass = 3.986004e14 / G; // kg
export const LunarMass = 7.346e22; // kg
export const JupiterMass = 1.2668653e17 / G; // kg

export const KM_PER_AU = 149597870.7;

export function AUtoKilometers(au: number): number {
  return au * KM_PER_AU;
}

export function kilometersToAU(km: number): number {
  return km / KM_PER_AU;
}

// Ported from Date::operator double() in src/celastro/date.cpp
export function dateToJulianDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  seconds: number = 0.0
): number {
  let y = year;
  let m = month;
  if (month <= 2) {
    y = year - 1;
    m = month + 12;
  }

  // Correct for the lost days in Oct 1582 when the Gregorian calendar
  // replaced the Julian calendar.
  let B = -2;
  if (
    year > 1582 ||
    (year === 1582 && (month > 10 || (month === 10 && day >= 15)))
  ) {
    B = Math.trunc(y / 400) - Math.trunc(y / 100);
  }

  return (
    Math.floor(365.25 * y) +
    Math.floor(30.6001 * (m + 1)) +
    B +
    1720996.5 +
    day +
    hour / HOURS_PER_DAY +
    minute / MINUTES_PER_DAY +
    seconds / SECONDS_PER_DAY
  );
}

export function yearToJD(year: number): number {
  return dateToJulianDate(year, 1, 1, 0, 0, 0.0);
}

// Ported from Date::Date(double jd) in src/celastro/date.cpp
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  seconds: number;
  wday: number;
}

export function julianDateToDate(jd: number): CalendarDate {
  const a = Math.trunc(Math.floor(jd + 0.5));
  const wday = (a + 1) % 7;
  let c: number;
  if (a < 2299161) {
    c = a + 1524;
  } else {
    const b = Math.trunc(Math.floor((a - 1867216.25) / 36524.25));
    c = a + b - Math.trunc(Math.floor(b / 4)) + 1525;
  }

  const d = Math.trunc(Math.floor((c - 122.1) / 365.25));
  const e = Math.trunc(Math.floor(365.25 * d));
  const f = Math.trunc(Math.floor((c - e) / 30.6001));

  const dday = c - e - Math.trunc(Math.floor(30.6001 * f)) + (jd + 0.5 - a);

  const month = Math.trunc(f - 1 - 12 * Math.trunc(f / 14));
  const year = Math.trunc(d - 4715 - Math.trunc((7.0 + month) / 10.0));
  const day = Math.trunc(dday);

  const dhour = (dday - day) * 24;
  const hour = Math.trunc(dhour);

  const dminute = (dhour - hour) * 60;
  const minute = Math.trunc(dminute);

  const seconds = (dminute - minute) * 60;

  return { year, month, day, hour, minute, seconds, wday };
}

export function anomaly(
  meanAnomaly: number,
  eccentricity: number
): { trueAnomaly: number; eccentricAnomaly: number } {
  const tol = 1.745e-8;
  let iterations = 20;

  let e =
    meanAnomaly - 2.0 * Math.PI * Math.trunc(meanAnomaly / (2.0 * Math.PI));
  let err = 1.0;
  while (Math.abs(err) > tol && iterations > 0) {
    err = e - eccentricity * Math.sin(e) - meanAnomaly;
    const delta = err / (1.0 - eccentricity * Math.cos(e));
    e -= delta;
    iterations--;
  }

  const trueAnomaly =
    2.0 *
    Math.atan(
      Math.sqrt((1.0 + eccentricity) / (1.0 - eccentricity)) * Math.tan(0.5 * e)
    );
  const eccentricAnomaly = e;
  return { trueAnomaly, eccentricAnomaly };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Ported from StateVectorToElements in src/celastro/astro.cpp
export function stateVectorToElements(
  r: Vec3,
  v: Vec3,
  mu: number
): KeplerElements {
  const tolerance = 1e-9;

  const h = vecCross(r, v);
  const rNorm = vecNorm(r);
  const hNorm = vecNorm(h);

  const result: KeplerElements = {
    semimajorAxis: 0.0,
    eccentricity: 0.0,
    inclination: 0.0,
    longAscendingNode: 0.0,
    argPericenter: 0.0,
    meanAnomaly: 0.0,
    period: 0.0,
  };

  // Compute eccentricity: evec = (v x h) / mu - r / rNorm
  const evec = vecSub(vecScale(vecCross(v, h), 1.0 / mu), vecScale(r, 1.0 / rNorm));
  result.eccentricity = vecNorm(evec);

  // Compute inclination
  result.inclination = Math.acos(clamp(h.y / hNorm, -1.0, 1.0));

  // Normal vector (UnitY x h) = (h.z, 0, -h.x)
  const nvec: Vec3 = { x: h.z, y: 0.0, z: -h.x };
  const nNorm = vecNorm(nvec);

  // compute longAscendingNode and argPericenter
  if (result.inclination < tolerance) {
    // handle face-on orbit: by convention Omega = 0.0
    if (result.eccentricity >= tolerance) {
      result.argPericenter = Math.acos(
        clamp(evec.x / result.eccentricity, -1.0, 1.0)
      );
      if (evec.z >= 0.0) {
        result.argPericenter = -result.argPericenter;
      }
    }
  } else {
    result.longAscendingNode = Math.acos(clamp(nvec.x / nNorm, -1.0, 1.0));
    if (nvec.z >= 0.0) {
      result.longAscendingNode = -result.longAscendingNode;
    }
    if (result.eccentricity >= tolerance) {
      result.argPericenter = Math.acos(
        clamp(vecDot(nvec, evec) / (nNorm * result.eccentricity), -1.0, 1.0)
      );
      if (evec.y < 0.0) {
        result.argPericenter = -result.argPericenter;
      }
    }
  }

  // compute true anomaly
  let nu: number;
  if (result.eccentricity >= tolerance) {
    nu = Math.acos(
      clamp(vecDot(evec, r) / (result.eccentricity * rNorm), -1.0, 1.0)
    );
    if (vecDot(r, v) < 0.0) {
      nu = -nu;
    }
  } else {
    if (result.inclination < tolerance) {
      // circular face-on orbit
      nu = Math.acos(r.x / rNorm);
      if (v.x > 0.0) {
        nu = -nu;
      }
    } else {
      nu = Math.acos(clamp(vecDot(nvec, r) / (nNorm * rNorm), -1.0, 1.0));
      if (vecDot(nvec, v) > 0.0) {
        nu = -nu;
      }
    }
  }

  const s_nu = Math.sin(nu);
  const c_nu = Math.cos(nu);

  // compute mean anomaly
  const e2 = square(result.eccentricity);
  if (result.eccentricity < 1.0) {
    const E = Math.atan2(
      Math.sqrt(1.0 - e2) * s_nu,
      result.eccentricity + c_nu
    );
    result.meanAnomaly = E - result.eccentricity * Math.sin(E);
  } else {
    const sinhE =
      (Math.sqrt(e2 - 1.0) * s_nu) / (1.0 + result.eccentricity * c_nu);
    const E = Math.asinh(sinhE);
    result.meanAnomaly = result.eccentricity * sinhE - E;
  }

  // compute semimajor axis
  result.semimajorAxis = 1.0 / (2.0 / rNorm - vecSquaredNorm(v) / mu);
  result.period =
    2.0 * Math.PI * Math.sqrt(cube(Math.abs(result.semimajorAxis)) / mu);

  return result;
}
EOF

cat > lib/ephemeris/orbit.ts <<'EOF'
// orbit.ts
// Ported from src/celephem/orbit.h and src/celephem/orbit.cpp
//
// Copyright (C) 2001-2009, the Celestia Development Team
// Original version by Chris Laurel <claurel@gmail.com>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { KeplerElements, OrbitSampleProc, Vec3 } from './types';
import { G, KM_PER_AU, stateVectorToElements } from './astro';
import {
  Mat3,
  mat3MulVec,
  quatMul,
  quatToRotationMatrix,
  sign,
  solveIterationFixed,
  square,
  vec3,
  vecAdd,
  vecNorm,
  vecScale,
  vecSub,
  xRotation,
  zRotation,
} from './math';

const ORBITAL_VELOCITY_DIFF_DELTA = 1.0 / 1440.0;
const HyperbolicMinBoundingRadius = 1000.0 * KM_PER_AU;

function cubicInterpolate(
  p0: Vec3,
  v0: Vec3,
  p1: Vec3,
  v1: Vec3,
  t: number
): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  // p0 + (((2.0 * (p0 - p1) + v1 + v0) * t^3) + ((3.0 * (p1 - p0) - 2.0 * v0 - v1) * t^2) + (v0 * t))
  const a = vecAdd(vecAdd(vecScale(vecSub(p0, p1), 2.0), v1), v0);
  const b = vecSub(vecSub(vecScale(vecSub(p1, p0), 3.0), vecScale(v0, 2.0)), v1);
  return vecAdd(
    p0,
    vecAdd(vecAdd(vecScale(a, t3), vecScale(b, t2)), vecScale(v0, t))
  );
}

function solveKeplerFunc1(ecc: number, M: number): (x: number) => number {
  return (x: number) => M + ecc * Math.sin(x);
}

function solveKeplerFunc2(ecc: number, M: number): (x: number) => number {
  return (x: number) => {
    const s = Math.sin(x);
    const c = Math.cos(x);
    return x + (M + ecc * s - x) / (1.0 - ecc * c);
  };
}

function solveKeplerLaguerreConway(
  ecc: number,
  M: number
): (x: number) => number {
  return (x: number) => {
    const s = ecc * Math.sin(x);
    const c = ecc * Math.cos(x);
    const f = x - s - M;
    const f1 = 1.0 - c;
    const f2 = s;
    x +=
      (-5.0 * f) /
      (f1 + sign(f1) * Math.sqrt(Math.abs(16.0 * f1 * f1 - 20.0 * f * f2)));
    return x;
  };
}

function solveKeplerLaguerreConwayHyp(
  ecc: number,
  M: number
): (x: number) => number {
  return (x: number) => {
    const s = ecc * Math.sinh(x);
    const c = ecc * Math.cosh(x);
    const f = s - x - M;
    const f1 = c - 1.0;
    const f2 = s;
    x +=
      (-5.0 * f) /
      (f1 + sign(f1) * Math.sqrt(Math.abs(16.0 * f1 * f1 - 20.0 * f * f2)));
    return x;
  };
}

export interface AdaptiveSamplingParameters {
  tolerance: number;
  startStep: number;
  minStep: number;
  maxStep: number;
}

export abstract class Orbit {
  abstract positionAtTime(jd: number): Vec3;

  velocityAtTime(tdb: number): Vec3 {
    const p0 = this.positionAtTime(tdb);
    const p1 = this.positionAtTime(tdb + ORBITAL_VELOCITY_DIFF_DELTA);
    return vecScale(vecSub(p1, p0), 1.0 / ORBITAL_VELOCITY_DIFF_DELTA);
  }

  abstract getPeriod(): number;
  abstract getBoundingRadius(): number;

  isPeriodic(): boolean {
    return true;
  }

  getValidRange(): { begin: number; end: number } {
    return { begin: 0.0, end: 0.0 };
  }

  sample(startTime: number, endTime: number, proc: OrbitSampleProc): void {
    let span = 0.0;
    if (this.isPeriodic()) {
      span = this.getPeriod();
    } else {
      const { begin: startValidInterval, end: endValidInterval } =
        this.getValidRange();
      if (startValidInterval === endValidInterval) {
        span = endValidInterval - startValidInterval;
      } else {
        span = endTime - startTime;
      }
    }

    const samplingParams: AdaptiveSamplingParameters = {
      tolerance: 1.0,
      maxStep: span / 100.0,
      minStep: span / 1.0e7,
      startStep: span / 1.0e5,
    };

    this.adaptiveSample(startTime, endTime, proc, samplingParams);
  }

  protected adaptiveSample(
    startTime: number,
    endTime: number,
    proc: OrbitSampleProc,
    samplingParams: AdaptiveSamplingParameters
  ): void {
    const startStepSize = samplingParams.startStep;
    let maxStepSize = samplingParams.maxStep;
    const minStepSize = samplingParams.minStep;
    const tolerance = samplingParams.tolerance;
    let t = startTime;
    const stepFactor = 1.25;

    let lastP = this.positionAtTime(t);
    let lastV = this.velocityAtTime(t);
    proc.sample(t, lastP, lastV);

    while (t < endTime) {
      maxStepSize = Math.min(maxStepSize, endTime - t);
      let dt = Math.min(maxStepSize, startStepSize * 2.0);

      let p1 = this.positionAtTime(t + dt);
      let v1 = this.velocityAtTime(t + dt);

      let tmid = t + dt / 2.0;
      let pTest = this.positionAtTime(tmid);
      let pInterp = cubicInterpolate(
        lastP,
        vecScale(lastV, dt),
        p1,
        vecScale(v1, dt),
        0.5
      );

      let positionError = vecNorm(vecSub(pInterp, pTest));

      if (positionError > tolerance) {
        while (positionError > tolerance && dt > minStepSize) {
          dt /= stepFactor;

          p1 = this.positionAtTime(t + dt);
          v1 = this.velocityAtTime(t + dt);

          tmid = t + dt / 2.0;
          pTest = this.positionAtTime(tmid);
          pInterp = cubicInterpolate(
            lastP,
            vecScale(lastV, dt),
            p1,
            vecScale(v1, dt),
            0.5
          );

          positionError = vecNorm(vecSub(pInterp, pTest));
        }
      } else {
        while (positionError < tolerance && dt < maxStepSize) {
          dt *= stepFactor;

          p1 = this.positionAtTime(t + dt);
          v1 = this.velocityAtTime(t + dt);

          tmid = t + dt / 2.0;
          pTest = this.positionAtTime(tmid);
          pInterp = cubicInterpolate(
            lastP,
            vecScale(lastV, dt),
            p1,
            vecScale(v1, dt),
            0.5
          );

          positionError = vecNorm(vecSub(pInterp, pTest));
        }
      }

      t = t + dt;
      lastP = p1;
      lastV = v1;

      proc.sample(t, lastP, lastV);
    }
  }
}

export class EllipticalOrbit extends Orbit {
  private semiMajorAxis: number;
  private semiMinorAxis: number;
  private eccentricity: number;
  private meanAnomalyAtEpoch: number;
  private period: number;
  private epoch: number;
  private orbitPlaneRotation: Mat3;

  constructor(elements: KeplerElements, epoch: number = 2451545.0) {
    super();
    this.semiMajorAxis = elements.semimajorAxis;
    this.eccentricity = elements.eccentricity;
    this.meanAnomalyAtEpoch = elements.meanAnomaly;
    this.period = elements.period;
    this.epoch = epoch;

    const q = quatMul(
      quatMul(
        zRotation(elements.longAscendingNode),
        xRotation(elements.inclination)
      ),
      zRotation(elements.argPericenter)
    );
    this.orbitPlaneRotation = quatToRotationMatrix(q);
    this.semiMinorAxis =
      this.semiMajorAxis * Math.sqrt(1.0 - square(this.eccentricity));
  }

  private eccentricAnomaly(M: number): number {
    if (this.eccentricity === 0.0) {
      return M;
    }
    if (this.eccentricity < 0.2) {
      return solveIterationFixed(
        solveKeplerFunc1(this.eccentricity, M),
        M,
        5
      )[0];
    }
    if (this.eccentricity < 0.9) {
      return solveIterationFixed(
        solveKeplerFunc2(this.eccentricity, M),
        M,
        6
      )[0];
    }

    const E = M + 0.85 * this.eccentricity * sign(Math.sin(M));
    return solveIterationFixed(
      solveKeplerLaguerreConway(this.eccentricity, M),
      E,
      8
    )[0];
  }

  private positionAtE(E: number): Vec3 {
    const x = this.semiMajorAxis * (Math.cos(E) - this.eccentricity);
    const y = this.semiMinorAxis * Math.sin(E);

    const p = mat3MulVec(this.orbitPlaneRotation, vec3(x, y, 0.0));

    // Convert to Celestia's internal coordinate system
    return vec3(p.x, p.z, -p.y);
  }

  private velocityAtE(E: number, meanMotion: number): Vec3 {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);

    const edot = meanMotion / (1.0 - this.eccentricity * cosE);

    const x = -this.semiMajorAxis * sinE * edot;
    const y = this.semiMinorAxis * cosE * edot;

    const v = mat3MulVec(this.orbitPlaneRotation, vec3(x, y, 0.0));

    // Convert to Celestia's coordinate system
    return vec3(v.x, v.z, -v.y);
  }

  positionAtTime(t: number): Vec3 {
    t = t - this.epoch;
    const meanMotion = (2.0 * Math.PI) / this.period;
    const meanAnomaly = this.meanAnomalyAtEpoch + t * meanMotion;
    const E = this.eccentricAnomaly(meanAnomaly);

    return this.positionAtE(E);
  }

  override velocityAtTime(t: number): Vec3 {
    t = t - this.epoch;
    const meanMotion = (2.0 * Math.PI) / this.period;
    const meanAnomaly = this.meanAnomalyAtEpoch + t * meanMotion;
    const E = this.eccentricAnomaly(meanAnomaly);

    return this.velocityAtE(E, meanMotion);
  }

  getPeriod(): number {
    return this.period;
  }

  getBoundingRadius(): number {
    return this.semiMajorAxis * (1.0 + this.eccentricity);
  }
}

export class HyperbolicOrbit extends Orbit {
  private semiMajorAxis: number;
  private semiMinorAxis: number;
  private eccentricity: number;
  private meanAnomalyAtEpoch: number;
  private meanMotion: number;
  private epoch: number;
  private startEpoch: number;
  private endEpoch: number;
  private orbitPlaneRotation: Mat3;

  constructor(elements: KeplerElements, epoch: number = 2451545.0) {
    super();
    this.semiMajorAxis = elements.semimajorAxis;
    this.eccentricity = elements.eccentricity;
    this.meanAnomalyAtEpoch = elements.meanAnomaly;
    this.epoch = epoch;

    const q = quatMul(
      quatMul(
        zRotation(elements.longAscendingNode),
        xRotation(elements.inclination)
      ),
      zRotation(elements.argPericenter)
    );
    this.orbitPlaneRotation = quatToRotationMatrix(q);

    this.semiMinorAxis =
      this.semiMajorAxis * Math.sqrt(square(this.eccentricity) - 1.0);
    this.meanMotion = (2.0 * Math.PI) / elements.period;

    const pericenterDistance = this.semiMajorAxis * (1.0 - this.eccentricity);
    const boundingRadius = this.getBoundingRadius();
    const cosTrueAnomaly =
      (pericenterDistance / boundingRadius - 1.0) / this.eccentricity;
    const eccAnomaly = Math.acosh(
      (this.eccentricity + cosTrueAnomaly) /
        (1.0 + this.eccentricity * cosTrueAnomaly)
    );
    const meanAnomaly = this.eccentricity * Math.sinh(eccAnomaly) - eccAnomaly;
    const deltaT = Math.abs(meanAnomaly / this.meanMotion);
    this.startEpoch = this.epoch - deltaT;
    this.endEpoch = this.epoch + deltaT;
  }

  private eccentricAnomaly(M: number): number {
    if (M === 0.0) {
      return 0.0;
    }
    const E = Math.log((2.0 * Math.abs(M)) / this.eccentricity + 1.85);
    const solved = solveIterationFixed(
      solveKeplerLaguerreConwayHyp(this.eccentricity, Math.abs(M)),
      E,
      30
    )[0];
    return M < 0.0 ? -Math.abs(solved) : Math.abs(solved);
  }

  private positionAtE(E: number): Vec3 {
    const x = -this.semiMajorAxis * (this.eccentricity - Math.cosh(E));
    const y = -this.semiMinorAxis * Math.sinh(E);

    const p = mat3MulVec(this.orbitPlaneRotation, vec3(x, y, 0.0));

    return vec3(p.x, p.z, -p.y);
  }

  private velocityAtE(E: number): Vec3 {
    const coshE = Math.cosh(E);
    const edot = this.meanMotion / (this.eccentricity * coshE - 1.0);

    const x = this.semiMajorAxis * Math.sinh(E) * edot;
    const y = -this.semiMinorAxis * coshE * edot;

    const v = mat3MulVec(this.orbitPlaneRotation, vec3(x, y, 0.0));

    return vec3(v.x, v.z, -v.y);
  }

  positionAtTime(t: number): Vec3 {
    t = t - this.epoch;
    const meanAnomaly = this.meanAnomalyAtEpoch + t * this.meanMotion;
    const E = this.eccentricAnomaly(meanAnomaly);

    return this.positionAtE(E);
  }

  override velocityAtTime(t: number): Vec3 {
    t = t - this.epoch;
    const meanAnomaly = this.meanAnomalyAtEpoch + t * this.meanMotion;
    const E = this.eccentricAnomaly(meanAnomaly);

    return this.velocityAtE(E);
  }

  getPeriod(): number {
    return this.endEpoch - this.startEpoch;
  }

  getBoundingRadius(): number {
    return Math.max(
      2.0 * this.semiMajorAxis * (1.0 - this.eccentricity),
      HyperbolicMinBoundingRadius
    );
  }

  override isPeriodic(): boolean {
    return false;
  }

  override getValidRange(): { begin: number; end: number } {
    return { begin: this.startEpoch, end: this.endEpoch };
  }
}

export function createKeplerOrbit(
  elements: KeplerElements,
  epoch: number
): Orbit {
  if (elements.eccentricity < 1.0) {
    return new EllipticalOrbit(elements, epoch);
  }
  return new HyperbolicOrbit(elements, epoch);
}

export abstract class CachingOrbit extends Orbit {
  private lastPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private lastVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  private lastTime: number = -1.0e30;
  private positionCacheValid: boolean = false;
  private velocityCacheValid: boolean = false;

  abstract computePosition(jd: number): Vec3;

  computeVelocity(jd: number): Vec3 {
    const p0 = this.positionAtTime(jd);
    const p1 = this.computePosition(jd + ORBITAL_VELOCITY_DIFF_DELTA);
    return vecScale(vecSub(p1, p0), 1.0 / ORBITAL_VELOCITY_DIFF_DELTA);
  }

  positionAtTime(jd: number): Vec3 {
    if (jd !== this.lastTime) {
      this.lastTime = jd;
      this.lastPosition = this.computePosition(jd);
      this.positionCacheValid = true;
      this.velocityCacheValid = false;
    } else if (!this.positionCacheValid) {
      this.lastPosition = this.computePosition(jd);
      this.positionCacheValid = true;
    }

    return this.lastPosition;
  }

  override velocityAtTime(jd: number): Vec3 {
    if (jd !== this.lastTime) {
      this.lastVelocity = this.computeVelocity(jd);
      this.lastTime = jd;
      this.positionCacheValid = false;
      this.velocityCacheValid = true;
    } else if (!this.velocityCacheValid) {
      this.lastVelocity = this.computeVelocity(jd);
      this.velocityCacheValid = true;
    }

    return this.lastVelocity;
  }
}

export class MixedOrbit extends Orbit {
  private primary: Orbit;
  private afterApprox: Orbit;
  private beforeApprox: Orbit;
  private begin: number;
  private end: number;
  private boundingRadius: number;

  constructor(orbit: Orbit, t0: number, t1: number, mass: number) {
    super();
    this.primary = orbit;
    this.begin = t0;
    this.end = t1;

    const dt = 1.0 / 1440.0; // 1 minute
    const p0 = this.primary.positionAtTime(t0);
    const p1 = this.primary.positionAtTime(t1);
    const v0 = vecScale(
      vecSub(this.primary.positionAtTime(t0 + dt), p0),
      1.0 / dt
    );
    const v1 = vecScale(
      vecSub(this.primary.positionAtTime(t1 + dt), p1),
      1.0 / dt
    );

    const G_km_day = G * square(86400.0) * 1e-9; // convert to km/day
    const Gmass = G_km_day * mass;

    const keplerElementsBefore = stateVectorToElements(p0, v0, Gmass);
    this.beforeApprox = createKeplerOrbit(keplerElementsBefore, t0);

    const keplerElementsAfter = stateVectorToElements(p1, v1, Gmass);
    this.afterApprox = createKeplerOrbit(keplerElementsAfter, t1);

    this.boundingRadius = this.beforeApprox.getBoundingRadius();
    if (this.primary.getBoundingRadius() > this.boundingRadius) {
      this.boundingRadius = this.primary.getBoundingRadius();
    }
    if (this.afterApprox.getBoundingRadius() > this.boundingRadius) {
      this.boundingRadius = this.afterApprox.getBoundingRadius();
    }
  }

  positionAtTime(jd: number): Vec3 {
    if (jd < this.begin) {
      return this.beforeApprox.positionAtTime(jd);
    } else if (jd < this.end) {
      return this.primary.positionAtTime(jd);
    } else {
      return this.afterApprox.positionAtTime(jd);
    }
  }

  override velocityAtTime(jd: number): Vec3 {
    if (jd < this.begin) {
      return this.beforeApprox.velocityAtTime(jd);
    } else if (jd < this.end) {
      return this.primary.velocityAtTime(jd);
    } else {
      return this.afterApprox.velocityAtTime(jd);
    }
  }

  getPeriod(): number {
    return this.primary.getPeriod();
  }

  getBoundingRadius(): number {
    return this.boundingRadius;
  }

  override sample(
    startTime: number,
    endTime: number,
    proc: OrbitSampleProc
  ): void {
    let o: Orbit;
    if (startTime < this.begin) {
      o = this.beforeApprox;
    } else if (startTime < this.end) {
      o = this.primary;
    } else {
      o = this.afterApprox;
    }
    o.sample(startTime, endTime, proc);
  }
}
EOF

cat > lib/ephemeris/vsop87.ts <<'EOF'
// vsop87.ts
// Ported from src/celephem/vsop87.h and vsop87_code.cpp
//
// Copyright (C) 2002, Chris Laurel <claurel@shatters.net>
//
// Implementation of the VSOP87 theory for the orbits of the
// major planets.
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { OrbitSampleProc, Vec3, VSOPJsonData, VSOPTermTuple } from './types';
import { KM_PER_AU, SolarMass, yearToJD } from './astro';
import { vec3 } from './math';
import { AdaptiveSamplingParameters, CachingOrbit, MixedOrbit, Orbit } from './orbit';

type VSOPSeries = readonly VSOPTermTuple[];

function sumSeries(series: VSOPSeries, t: number): number {
  if (!series || series.length === 0) {
    return 0.0;
  }

  let x = 0.0;
  for (let i = 0; i < series.length; i++) {
    const term = series[i];
    x += term[0] * Math.cos(term[1] + term[2] * t);
  }

  return x;
}

export class VSOP87Orbit extends CachingOrbit {
  private vsL: readonly VSOPSeries[];
  private vsB: readonly VSOPSeries[];
  private vsR: readonly VSOPSeries[];
  private period: number;
  private boundingRadius: number;

  constructor(
    vsL: readonly VSOPSeries[],
    vsB: readonly VSOPSeries[],
    vsR: readonly VSOPSeries[],
    period: number,
    boundingRadius: number
  ) {
    super();
    this.vsL = vsL;
    this.vsB = vsB;
    this.vsR = vsR;
    this.period = period;
    this.boundingRadius = boundingRadius;
  }

  getPeriod(): number {
    return this.period;
  }

  getBoundingRadius(): number {
    return this.boundingRadius;
  }

  computePosition(jd: number): Vec3 {
    // t is Julian millenia since J2000.0
    const t = (jd - 2451545.0) / 365250.0;

    // Heliocentric coordinates
    let l = 0.0; // longitude
    let b = 0.0; // latitude
    let r = 0.0; // radius

    let T: number;

    // Evaluate series for l
    T = 1.0;
    for (const lSeries of this.vsL) {
      l += sumSeries(lSeries, t) * T;
      T *= t;
    }

    // Evaluate series for b
    T = 1.0;
    for (const bSeries of this.vsB) {
      b += sumSeries(bSeries, t) * T;
      T *= t;
    }

    // Evaluate series for r
    T = 1.0;
    for (const rSeries of this.vsR) {
      r += sumSeries(rSeries, t) * T;
      T *= t;
    }

    r *= KM_PER_AU;

    // Corrections for internal coordinate system
    b -= Math.PI / 2.0;
    l += Math.PI;

    return vec3(
      Math.cos(l) * Math.sin(b) * r,
      Math.cos(b) * r,
      -Math.sin(l) * Math.sin(b) * r
    );
  }

  override sample(
    startTime: number,
    endTime: number,
    proc: OrbitSampleProc
  ): void {
    const span = this.getPeriod();

    const samplingParams: AdaptiveSamplingParameters = {
      tolerance: 1.0,
      startStep: span / 150.0,
      minStep: span / 150.0,
      maxStep: span / 150.0,
    };

    this.adaptiveSample(startTime, endTime, proc, samplingParams);
  }
}

export class VSOP87OrbitRect extends CachingOrbit {
  private vsX: readonly VSOPSeries[];
  private vsY: readonly VSOPSeries[];
  private vsZ: readonly VSOPSeries[];
  private period: number;
  private boundingRadius: number;

  constructor(
    vsX: readonly VSOPSeries[],
    vsY: readonly VSOPSeries[],
    vsZ: readonly VSOPSeries[],
    period: number,
    boundingRadius: number
  ) {
    super();
    this.vsX = vsX;
    this.vsY = vsY;
    this.vsZ = vsZ;
    this.period = period;
    this.boundingRadius = boundingRadius;
  }

  getPeriod(): number {
    return this.period;
  }

  override isPeriodic(): boolean {
    return this.period !== 0.0;
  }

  getBoundingRadius(): number {
    return this.boundingRadius;
  }

  computePosition(jd: number): Vec3 {
    // t is Julian millenia since J2000.0
    const t = (jd - 2451545.0) / 365250.0;

    let vx = 0.0;
    let vy = 0.0;
    let vz = 0.0;

    let T: number;

    // Evaluate series for x
    T = 1.0;
    for (const xSeries of this.vsX) {
      vx += sumSeries(xSeries, t) * T;
      T *= t;
    }

    // Evaluate series for y
    T = 1.0;
    for (const ySeries of this.vsY) {
      vy += sumSeries(ySeries, t) * T;
      T *= t;
    }

    // Evaluate series for z
    T = 1.0;
    for (const zSeries of this.vsZ) {
      vz += sumSeries(zSeries, t) * T;
      T *= t;
    }

    vx *= KM_PER_AU;
    vy *= KM_PER_AU;
    vz *= KM_PER_AU;

    // Corrections for internal coordinate system
    return vec3(vx, vz, -vy);
  }
}

function makeVSOP87Orbit(orbit: Orbit, t0: number, t1: number): Orbit {
  return new MixedOrbit(orbit, yearToJD(t0), yearToJD(t1), SolarMass);
}

function getSeriesList(
  data: VSOPJsonData,
  keys: readonly string[]
): VSOPSeries[] {
  return keys.map((k) => data[k] ?? []);
}

// Series definitions matching vsop87_code.cpp exactly
export function createVSOP87MercuryOrbit(data: VSOPJsonData): Orbit {
  const L = getSeriesList(data, [
    'mercury_L0',
    'mercury_L1',
    'mercury_L2',
    'mercury_L3',
    'mercury_L4',
    'mercury_L5',
  ]);
  const B = getSeriesList(data, [
    'mercury_B0',
    'mercury_B1',
    'mercury_B2',
    'mercury_B3',
    'mercury_B4',
    'mercury_B5',
  ]);
  const R = getSeriesList(data, [
    'mercury_R0',
    'mercury_R1',
    'mercury_R2',
    'mercury_R3',
    'mercury_R4',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 0.2408 * 365.25, 60000000.0),
    -4000,
    4000
  );
}

export function createVSOP87VenusOrbit(data: VSOPJsonData): Orbit {
  const L = getSeriesList(data, [
    'venus_L0',
    'venus_L1',
    'venus_L2',
    'venus_L3',
    'venus_L4',
    'venus_L5',
  ]);
  const B = getSeriesList(data, [
    'venus_B0',
    'venus_B1',
    'venus_B2',
    'venus_B3',
    'venus_B4',
    'venus_B5',
  ]);
  const R = getSeriesList(data, [
    'venus_R0',
    'venus_R1',
    'venus_R2',
    'venus_R3',
    'venus_R4',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 0.6152 * 365.25,
