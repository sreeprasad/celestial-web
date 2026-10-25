// tass17_iapetus.ts
// Ported from src/celephem/tass17.cpp
//
// Copyright (C) 2026-present, Celestia Development Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.

import { TASSAPF } from './tass17_types';
import { IapetusExtraParams, IapetusTerms } from './tass17_iapetus_terms';
import { IapetusAPF_A } from './tass17_iapetus_apf_a';
import { IapetusAPF_B } from './tass17_iapetus_apf_b';

export const IapetusAPF: readonly TASSAPF[] = [
  ...IapetusAPF_A,
  ...IapetusAPF_B,
];

export { IapetusExtraParams, IapetusTerms };
