import { Sentence } from '../models/Sentence';
import { Settings } from '../models/Settings';

/**
 * Determines if a session qualifies as the "next session" after a daily reset.
 * "Next session" = first session that starts after the daily reset time.
 */
export function isNextSession(
  sessionStartedAt: Date,
  lastRatingAt: Date,
  settings: Settings
): boolean {
  const [resetHours, resetMinutes] = settings.daily_reset_time.split(':').map(Number);
  
  // Get the reset time on the day of the last rating
  const resetOnRatingDay = new Date(lastRatingAt);
  resetOnRatingDay.setHours(resetHours, resetMinutes, 0, 0);
  
  // If the rating was before reset that day, the next session is after that reset
  // If the rating was after reset that day, the next session is after the next day's reset
  const nextResetAfterRating = lastRatingAt < resetOnRatingDay
    ? resetOnRatingDay
    : new Date(resetOnRatingDay.getTime() + 24 * 60 * 60 * 1000);

  // Session qualifies if it started after the next reset
  return sessionStartedAt >= nextResetAfterRating;
}

/**
 * Checks if a sentence should appear in a session based on Option A clamp.
 */
export function shouldAppearInSession(
  sentence: Sentence,
  sessionStartedAt: Date,
  settings: Settings
): boolean {
  if (!sentence.scheduling_state.relearn_lock_until_next_session) {
    return false;
  }

  // If there's no last review, it should appear
  if (!sentence.scheduling_state.last_reviewed_at) {
    return true;
  }

  return isNextSession(sessionStartedAt, sentence.scheduling_state.last_reviewed_at, settings);
}

/**
 * Clears the relearn lock after a sentence is reviewed in the next session.
 */
export function clearRelearnLock(sentence: Sentence): Sentence {
  return {
    ...sentence,
    scheduling_state: {
      ...sentence.scheduling_state,
      relearn_lock_until_next_session: false,
    },
  };
}
