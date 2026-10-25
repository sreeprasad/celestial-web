// tass17.ts
// Ported from src/celephem/tass17.h and src/celephem/tass17.cpp
//
// Copyright (C) 2026-present, Celestia Development Team
//
// Implementation of the TASS 1.7 theory for the orbits of the
// Saturnian moons. Translated to C++ from FORTRAN source available at:
// https://ftp.imcce.fr/pub/ephem/satel/tass17/
// On July 16, 2026, Alain Vienne granted permission to release the
// translated code under the GPL2+ license.
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { OrbitSampleProc, Vec3 } from './types';
import { AUtoKilometers, J2000 } from './astro';
import { degToRad, square, vec3 } from './math';
import { AdaptiveSamplingParameters, CachingOrbit, Orbit } from './orbit';
import { TASSAPF, TASSExtraParams, TASSTerm } from './tass17_types';
import { MimasAPF, MimasExtraParams, MimasTerms } from './tass17_mimas';
import {
  EnceladusAPF,
  EnceladusExtraParams,
  EnceladusTerms,
} from './tass17_enceladus';
import { TethysAPF, TethysExtraParams, TethysTerms } from './tass17_tethys';
import { DioneAPF, DioneExtraParams, DioneTerms } from './tass17_dione';
import { RheaAPF, RheaExtraParams, RheaTerms } from './tass17_rhea';
import { TitanAPF, TitanExtraParams, TitanTerms } from './tass17_titan';
import { HyperionAPF } from './tass17_hyperion';
import { IapetusAPF, IapetusExtraParams, IapetusTerms } from './tass17_iapetus';

const SatAscendingNode = 169.5291;
const SatTilt = 28.0512;

const gk1 = square(0.01720209895 * 365.25) / 3498.790;

function calcLongitude(t: number, dlo: number[]): void {
  for (let i = 84; i < MimasAPF.length; i++) {
    dlo[0] += MimasAPF[i][0] * Math.sin(MimasAPF[i][1] + t * MimasAPF[i][2]);
  }
  for (let i = 30; i < EnceladusAPF.length; i++) {
    dlo[1] +=
      EnceladusAPF[i][0] *
      Math.sin(EnceladusAPF[i][1] + t * EnceladusAPF[i][2]);
  }
  for (let i = 73; i < TethysAPF.length; i++) {
    dlo[2] += TethysAPF[i][0] * Math.sin(TethysAPF[i][1] + t * TethysAPF[i][2]);
  }
  for (let i = 56; i < DioneAPF.length; i++) {
    dlo[3] += DioneAPF[i][0] * Math.sin(DioneAPF[i][1] + t * DioneAPF[i][2]);
  }
  for (let i = 57; i < RheaAPF.length; i++) {
    dlo[4] += RheaAPF[i][0] * Math.sin(RheaAPF[i][1] + t * RheaAPF[i][2]);
  }
  for (let i = 82; i < TitanAPF.length; i++) {
    dlo[5] += TitanAPF[i][0] * Math.sin(TitanAPF[i][1] + t * TitanAPF[i][2]);
  }
  for (let i = 583; i < IapetusAPF.length; i++) {
    dlo[7] +=
      IapetusAPF[i][0] * Math.sin(IapetusAPF[i][1] + t * IapetusAPF[i][2]);
  }
}

function ellipticToRectangular(
  elem: readonly [number, number, number, number, number, number],
  tam: number,
  am: number
): Vec3 {
  const tmas = 1.0 / tam;
  const aam = am * 365.25;
  const amo = aam * (1 + elem[0]);
  const rmu = gk1 * (1 + tmas);
  const dga = Math.cbrt(rmu / square(amo));
  const rl = elem[1];
  const rk = elem[2];
  const rh = elem[3];

  // Solve Kepler's equation, a few iterations should be enough
  const srl = Math.sin(rl);
  const crl = Math.cos(rl);
  let fle = rl - rk * srl + rh * crl;
  let sf = Math.sin(fle);
  let cf = Math.cos(fle);
  let corf = (rl - fle + rk * sf - rh * cf) / (1 - rk * cf - rh * sf);
  fle += corf;
  for (let i = 0; i < 5; i++) {
    sf = Math.sin(fle);
    cf = Math.cos(fle);
    corf = (rl - fle + rk * sf - rh * cf) / (1 - rk * cf - rh * sf);
    fle += corf;
  }
  sf = Math.sin(fle);
  cf = Math.cos(fle);
  const dlf = -rk * sf + rh * cf;
  const phi = Math.sqrt(1 - rk * rk - rh * rh);
  const psi = 1.0 / (1 + phi);
  const x1 = dga * (cf - rk - psi * rh * dlf);
  const y1 = dga * (sf - rh + psi * rk * dlf);
  const dwho = 2 * Math.sqrt(1 - elem[5] * elem[5] - elem[4] * elem[4]);
  const rtp = 1 - 2 * square(elem[5]);
  const rtq = 1 - 2 * square(elem[4]);
  const rdg = 2 * elem[5] * elem[4];
  const tx = x1 * rtp + y1 * rdg;
  const ty = x1 * rdg + y1 * rtq;
  const tz = (-x1 * elem[5] + y1 * elem[4]) * dwho;
  const si = Math.sin(degToRad(SatTilt));
  const ci = Math.cos(degToRad(SatTilt));
  const so = Math.sin(degToRad(SatAscendingNode));
  const co = Math.cos(degToRad(SatAscendingNode));
  const x = co * tx - so * ci * ty + so * si * tz;
  const y = so * tx + co * ci * ty - co * si * tz;
  const z = si * ty + ci * tz;

  // Convert to Celestia's coordinate system
  const scale = AUtoKilometers(1.0);
  return vec3(x * scale, z * scale, -y * scale);
}

export class TASS17MajMoonOrbit extends CachingOrbit {
  private termIndices: readonly [number, number, number, number];
  private terms: readonly TASSTerm[];
  private apf: readonly TASSAPF[];
  private extraParams: TASSExtraParams;
  private period: number;
  private boundingRadius: number;

  constructor(
    _termIndices: readonly [number, number, number, number],
    _terms: readonly TASSTerm[],
    _apf: readonly TASSAPF[],
    _extraParams: TASSExtraParams,
    _period: number,
    _boundingRadius: number
  ) {
    super();
    this.termIndices = _termIndices;
    this.terms = _terms;
    this.apf = _apf;
    this.extraParams = _extraParams;
    this.period = _period;
    this.boundingRadius = _boundingRadius;
  }

  computePosition(jd: number): Vec3 {
    // t is Julian years since J1980
    const t = (jd - 2444240.0) / 365.25;

    const dlo = [0, 0, 0, 0, 0, 0, 0, 0];
    calcLongitude(t, dlo);

    // Evaluate series for p (mean motion)
    let s = 0;
    for (let i = 0; i < this.termIndices[0]; i++) {
      let phas = this.apf[i][1];
      for (let jk = 0; jk < 8; jk++) {
        phas += this.terms[i][jk] * dlo[jk];
      }
      const wt = phas + t * this.apf[i][2];
      s += this.apf[i][0] * Math.cos(wt);
    }
    const elem0 = s;

    // Evaluate series for lambda (mean longitude)
    s = dlo[this.extraParams.id - 1] + this.extraParams.al0;
    for (let i = this.termIndices[0]; i < this.termIndices[1]; i++) {
      let phas = this.apf[i][1];
      for (let jk = 0; jk < 8; jk++) {
        phas += this.terms[i][jk] * dlo[jk];
      }
      const wt = phas + t * this.apf[i][2];
      s += this.apf[i][0] * Math.sin(wt);
    }
    s += this.extraParams.an0 * t;
    const sn = Math.sin(s);
    const cs = Math.cos(s);
    const elem1 = Math.atan2(sn, cs);

    // Evaluate series for z (eccentricity and pericenter)
    let s1 = 0;
    let s2 = 0;
    for (let i = this.termIndices[1]; i < this.termIndices[2]; i++) {
      let phas = this.apf[i][1];
      for (let jk = 0; jk < 8; jk++) {
        phas += this.terms[i][jk] * dlo[jk];
      }
      const wt = phas + t * this.apf[i][2];
      const swt = Math.sin(wt);
      const cwt = Math.cos(wt);
      s1 += this.apf[i][0] * cwt;
      s2 += this.apf[i][0] * swt;
    }
    const elem2 = s1;
    const elem3 = s2;

    // Evaluate series for zeta (inclination and node)
    s1 = 0;
    s2 = 0;
    for (let i = this.termIndices[2]; i < this.termIndices[3]; i++) {
      let phas = this.apf[i][1];
      for (let jk = 0; jk < 8; jk++) {
        phas += this.terms[i][jk] * dlo[jk];
      }
      const wt = phas + t * this.apf[i][2];
      const swt = Math.sin(wt);
      const cwt = Math.cos(wt);
      s1 += this.apf[i][0] * cwt;
      s2 += this.apf[i][0] * swt;
    }
    const elem4 = s1;
    const elem5 = s2;

    const elem: [number, number, number, number, number, number] = [
      elem0,
      elem1,
      elem2,
      elem3,
      elem4,
      elem5,
    ];
    return ellipticToRectangular(
      elem,
      this.extraParams.tam,
      this.extraParams.am
    );
  }

  getPeriod(): number {
    return this.period;
  }

  getBoundingRadius(): number {
    return this.boundingRadius * 1.2;
  }

  override sample(
    startTime: number,
    endTime: number,
    proc: OrbitSampleProc
  ): void {
    const span = this.getPeriod();
    const startStep = span / 150.0;

    const samplingParams: AdaptiveSamplingParameters = {
      tolerance: 1.0, // kilometers
      startStep,
      minStep: startStep,
      maxStep: startStep,
    };

    this.adaptiveSample(startTime, endTime, proc, samplingParams);
  }
}

export class TASS17HyperionOrbit extends CachingOrbit {
  private termIndices: readonly [number, number, number, number];
  private apf: readonly TASSAPF[];

  constructor(
    _termIndices: readonly [number, number, number, number],
    _apf: readonly TASSAPF[]
  ) {
    super();
    this.termIndices = _termIndices;
    this.apf = _apf;
  }

  computePosition(jd: number): Vec3 {
    const t = jd - J2000;

    // Evaluate series for p (mean motion)
    let p = -0.1574686065780747E-02;
    for (let i = 0; i < this.termIndices[0]; i++) {
      const wt = t * this.apf[i][2] + this.apf[i][1];
      p += this.apf[i][0] * Math.cos(wt);
    }

    // Evaluate series for q (mean longitude)
    let q = 0.4348683610500939E+01;
    for (let i = this.termIndices[0]; i < this.termIndices[1]; i++) {
      const wt = t * this.apf[i][2] + this.apf[i][1];
      q += this.apf[i][0] * Math.sin(wt);
    }

    // Evaluate series for z (eccentricity and pericenter)
    let zr = 0;
    let zi = 0;
    for (let i = this.termIndices[1]; i < this.termIndices[2]; i++) {
      const wt = t * this.apf[i][2] + this.apf[i][1];
      const swt = Math.sin(wt);
      const cwt = Math.cos(wt);
      zr += this.apf[i][0] * cwt;
      zi += this.apf[i][0] * swt;
    }

    // Evaluate series for zeta (inclination and node)
    let ztr = 0;
    let zti = 0;
    for (let i = this.termIndices[2]; i < this.termIndices[3]; i++) {
      const wt = t * this.apf[i][2] + this.apf[i][1];
      const swt = Math.sin(wt);
      const cwt = Math.cos(wt);
      ztr += this.apf[i][0] * cwt;
      zti += this.apf[i][0] * swt;
    }

    let vl = (0.2953088138695055E+00 * t + q) % (Math.PI * 2);
    if (vl < 0) {
      vl += Math.PI * 2;
    }

    const elem: [number, number, number, number, number, number] = [
      p,
      vl,
      zr,
      zi,
      ztr,
      zti,
    ];
    return ellipticToRectangular(elem, 0.3333333333333E+08, 0.2953088138695E+00);
  }

  getPeriod(): number {
    return 21.276609;
  }

  getBoundingRadius(): number {
    return 1640000 * 1.2;
  }

  override sample(
    startTime: number,
    endTime: number,
    proc: OrbitSampleProc
  ): void {
    const span = this.getPeriod();
    const startStep = span / 150.0;

    const samplingParams: AdaptiveSamplingParameters = {
      tolerance: 1.0, // kilometers
      startStep,
      minStep: startStep,
      maxStep: startStep,
    };

    this.adaptiveSample(startTime, endTime, proc, samplingParams);
  }
}

export function createTASS17MimasOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [8, 14, 52, 84],
    MimasTerms,
    MimasAPF,
    MimasExtraParams,
    0.9424218,
    189000
  );
}

export function createTASS17EnceladusOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [3, 12, 25, 30],
    EnceladusTerms,
    EnceladusAPF,
    EnceladusExtraParams,
    1.370218,
    239000
  );
}

export function createTASS17TethysOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [4, 16, 39, 73],
    TethysTerms,
    TethysAPF,
    TethysExtraParams,
    1.887802,
    295000
  );
}

export function createTASS17DioneOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [10, 26, 47, 56],
    DioneTerms,
    DioneAPF,
    DioneExtraParams,
    2.736915,
    378000
  );
}

export function createTASS17RheaOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [11, 27, 48, 57],
    RheaTerms,
    RheaAPF,
    RheaExtraParams,
    4.517500,
    528000
  );
}

export function createTASS17TitanOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [7, 25, 60, 82],
    TitanTerms,
    TitanAPF,
    TitanExtraParams,
    15.94544758,
    1260000
  );
}

export function createTASS17HyperionOrbit(): Orbit {
  return new TASS17HyperionOrbit([109, 339, 534, 595], HyperionAPF);
}

export function createTASS17IapetusOrbit(): Orbit {
  return new TASS17MajMoonOrbit(
    [100, 319, 503, 583],
    IapetusTerms,
    IapetusAPF,
    IapetusExtraParams,
    79.330183,
    3660000
  );
}
