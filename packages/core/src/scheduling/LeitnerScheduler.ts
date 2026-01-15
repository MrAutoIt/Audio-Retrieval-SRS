import { Sentence, Rating } from '../models/Sentence';
import { Settings } from '../models/Settings';

export interface SchedulingResult {
  box_level: number;
  due_at: Date;
  relearn_lock: boolean;
}

/**
 * Calculates the next due date and box level based on the rating.
 * Note: 'Repeat' rating should not call this function for scheduling changes.
 */
export function calculateNextDue(
  rating: Rating,
  currentBox: number,
  currentDue: Date,
  settings: Settings,
  now: Date = new Date(),
  isFrozen: boolean = false
): SchedulingResult {
  const boxIntervals = settings.box_intervals;
  const maxBox = boxIntervals.length;

  switch (rating) {
    case 'Miss':
      return {
        box_level: 1,
        due_at: getNextSessionDueAt(now, settings),
        relearn_lock: true,
      };

    case 'Next':
      // Schedule by current box interval (no promotion)
      const nextInterval = boxIntervals[Math.min(currentBox - 1, boxIntervals.length - 1)];
      const nextDueAt = new Date(now);
      nextDueAt.setDate(nextDueAt.getDate() + nextInterval);
      
      return {
        box_level: currentBox, // Stay in same box
        due_at: nextDueAt,
        relearn_lock: false,
      };

    case 'Easy':
      if (isFrozen) {
        // If frozen, treat like Next (no promotion)
        const frozenInterval = boxIntervals[Math.min(currentBox - 1, boxIntervals.length - 1)];
        const frozenDueAt = new Date(now);
        frozenDueAt.setDate(frozenDueAt.getDate() + frozenInterval);
        
        return {
          box_level: currentBox, // Stay in same box
          due_at: frozenDueAt,
          relearn_lock: false,
        };
      } else {
        // Promote to next box
        const newBox = Math.min(currentBox + 1, maxBox);
        const newInterval = boxIntervals[newBox - 1];
        const easyDueAt = new Date(now);
        easyDueAt.setDate(easyDueAt.getDate() + newInterval);
        
        return {
          box_level: newBox,
          due_at: easyDueAt,
          relearn_lock: false,
        };
      }

    case 'Repeat':
      // Repeat should not call this function for scheduling
      // This is a fallback that should not be reached
      throw new Error('Repeat rating should not call calculateNextDue for scheduling changes');
  }
}

/**
 * Gets the next session due time (first session after daily reset).
 */
export function getNextSessionDueAt(now: Date, settings: Settings): Date {
  const [hours, minutes] = settings.daily_reset_time.split(':').map(Number);
  const resetTime = new Date(now);
  resetTime.setHours(hours, minutes, 0, 0);

  // If reset time has already passed today, set for tomorrow
  if (resetTime <= now) {
    resetTime.setDate(resetTime.getDate() + 1);
  }

  return resetTime;
}

/**
 * Checks if a sentence is "stabilized" (Box >= 4 AND no Miss in last 2 sessions).
 */
export function isStabilized(sentence: Sentence, reviewEvents: Array<{ rating: Rating; timestamp: Date }>): boolean {
  if (sentence.scheduling_state.box_level < 4) {
    return false;
  }

  // Get last 2 sessions' review events for this sentence
  const sentenceEvents = reviewEvents
    .filter(e => e.timestamp <= new Date())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 2);

  // Check if any of the last 2 reviews were "Miss"
  return !sentenceEvents.some(e => e.rating === 'Miss');
}
