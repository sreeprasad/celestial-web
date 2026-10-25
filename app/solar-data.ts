import { BODY_ORDER, BodyName, positionKm, Vec3 } from '@/lib/ephemeris';

export const KM_PER_UNIT = 1_000_000;

export interface BodyMeta {
  name: BodyName;
  radiusKm: number;
  color: number;
  periodDays: number;
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
    periodDays: 27.32166,
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
};

export type BoostOption = 1 | 50 | 500;

/**
 * Returns the visual radius in km for a body given the current boost factor.
 * The Sun stays at its true physical size when boost is applied so inner planets
 * are not swallowed by a 500x Sun, while planets & Moon scale by `boost`.
 */
export function getDisplayedRadiusKm(body: BodyName, boost: number): number {
  const base = BODY_META[body].radiusKm;
  if (body === 'Sun') {
    return base;
  }
  return base * boost;
}

/**
 * Computes barycentric positions in km for all 10 bodies at the given Julian Date.
 * - Sun is barycentric.
 * - Planets are heliocentric -> add Sun position.
 * - Moon is geocentric -> scaled by `boost` so it stays outside Earth, then add Earth's barycentric position.
 */
export function computeAllPositionsKm(
  jd: number,
  boost: number = 1
): Record<BodyName, Vec3> {
  const sunPos = positionKm('Sun', jd);
  const earthHelio = positionKm('Earth', jd);
  const earthBary: Vec3 = {
    x: sunPos.x + earthHelio.x,
    y: sunPos.y + earthHelio.y,
    z: sunPos.z + earthHelio.z,
  };

  const result = {} as Record<BodyName, Vec3>;
  result.Sun = sunPos;
  result.Earth = earthBary;

  for (const body of BODY_ORDER) {
    if (body === 'Sun' || body === 'Earth') continue;
    if (body === 'Moon') {
      const moonGeo = positionKm('Moon', jd);
      result.Moon = {
        x: earthBary.x + moonGeo.x * boost,
        y: earthBary.y + moonGeo.y * boost,
        z: earthBary.z + moonGeo.z * boost,
      };
    } else {
      const helio = positionKm(body, jd);
      result[body] = {
        x: sunPos.x + helio.x,
        y: sunPos.y + helio.y,
        z: sunPos.z + helio.z,
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
