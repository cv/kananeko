/** Station: dialogue paths and kana round. */

import { describeScene } from '../helpers/scene-suite';

describeScene(0, [
  { name: 'tired clerk', detours: { 1: 2 } }, // つかれました
  { name: 'name detour', detours: { 15: 2 } }, // あなたは?
]);
