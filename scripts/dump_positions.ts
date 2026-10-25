import * as fs from 'node:fs';
import { setVSOP87Data } from '../lib/ephemeris/vsop87';
setVSOP87Data(JSON.parse(fs.readFileSync('vsop87.json', 'utf8')));
import { BODY_ORDER, positionKm } from '../lib/ephemeris';

function main(): void {
  const args = process.argv.slice(2);
  const datesFile = args[0] ?? 'dates.txt';

  const content = fs.readFileSync(datesFile, 'utf8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  console.log('body,jd,x_km,y_km,z_km');

  for (const line of lines) {
    const jd = Number(line);
    if (Number.isNaN(jd)) {
      continue;
    }

    for (const body of BODY_ORDER) {
      const pos = positionKm(body, jd);
      console.log(`${body},${line},${pos.x},${pos.y},${pos.z}`);
    }
  }
}

main();
