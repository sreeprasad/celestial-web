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
