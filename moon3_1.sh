mkdir -p lib/ephemeris
cat > lib/ephemeris/tass17_types.ts <<'EOF'
// tass17_types.ts
// Ported from src/celephem/tass17.cpp
//
// Copyright (C) 2026-present, Celestia Development Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

export type TASSAPF = readonly [number, number, number];
export type TASSTerm = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export interface TASSExtraParams {
  id: number;
  al0: number;
  an0: number;
  tam: number;
  am: number;
}
EOF
