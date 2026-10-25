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
