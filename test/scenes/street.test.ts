/** Street: dialogue paths and kana round. */

import { describeScene } from '../helpers/scene-suite';

describeScene('みち', [
  { name: 'lost tourist', detours: { 1: 2 } }, // わかりません
  { name: 'return visitor', detours: { 22: 1 } }, // にかいめです
]);
