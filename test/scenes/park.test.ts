/** Park: dialogue paths and kana round. */

import { describeScene } from '../helpers/scene-suite';

describeScene(4, [
  { name: 'weather chat', detours: { 4: 1 } }, // おてんきのこと
  { name: 'lonely traveler', detours: { 14: 1 } }, // さびしいです
]);
