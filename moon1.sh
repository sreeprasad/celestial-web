mkdir -p lib/ephemeris
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
  | 'Neptune'
  | 'Pluto'
  | 'Phobos'
  | 'Deimos'
  | 'Io'
  | 'Europa'
  | 'Ganymede'
  | 'Callisto'
  | 'Mimas'
  | 'Enceladus'
  | 'Tethys'
  | 'Dione'
  | 'Rhea'
  | 'Titan'
  | 'Hyperion'
  | 'Iapetus'
  | 'Phoebe'
  | 'Helene'
  | 'Telesto'
  | 'Calypso'
  | 'Miranda'
  | 'Ariel'
  | 'Umbriel'
  | 'Titania'
  | 'Oberon'
  | 'Triton';

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
  'Pluto',
  'Phobos',
  'Deimos',
  'Io',
  'Europa',
  'Ganymede',
  'Callisto',
  'Mimas',
  'Enceladus',
  'Tethys',
  'Dione',
  'Rhea',
  'Titan',
  'Hyperion',
  'Iapetus',
  'Phoebe',
  'Helene',
  'Telesto',
  'Calypso',
  'Miranda',
  'Ariel',
  'Umbriel',
  'Titania',
  'Oberon',
  'Triton',
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
