mkdir -p app
cat > app/solar-data.ts <<'EOF'
import { BODY_ORDER, BodyName, positionKm, Vec3 } from '@/lib/ephemeris';

export const KM_PER_UNIT = 1_000_000;

export interface BodyMeta {
  name: BodyName;
  radiusKm: number;
  color: number;
  periodDays: number;
  parent?: BodyName;
}

export const BODY_META: Record<BodyName, BodyMeta> = {
  Sun: {
    name: 'Sun',
    radiusKm: 696340,
    color: 0xffdd55,
    periodDays: 0,
  },
  Mercury: {
    name: 'Mercury',
    radiusKm: 2439.7,
    color: 0x9e9e9e,
    periodDays: 87.969,
  },
  Venus: {
    name: 'Venus',
    radiusKm: 6051.8,
    color: 0xe3bb76,
    periodDays: 224.701,
  },
  Earth: {
    name: 'Earth',
    radiusKm: 6371.0,
    color: 0x2b82c9,
    periodDays: 365.256,
  },
  Moon: {
    name: 'Moon',
    radiusKm: 1737.4,
    color: 0xc8c8c8,
    periodDays: 27.321661,
    parent: 'Earth',
  },
  Mars: {
    name: 'Mars',
    radiusKm: 3389.5,
    color: 0xd1603d,
    periodDays: 686.98,
  },
  Jupiter: {
    name: 'Jupiter',
    radiusKm: 69911,
    color: 0xd8ca9d,
    periodDays: 4332.59,
  },
  Saturn: {
    name: 'Saturn',
    radiusKm: 58232,
    color: 0xead6b8,
    periodDays: 10759.22,
  },
  Uranus: {
    name: 'Uranus',
    radiusKm: 25362,
    color: 0x82d8d8,
    periodDays: 30688.5,
  },
  Neptune: {
    name: 'Neptune',
    radiusKm: 24622,
    color: 0x3f54ba,
    periodDays: 60182.0,
  },
  Pluto: {
    name: 'Pluto',
    radiusKm: 1188.3,
    color: 0xd2b48c,
    periodDays: 90779.235,
  },
  Phobos: {
    name: 'Phobos',
    radiusKm: 11.267,
    color: 0xa8998c,
    periodDays: 0.319,
    parent: 'Mars',
  },
  Deimos: {
    name: 'Deimos',
    radiusKm: 6.2,
    color: 0xb8aa9c,
    periodDays: 1.262441,
    parent: 'Mars',
  },
  Io: {
    name: 'Io',
    radiusKm: 1821.6,
    color: 0xf4d03f,
    periodDays: 1.769138,
    parent: 'Jupiter',
  },
  Europa: {
    name: 'Europa',
    radiusKm: 1560.8,
    color: 0xdcd0c0,
    periodDays: 3.5511810791,
    parent: 'Jupiter',
  },
  Ganymede: {
    name: 'Ganymede',
    radiusKm: 2634.1,
    color: 0xb7a99a,
    periodDays: 7.154553,
    parent: 'Jupiter',
  },
  Callisto: {
    name: 'Callisto',
    radiusKm: 2410.3,
    color: 0x8c7f70,
    periodDays: 16.689018,
    parent: 'Jupiter',
  },
  Mimas: {
    name: 'Mimas',
    radiusKm: 198.2,
    color: 0xcfcfcf,
    periodDays: 0.9424218,
    parent: 'Saturn',
  },
  Enceladus: {
    name: 'Enceladus',
    radiusKm: 252.1,
    color: 0xf0f6ff,
    periodDays: 1.370218,
    parent: 'Saturn',
  },
  Tethys: {
    name: 'Tethys',
    radiusKm: 531.1,
    color: 0xe0e0e0,
    periodDays: 1.887802,
    parent: 'Saturn',
  },
  Dione: {
    name: 'Dione',
    radiusKm: 561.4,
    color: 0xd8d8d8,
    periodDays: 2.736915,
    parent: 'Saturn',
  },
  Rhea: {
    name: 'Rhea',
    radiusKm: 763.8,
    color: 0xd0d0d0,
    periodDays: 4.5175,
    parent: 'Saturn',
  },
  Titan: {
    name: 'Titan',
    radiusKm: 2574.73,
    color: 0xe5a93c,
    periodDays: 15.94544758,
    parent: 'Saturn',
  },
  Hyperion: {
    name: 'Hyperion',
    radiusKm: 135.0,
    color: 0xc2b29b,
    periodDays: 21.276609,
    parent: 'Saturn',
  },
  Iapetus: {
    name: 'Iapetus',
    radiusKm: 734.5,
    color: 0xb5a895,
    periodDays: 79.330183,
    parent: 'Saturn',
  },
  Phoebe: {
    name: 'Phoebe',
    radiusKm: 106.5,
    color: 0x88847f,
    periodDays: 548.212279,
    parent: 'Saturn',
  },
  Helene: {
    name: 'Helene',
    radiusKm: 17.6,
    color: 0xd9d2c5,
    periodDays: 2.736915,
    parent: 'Saturn',
  },
  Telesto: {
    name: 'Telesto',
    radiusKm: 12.4,
    color: 0xe2ddd2,
    periodDays: 1.887802,
    parent: 'Saturn',
  },
  Calypso: {
    name: 'Calypso',
    radiusKm: 10.7,
    color: 0xe4dfd5,
    periodDays: 1.887803,
    parent: 'Saturn',
  },
  Miranda: {
    name: 'Miranda',
    radiusKm: 235.8,
    color: 0xc4ccd4,
    periodDays: 1.413479,
    parent: 'Uranus',
  },
  Ariel: {
    name: 'Ariel',
    radiusKm: 578.9,
    color: 0xd0d8e0,
    periodDays: 2.520379,
    parent: 'Uranus',
  },
  Umbriel: {
    name: 'Umbriel',
    radiusKm: 584.7,
    color: 0x929aa2,
    periodDays: 4.144176,
    parent: 'Uranus',
  },
  Titania: {
    name: 'Titania',
    radiusKm: 788.4,
    color: 0xc8c4be,
    periodDays: 8.705867,
    parent: 'Uranus',
  },
  Oberon: {
    name: 'Oberon',
    radiusKm: 761.4,
    color: 0xb2aba4,
    periodDays: 13.463234,
    parent: 'Uranus',
  },
  Triton: {
    name: 'Triton',
    radiusKm: 1353.4,
    color: 0xd8c8c8,
    periodDays: 5.87685421025,
    parent: 'Neptune',
  },
};

export const PRIMARY_BODIES: readonly BodyName[] = [
  'Sun',
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

export const PLANET_MOONS: Partial<Record<BodyName, readonly BodyName[]>> = {
  Earth: ['Moon'],
  Mars: ['Phobos', 'Deimos'],
  Jupiter: ['Io', 'Europa', 'Ganymede', 'Callisto'],
  Saturn: [
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
  ],
  Uranus: ['Miranda', 'Ariel', 'Umbriel', 'Titania', 'Oberon'],
  Neptune: ['Triton'],
};

export type BoostOption = 1 | 50 | 500;

/**
 * Returns the visual radius in km for a body given the current boost factor.
 * The Sun stays at its true physical size when boost is applied so inner planets
 * are not swallowed by a 500x Sun, while planets & moons scale by `boost`.
 */
export function getDisplayedRadiusKm(body: BodyName, boost: number): number {
  const base = BODY_META[body].radiusKm;
  if (body === 'Sun') {
    return base;
  }
  return base * boost;
}

/**
 * Computes barycentric positions in km for all 35 bodies at the given Julian Date.
 * - Sun is barycentric.
 * - Planets (and Pluto) are heliocentric -> add Sun position.
 * - Moons are planetocentric -> scaled by `boost` so they stay outside their boosted parent planet,
 *   then add the parent planet's barycentric position.
 */
export function computeAllPositionsKm(
  jd: number,
  boost: number = 1
): Record<BodyName, Vec3> {
  const sunPos = positionKm('Sun', jd);
  const result = {} as Record<BodyName, Vec3>;
  result.Sun = sunPos;

  // First pass: heliocentric planets (and Pluto)
  for (const body of BODY_ORDER) {
    if (body === 'Sun') continue;
    const parent = BODY_META[body].parent;
    if (!parent) {
      const helio = positionKm(body, jd);
      result[body] = {
        x: sunPos.x + helio.x,
        y: sunPos.y + helio.y,
        z: sunPos.z + helio.z,
      };
    }
  }

  // Second pass: moons relative to their parent planet
  for (const body of BODY_ORDER) {
    const parent = BODY_META[body].parent;
    if (parent) {
      const parentBary = result[parent];
      const rel = positionKm(body, jd);
      result[body] = {
        x: parentBary.x + rel.x * boost,
        y: parentBary.y + rel.y * boost,
        z: parentBary.z + rel.z * boost,
      };
    }
  }

  return result;
}

export function dateToJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function julianDateToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

export function formatDateTimeUTC(jd: number): string {
  const d = julianDateToDate(jd);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function formatDateInputValue(jd: number): string {
  const d = julianDateToDate(jd);
  if (isNaN(d.getTime())) return '2000-01-01T12:00';
  return d.toISOString().slice(0, 16);
}
EOF
