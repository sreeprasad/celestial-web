mkdir -p lib/ephemeris
cat > lib/ephemeris/index.ts <<'EOF'
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

export * from './types';
export * from './math';
export * from './astro';
export * from './orbit';
export * from './vsop87';
export * from './lunar';

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

export function positionKm(body: BodyName, julianDate: number): Vec3 {
  const orbit = getBodyOrbit(body);
  return orbit.positionAtTime(julianDate);
}

export { BODY_ORDER, setVSOP87Data };
EOF
