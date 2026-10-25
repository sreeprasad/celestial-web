// index.ts
// Public ephemeris interface for celestia-web

import { BODY_ORDER, BodyName, Vec3 } from './types';
import { Orbit } from './orbit';
import { createMoonOrbit } from './lunar';
import {
  createVSOP87EarthOrbit,
  createVSOP87JupiterOrbit,
  createVSOP87MarsOrbit,
  createVSOP87MercuryOrbit,
  createVSOP87NeptuneOrbit,
  createVSOP87SaturnOrbit,
  createVSOP87SunOrbit,
  createVSOP87UranusOrbit,
  createVSOP87VenusOrbit,
  setVSOP87Data,
} from './vsop87';
import {
  createArielOrbit,
  createCallistoOrbit,
  createCalypsoOrbit,
  createDeimosOrbit,
  createEuropaOrbit,
  createGanymedeOrbit,
  createHeleneOrbit,
  createIoOrbit,
  createMirandaOrbit,
  createOberonOrbit,
  createPhobosOrbit,
  createPhoebeOrbit,
  createPlutoOrbit,
  createTelestoOrbit,
  createTitaniaOrbit,
  createTritonOrbit,
  createUmbrielOrbit,
} from './customorbit';
import {
  createTASS17DioneOrbit,
  createTASS17EnceladusOrbit,
  createTASS17HyperionOrbit,
  createTASS17IapetusOrbit,
  createTASS17MimasOrbit,
  createTASS17RheaOrbit,
  createTASS17TethysOrbit,
  createTASS17TitanOrbit,
} from './tass17';

export * from './types';
export * from './math';
export * from './astro';
export * from './orbit';
export * from './vsop87';
export * from './lunar';
export * from './customorbit';
export * from './tass17_types';
export * from './tass17';

const orbitCache = new Map<BodyName, Orbit>();

const orbitFactories: Record<BodyName, () => Orbit> = {
  Sun: createVSOP87SunOrbit,
  Mercury: createVSOP87MercuryOrbit,
  Venus: createVSOP87VenusOrbit,
  Earth: createVSOP87EarthOrbit,
  Moon: createMoonOrbit,
  Mars: createVSOP87MarsOrbit,
  Jupiter: createVSOP87JupiterOrbit,
  Saturn: createVSOP87SaturnOrbit,
  Uranus: createVSOP87UranusOrbit,
  Neptune: createVSOP87NeptuneOrbit,
  Pluto: createPlutoOrbit,
  Phobos: createPhobosOrbit,
  Deimos: createDeimosOrbit,
  Io: createIoOrbit,
  Europa: createEuropaOrbit,
  Ganymede: createGanymedeOrbit,
  Callisto: createCallistoOrbit,
  Mimas: createTASS17MimasOrbit,
  Enceladus: createTASS17EnceladusOrbit,
  Tethys: createTASS17TethysOrbit,
  Dione: createTASS17DioneOrbit,
  Rhea: createTASS17RheaOrbit,
  Titan: createTASS17TitanOrbit,
  Hyperion: createTASS17HyperionOrbit,
  Iapetus: createTASS17IapetusOrbit,
  Phoebe: createPhoebeOrbit,
  Helene: createHeleneOrbit,
  Telesto: createTelestoOrbit,
  Calypso: createCalypsoOrbit,
  Miranda: createMirandaOrbit,
  Ariel: createArielOrbit,
  Umbriel: createUmbrielOrbit,
  Titania: createTitaniaOrbit,
  Oberon: createOberonOrbit,
  Triton: createTritonOrbit,
};

const customOrbitNameToBody: Record<string, BodyName> = {
  'vsop87-sun': 'Sun',
  'vsop87-mercury': 'Mercury',
  'vsop87-venus': 'Venus',
  'vsop87-earth': 'Earth',
  moon: 'Moon',
  'vsop87-mars': 'Mars',
  'vsop87-jupiter': 'Jupiter',
  'vsop87-saturn': 'Saturn',
  'vsop87-uranus': 'Uranus',
  'vsop87-neptune': 'Neptune',
  pluto: 'Pluto',
  phobos: 'Phobos',
  deimos: 'Deimos',
  io: 'Io',
  europa: 'Europa',
  ganymede: 'Ganymede',
  callisto: 'Callisto',
  mimas: 'Mimas',
  enceladus: 'Enceladus',
  tethys: 'Tethys',
  dione: 'Dione',
  rhea: 'Rhea',
  titan: 'Titan',
  hyperion: 'Hyperion',
  iapetus: 'Iapetus',
  phoebe: 'Phoebe',
  'htc20-helene': 'Helene',
  'htc20-telesto': 'Telesto',
  'htc20-calypso': 'Calypso',
  miranda: 'Miranda',
  ariel: 'Ariel',
  umbriel: 'Umbriel',
  titania: 'Titania',
  oberon: 'Oberon',
  triton: 'Triton',
};

export function getBodyOrbit(body: BodyName): Orbit {
  let orbit = orbitCache.get(body);
  if (!orbit) {
    const factory = orbitFactories[body];
    if (!factory) {
      throw new Error(`Unknown body: ${body}`);
    }
    orbit = factory();
    orbitCache.set(body, orbit);
  }
  return orbit;
}

export function getCustomOrbit(name: string): Orbit | null {
  const body = customOrbitNameToBody[name];
  if (!body) {
    return null;
  }
  return getBodyOrbit(body);
}

export function positionKm(body: BodyName, julianDate: number): Vec3 {
  const orbit = getBodyOrbit(body);
  return orbit.positionAtTime(julianDate);
}

export { BODY_ORDER, setVSOP87Data };
