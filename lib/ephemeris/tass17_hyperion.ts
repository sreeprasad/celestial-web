// tass17_hyperion.ts
// Ported from src/celephem/tass17.cpp
//
// Copyright (C) 2026-present, Celestia Development Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { TASSAPF } from './tass17_types';
import { HyperionAPF_A } from './tass17_hyperion_a';
import { HyperionAPF_B } from './tass17_hyperion_b';

export const HyperionAPF: readonly TASSAPF[] = [
  ...HyperionAPF_A,
  ...HyperionAPF_B,
];
