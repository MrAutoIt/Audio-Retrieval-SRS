import { Sentence } from '../models/Sentence';
import { Settings } from '../models/Settings';

/**
 * Gets items that are due now (past due_at OR relearn_locked).
 */
export function getDueNow(sentences: Sentence[], now: Date = new Date()): Sentence[] {
  return sentences.filter(sentence => {
    if (!sentence.is_eligible) {
      return false;
    }
    
    // Past due date
    if (sentence.scheduling_state.due_at <= now) {
      return true;
    }
    
    // Relearn locked
    if (sentence.scheduling_state.relearn_lock_until_next_session) {
      return true;
    }
    
    return false;
  });
}

/**
 * Gets items that are due today (due_at before next daily reset).
 */
export function getDueToday(sentences: Sentence[], settings: Settings, now: Date = new Date()): Sentence[] {
  const [resetHours, resetMinutes] = settings.daily_reset_time.split(':').map(Number);
  const nextReset = new Date(now);
  nextReset.setHours(resetHours, resetMinutes, 0, 0);
  
  // If reset time has already passed today, set for tomorrow
  if (nextReset <= now) {
    nextReset.setDate(nextReset.getDate() + 1);
  }

  return sentences.filter(sentence => {
    if (!sentence.is_eligible) {
      return false;
    }
    
    const dueAt = sentence.scheduling_state.due_at;
    return dueAt > now && dueAt < nextReset;
  });
}
