/** Restaurant: dialogue paths and kana round. */

import { describeScene } from '../helpers/scene-suite';

describeScene('レストラン', [
  { name: 'curry order', detours: { 5: 1 } }, // カレー ください
  { name: 'tea and sweet', detours: { 5: 2, 25: 1 } }, // おちゃ ください → つめたくてあまい
]);
