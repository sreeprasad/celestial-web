# Celestia in the Browser

Celestia's solar system, running in any web browser with no install.

Built for the **Gemini 4 Argon Hackathon** (San Francisco, October 2026).

**Try it live:** https://celestial-web-liard.vercel.app

**Original Celestia:** https://celestiaproject.space ([source code](https://github.com/CelestiaProject/Celestia))

## What it is

Celestia is a well-loved open-source space simulator. We ported its orbit engine to the web with Gemini 4 Argon.

You can:

- See the Sun, all 8 planets, Pluto and 25 moons.
- Fly to any planet or moon with one click.
- Run time forward, pause, or jump to a date.
- Make small bodies easier to see with the size boost.

## It matches the original

We ran Celestia's original orbit code as an answer key. Then we compared our version against it for 35 bodies, at 1,003 dates from 1900 to 2100.

- **35 out of 35 bodies match** within 1 km on every date.
- Most agree to within a centimeter.
- The largest difference is Phoebe, a moon of Saturn: 34 meters, on an orbit about 13 million km wide.

The **Verify** page in the app shows the result for every body.

## How Gemini 4 Argon helped

Argon did the porting:

1. It read Celestia's original orbit code and set up the answer key.
2. It ported the orbit math for the planets.
3. It ported Pluto and 25 moons, copying their long tables of numbers by hand. Iapetus alone has over 1,100 rows.
4. It built the 3D app.
5. It fixed its own mistakes when we sent back the check results.

The check caught real errors. Argon once dropped 5 rows from a 583-row table. We found the exact rows, sent them back, Argon fixed them, and every date matched again.

## Credits and license

- Orbit engine ported from [Celestia](https://celestiaproject.space) ([source](https://github.com/CelestiaProject/Celestia)), licensed GPL-2.0-or-later.
- Planet textures from [Solar System Scope](https://www.solarsystemscope.com/textures), CC BY 4.0.

Because it is a port of Celestia, this project is also licensed under the GNU General Public License, version 2 or later.
