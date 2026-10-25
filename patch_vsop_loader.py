#!/usr/bin/env python3
"""
Make lib/ephemeris browser-safe without touching the orbit math.

- Removes the node:fs / node:path imports and the disk-reading code from lib/ephemeris/vsop87.ts
  (the browser passes the data in with setVSOP87Data instead).
- Makes a missing coefficient table an error instead of a silent empty series.
- Makes scripts/dump_positions.ts read vsop87.json itself and pass it to setVSOP87Data.

Run from the celestia-web folder:  python3 patch_vsop_loader.py
Safe to run twice.
"""
import re
import sys
from pathlib import Path

v = Path("lib/ephemeris/vsop87.ts")
d = Path("scripts/dump_positions.ts")
for p in (v, d):
    if not p.exists():
        sys.exit(f"Can't find {p}. Run this from the celestia-web folder.")

s = v.read_text()
orig = s

# 1. Drop Node-only imports (any quote style / spacing).
s = re.sub(r"^\s*import\s+\*\s+as\s+\w+\s+from\s+['\"]node:(fs|path)['\"];?[ \t]*\r?\n", "", s, flags=re.M)

# 2. Replace the body of getVSOP87Data with "return cached or throw".
m = re.search(r"function\s+getVSOP87Data\s*\([^)]*\)\s*:\s*VSOPJsonData\s*\{", s)
if not m:
    sys.exit("Couldn't find getVSOP87Data() in vsop87.ts. Paste me: sed -n '20,60p' lib/ephemeris/vsop87.ts")
i, depth = m.end(), 1
while depth and i < len(s):
    depth += {"{": 1, "}": -1}.get(s[i], 0)
    i += 1
new_fn = (
    "function getVSOP87Data(): VSOPJsonData {\n"
    "  if (cachedVsopData) {\n"
    "    return cachedVsopData;\n"
    "  }\n"
    "  throw new Error('VSOP87 data not loaded: call setVSOP87Data() with the parsed vsop87.json first');\n"
    "}"
)
s = s[:m.start()] + new_fn + s[i:]

# 3. Missing table -> clear error instead of empty series.
s = re.sub(
    r"return\s+keys\.map\(\s*\(key\)\s*=>\s*data\[key\]\s*\?\?\s*\[\]\s*\);",
    "return keys.map((key) => {\n"
    "    const series = data[key];\n"
    "    if (!series) {\n"
    "      throw new Error(`vsop87.json is missing table ${key}`);\n"
    "    }\n"
    "    return series;\n"
    "  });",
    s,
)

if re.search(r"node:(fs|path)|process\.|__dirname", s):
    sys.exit("vsop87.ts still has Node-only code after patching; not saving. Paste me: grep -n 'node:\\|process\\.\\|__dirname' lib/ephemeris/vsop87.ts")

v.write_text(s)
print("vsop87.ts:", "updated" if s != orig else "already browser-safe")

t = d.read_text()
if "setVSOP87Data" in t:
    print("dump_positions.ts: already loads vsop87.json")
else:
    fs_import = re.search(r"^import\s+\*\s+as\s+(\w+)\s+from\s+['\"]node:fs['\"];?[ \t]*$", t, flags=re.M)
    if not fs_import:
        sys.exit("Couldn't find the node:fs import in dump_positions.ts. Paste me: head -15 scripts/dump_positions.ts")
    fs_name = fs_import.group(1)
    insert = (
        "\nimport { setVSOP87Data } from '../lib/ephemeris/vsop87';\n"
        f"setVSOP87Data(JSON.parse({fs_name}.readFileSync('vsop87.json', 'utf8')));"
    )
    t = t[:fs_import.end()] + insert + t[fs_import.end():]
    d.write_text(t)
    print("dump_positions.ts: now reads vsop87.json and passes it in")
