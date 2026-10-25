// vsop87.ts
// Ported from src/celephem/vsop87.h and src/celephem/vsop87.cpp
//
// Copyright (C) 2002, Chris Laurel <claurel@shatters.net>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { OrbitSampleProc, Vec3, VSOPJsonData, VSOPTermTuple } from './types';
import { KM_PER_AU, SolarMass, yearToJD } from './astro';
import { vec3 } from './math';
import {
  AdaptiveSamplingParameters,
  CachingOrbit,
  MixedOrbit,
  Orbit,
} from './orbit';

let cachedVsopData: VSOPJsonData | null = null;

export function setVSOP87Data(data: VSOPJsonData): void {
  cachedVsopData = data;
}

function getVSOP87Data(): VSOPJsonData {
  if (cachedVsopData) {
    return cachedVsopData;
  }
  throw new Error('VSOP87 data not loaded: call setVSOP87Data() with the parsed vsop87.json first');
}

function getSeriesList(keys: string[]): VSOPTermTuple[][] {
  const data = getVSOP87Data();
  return keys.map((key) => {
    const series = data[key];
    if (!series) {
      throw new Error(`vsop87.json is missing table ${key}`);
    }
    return series;
  });
}

function sumSeries(series: VSOPTermTuple[], t: number): number {
  if (series.length === 0) {
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
  private vsL: VSOPTermTuple[][];
  private vsB: VSOPTermTuple[][];
  private vsR: VSOPTermTuple[][];
  private period: number;
  private boundingRadius: number;

  constructor(
    vsL: VSOPTermTuple[][],
    vsB: VSOPTermTuple[][],
    vsR: VSOPTermTuple[][],
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

    let T = 1.0;
    for (const lSeries of this.vsL) {
      l += sumSeries(lSeries, t) * T;
      T *= t;
    }

    T = 1.0;
    for (const bSeries of this.vsB) {
      b += sumSeries(bSeries, t) * T;
      T *= t;
    }

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
    const startStep = span / 150.0;

    const samplingParams: AdaptiveSamplingParameters = {
      tolerance: 1.0,
      startStep,
      minStep: startStep,
      maxStep: startStep,
    };

    this.adaptiveSample(startTime, endTime, proc, samplingParams);
  }
}

export class VSOP87OrbitRect extends CachingOrbit {
  private vsX: VSOPTermTuple[][];
  private vsY: VSOPTermTuple[][];
  private vsZ: VSOPTermTuple[][];
  private period: number;
  private boundingRadius: number;

  constructor(
    vsX: VSOPTermTuple[][],
    vsY: VSOPTermTuple[][],
    vsZ: VSOPTermTuple[][],
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

    let T = 1.0;
    for (const xSeries of this.vsX) {
      vx += sumSeries(xSeries, t) * T;
      T *= t;
    }

    T = 1.0;
    for (const ySeries of this.vsY) {
      vy += sumSeries(ySeries, t) * T;
      T *= t;
    }

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

export function createVSOP87MercuryOrbit(): Orbit {
  const L = getSeriesList([
    'mercury_L0',
    'mercury_L1',
    'mercury_L2',
    'mercury_L3',
    'mercury_L4',
    'mercury_L5',
  ]);
  const B = getSeriesList([
    'mercury_B0',
    'mercury_B1',
    'mercury_B2',
    'mercury_B3',
    'mercury_B4',
    'mercury_B5',
  ]);
  const R = getSeriesList([
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

export function createVSOP87VenusOrbit(): Orbit {
  const L = getSeriesList([
    'venus_L0',
    'venus_L1',
    'venus_L2',
    'venus_L3',
    'venus_L4',
    'venus_L5',
  ]);
  const B = getSeriesList([
    'venus_B0',
    'venus_B1',
    'venus_B2',
    'venus_B3',
    'venus_B4',
    'venus_B5',
  ]);
  const R = getSeriesList([
    'venus_R0',
    'venus_R1',
    'venus_R2',
    'venus_R3',
    'venus_R4',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 0.6152 * 365.25, 100000000.0),
    -4000,
    4000
  );
}

export function createVSOP87EarthOrbit(): Orbit {
  const L = getSeriesList([
    'earth_L0',
    'earth_L1',
    'earth_L2',
    'earth_L3',
    'earth_L4',
    'earth_L5',
  ]);
  const B = getSeriesList(['earth_B0', 'earth_B1', 'earth_B2']);
  const R = getSeriesList([
    'earth_R0',
    'earth_R1',
    'earth_R2',
    'earth_R3',
    'earth_R4',
    'earth_R5',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 365.25, 160000000.0),
    -4000,
    4000
  );
}

export function createVSOP87MarsOrbit(): Orbit {
  const L = getSeriesList([
    'mars_L0',
    'mars_L1',
    'mars_L2',
    'mars_L3',
    'mars_L4',
    'mars_L5',
  ]);
  const B = getSeriesList([
    'mars_B0',
    'mars_B1',
    'mars_B2',
    'mars_B3',
    'mars_B4',
    'mars_B5',
  ]);
  const R = getSeriesList([
    'mars_R0',
    'mars_R1',
    'mars_R2',
    'mars_R3',
    'mars_R4',
    'mars_R5',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 1.8809 * 365.25, 240000000.0),
    -4000,
    4000
  );
}

export function createVSOP87JupiterOrbit(): Orbit {
  const L = getSeriesList([
    'jupiter_L0',
    'jupiter_L1',
    'jupiter_L2',
    'jupiter_L3',
    'jupiter_L4',
    'jupiter_L5',
  ]);
  const B = getSeriesList([
    'jupiter_B0',
    'jupiter_B1',
    'jupiter_B2',
    'jupiter_B3',
    'jupiter_B4',
    'jupiter_B5',
  ]);
  const R = getSeriesList([
    'jupiter_R0',
    'jupiter_R1',
    'jupiter_R2',
    'jupiter_R3',
    'jupiter_R4',
    'jupiter_R5',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 11.86 * 365.25, 800000000.0),
    -4000,
    4000
  );
}

export function createVSOP87SaturnOrbit(): Orbit {
  const L = getSeriesList([
    'saturn_L0',
    'saturn_L1',
    'saturn_L2',
    'saturn_L3',
    'saturn_L4',
    'saturn_L5',
  ]);
  const B = getSeriesList([
    'saturn_B0',
    'saturn_B1',
    'saturn_B2',
    'saturn_B3',
    'saturn_B4',
    'saturn_B5',
  ]);
  const R = getSeriesList([
    'saturn_R0',
    'saturn_R1',
    'saturn_R2',
    'saturn_R3',
    'saturn_R4',
    'saturn_R5',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 29.4577 * 365.25, 1.5e9),
    -4000,
    4000
  );
}

export function createVSOP87UranusOrbit(): Orbit {
  const L = getSeriesList([
    'uranus_L0',
    'uranus_L1',
    'uranus_L2',
    'uranus_L3',
    'uranus_L4',
  ]);
  const B = getSeriesList(['uranus_B0', 'uranus_B1', 'uranus_B2', 'uranus_B3']);
  const R = getSeriesList([
    'uranus_R0',
    'uranus_R1',
    'uranus_R2',
    'uranus_R3',
    'uranus_R4',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 84.0139 * 365.25, 3.0e9),
    -4000,
    4000
  );
}

export function createVSOP87NeptuneOrbit(): Orbit {
  const L = getSeriesList([
    'neptune_L0',
    'neptune_L1',
    'neptune_L2',
    'neptune_L3',
  ]);
  const B = getSeriesList([
    'neptune_B0',
    'neptune_B1',
    'neptune_B2',
    'neptune_B3',
  ]);
  const R = getSeriesList([
    'neptune_R0',
    'neptune_R1',
    'neptune_R2',
    'neptune_R3',
    'neptune_R4',
  ]);
  return makeVSOP87Orbit(
    new VSOP87Orbit(L, B, R, 164.793 * 365.25, 4.7e9),
    -4000,
    4000
  );
}

export function createVSOP87SunOrbit(): Orbit {
  const X = getSeriesList(['sun_X0', 'sun_X1', 'sun_X2', 'sun_X3', 'sun_X4']);
  const Y = getSeriesList(['sun_Y0', 'sun_Y1', 'sun_Y2', 'sun_Y3', 'sun_Y4']);
  const Z = getSeriesList(['sun_Z0', 'sun_Z1', 'sun_Z2']);
  return makeVSOP87Orbit(
    new VSOP87OrbitRect(X, Y, Z, 0.0, 2000000.0),
    -4000,
    6000
  );
}
