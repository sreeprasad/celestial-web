from pathlib import Path

v = Path("lib/ephemeris/vsop87.ts")
s = v.read_text()
s = s.replace("import * as fs from 'node:fs';\nimport * as path from 'node:path';\n", "")
start = s.index("  const candidatePaths = [")
end = s.index("  throw new Error('vsop87.json not found');")
s = s[:start] + s[end:]
s = s.replace(
    "  throw new Error('vsop87.json not found');",
    "  throw new Error('VSOP87 data not loaded: call setVSOP87Data() with the parsed vsop87.json first');",
)
s = s.replace(
    "  return keys.map((key) => data[key] ?? []);",
    "  return keys.map((key) => {\n    const series = data[key];\n    if (!series) {\n      throw new Error(`vsop87.json is missing table ${key}`);\n    }\n    return series;\n  });",
)
v.write_text(s)

d = Path("scripts/dump_positions.ts")
t = d.read_text()
if "setVSOP87Data" not in t:
    t = t.replace(
        "import * as fs from 'node:fs';\n",
        "import * as fs from 'node:fs';\nimport { setVSOP87Data } from '../lib/ephemeris/vsop87';\n"
        "setVSOP87Data(JSON.parse(fs.readFileSync('vsop87.json', 'utf8')));\n",
        1,
    )
    d.write_text(t)
print("patched")
