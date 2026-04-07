/**
 * Shared dialogue path fixtures for scene-specific integration tests.
 */

import { repeatChoice } from './dialogue-helpers';

export const STREET_HAPPY_PATH = repeatChoice(58);
export const STREET_LOST_TOURIST_PATH = [0, 2, 0, ...repeatChoice(54)];
export const STREET_RETURN_VISITOR_PATH = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  ...repeatChoice(39),
];

export const RESTAURANT_HAPPY_PATH = repeatChoice(56);
export const RESTAURANT_CURRY_PATH = [0, 0, 0, 0, 1, 0, ...repeatChoice(50)];
export const RESTAURANT_TEA_PATH = [
  0,
  0,
  0,
  0,
  2,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  ...repeatChoice(38),
];

export const CONBINI_HAPPY_PATH = repeatChoice(58);
export const CONBINI_BROWSE_PATH = [0, 2, 0, ...repeatChoice(55)];
export const CONBINI_SWEETS_PATH = [0, 1, 0, ...repeatChoice(55)];

export const PARK_HAPPY_PATH = repeatChoice(62);
export const PARK_WEATHER_PATH = [0, 0, 0, 1, 0, ...repeatChoice(57)];
export const PARK_LONELY_TRAVELER_PATH = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, ...repeatChoice(51)];
