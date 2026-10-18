/** Convenience store: dialogue paths and kana round. */

import { describeScene } from '../helpers/scene-suite';

describeScene(3, [
  { name: 'browse', detours: { 1: 2 } }, // みているだけ
  { name: 'sweets', detours: { 1: 1 } }, // おかし ある?
]);
