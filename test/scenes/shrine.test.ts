/** Shrine: dialogue paths and kana round. */

import { describeScene } from '../helpers/scene-suite';

describeScene('じんじゃ', [
  { name: 'second visit', detours: { 1: 1 } }, // にかいめです
  { name: 'skipping the lesson', detours: { 2: 2 } }, // いいです
  { name: 'bad fortune', detours: { 17: 2 } }, // なな → きょうです
  { name: 'meeting the child as a cat', detours: { 32: 2 } }, // ここに いるよ!
]);
