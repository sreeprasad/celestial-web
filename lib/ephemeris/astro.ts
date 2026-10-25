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
