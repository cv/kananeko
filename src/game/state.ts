/**
 * Runtime state values shared by the game engines (and by tests that inspect WRAM).
 */

/** Values of MEM.DLG_STATE */
export const DialogueState = {
  IDLE: 0,
  PRINTING: 1,
  WAITING: 2,
  CHOOSING: 3,
} as const;

/** Values of MEM.KANA_STATE */
export const KanaState = {
  IDLE: 0,
  AWAITING: 2,
  /** Feedback countdown, then advance to the next question (correct answer or life lost) */
  ADVANCE_FEEDBACK: 3,
  /** Feedback countdown, then re-prompt the same question */
  RETRY_FEEDBACK: 4,
} as const;

/** MEM.DLG_NODE_ID value meaning "conversation over" (also the encoded `next: null`). */
export const END_OF_CONVERSATION = 0xff;

/** Lives at the start of a run; good dialogue choices refill up to this cap. */
export const MAX_LIVES = 3;
