import { Sentence, Rating } from '../models/Sentence';
import { Session, SessionState } from '../models/Session';
import { Settings } from '../models/Settings';
import { ReviewEvent } from '../models/ReviewEvent';
import { calculateNextDue } from '../scheduling/LeitnerScheduler';
import { clearRelearnLock } from '../scheduling/OptionAClamp';
import { createReviewEvent } from '../models/ReviewEvent';

export interface SessionItemState {
  sentence: Sentence;
  responseWindowSeconds: number;
  targetAudioDurationSeconds: number;
  phase: 'prompt' | 'response' | 'answer' | 'rating';
  startTime: Date;
}

export interface ProcessItemResult {
  nextState: SessionItemState | null;
  shouldPlayAnswer: boolean;
  shouldCaptureRating: boolean;
  dueQueueComplete: boolean;
}

/**
 * Processes a session item through the flow: prompt → response window → answer → rating capture.
 */
export function processItem(
  item: SessionItemState,
  settings: Settings,
  dueQueueLength: number,
  currentPosition: number
): ProcessItemResult {
  const now = new Date();
  const elapsed = (now.getTime() - item.startTime.getTime()) / 1000;
  
  switch (item.phase) {
    case 'prompt':
      // Move to response window immediately after prompt
      return {
        nextState: {
          ...item,
          phase: 'response',
          startTime: now,
        },
        shouldPlayAnswer: false,
        shouldCaptureRating: false,
        dueQueueComplete: false,
      };
    
    case 'response':
      // Wait for response window to complete
      if (elapsed >= item.responseWindowSeconds) {
        return {
          nextState: {
            ...item,
            phase: 'answer',
            startTime: now,
          },
          shouldPlayAnswer: true,
          shouldCaptureRating: false,
          dueQueueComplete: false,
        };
      }
      return {
        nextState: item,
        shouldPlayAnswer: false,
        shouldCaptureRating: false,
        dueQueueComplete: false,
      };
    
    case 'answer':
      // After answer plays, move to rating capture
      // Assume answer audio duration is same as target audio duration
      if (elapsed >= item.targetAudioDurationSeconds) {
        return {
          nextState: {
            ...item,
            phase: 'rating',
            startTime: now,
          },
          shouldPlayAnswer: false,
          shouldCaptureRating: true,
          dueQueueComplete: false,
        };
      }
      return {
        nextState: item,
        shouldPlayAnswer: false,
        shouldCaptureRating: false,
        dueQueueComplete: false,
      };
    
    case 'rating':
      // Rating captured externally, this phase is just waiting
      return {
        nextState: item,
        shouldPlayAnswer: false,
        shouldCaptureRating: true,
        dueQueueComplete: false,
      };
  }
}

/**
 * Calculates response window duration based on audio duration and settings.
 */
export function calculateResponseWindow(
  targetAudioDurationSeconds: number,
  settings: Settings
): number {
  return targetAudioDurationSeconds * 1.0 + settings.extra_seconds;
}

/**
 * Handles rating capture and updates sentence scheduling.
 * Returns the updated sentence, review event, and whether the sentence should be frozen.
 */
export function handleRating(
  sentence: Sentence,
  rating: Rating,
  session: Session,
  settings: Settings,
  now: Date = new Date(),
  isFrozen: boolean = false
): { updatedSentence: Sentence; reviewEvent: ReviewEvent; shouldFreeze: boolean; shouldReinsert: boolean } {
  // Guard against invalid sentence state
  if (!sentence.scheduling_state) {
    throw new Error('Sentence missing scheduling_state');
  }
  
  const frozenSentenceIds = session.state.frozen_sentence_ids || [];
  const isCurrentlyFrozen = frozenSentenceIds.includes(sentence.id);
  
  // Handle Repeat: no scheduling changes, just mark for freeze and reinsertion
  if (rating === 'Repeat') {
    const reviewEvent = createReviewEvent(
      sentence.id,
      session.id,
      rating,
      sentence.scheduling_state.due_at, // Use current due_at (no change)
      0, // No interval change
      sentence.scheduling_state.box_level // Use current box_level (no change)
    );
    
    return {
      updatedSentence: sentence, // No changes to sentence
      reviewEvent,
      shouldFreeze: true, // Mark for freeze (first time only, handled by caller)
      shouldReinsert: true, // Always reinsert on Repeat
    };
  }
  
  // For other ratings, check if sentence is frozen for Easy command
  const effectiveFrozen = rating === 'Easy' ? isCurrentlyFrozen : false;
  
  // Calculate next due (Miss overrides freeze, Next/Easy respect it)
  const schedulingResult = calculateNextDue(
    rating,
    sentence.scheduling_state.box_level,
    sentence.scheduling_state.due_at,
    settings,
    now,
    effectiveFrozen
  );
  
  // Update sentence
  const updatedSentence: Sentence = {
    ...sentence,
    scheduling_state: {
      ...sentence.scheduling_state,
      box_level: schedulingResult.box_level,
      due_at: schedulingResult.due_at,
      last_rating: rating,
      last_reviewed_at: now,
      relearn_lock_until_next_session: schedulingResult.relearn_lock,
      lapse_count: rating === 'Miss' ? sentence.scheduling_state.lapse_count + 1 : sentence.scheduling_state.lapse_count,
      success_streak: rating === 'Miss' ? 0 : sentence.scheduling_state.success_streak + 1,
    },
    stats: {
      total_reviews: sentence.stats.total_reviews + 1,
      total_misses: rating === 'Miss' ? sentence.stats.total_misses + 1 : sentence.stats.total_misses,
    },
  };
  
  // Clear relearn lock if this is the next session after reset
  const finalSentence = shouldClearRelearnLock(updatedSentence, session, settings)
    ? clearRelearnLock(updatedSentence)
    : updatedSentence;
  
  // Create review event
  const intervalDays = Math.ceil(
    (schedulingResult.due_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const reviewEvent = createReviewEvent(
    sentence.id,
    session.id,
    rating,
    schedulingResult.due_at,
    intervalDays,
    schedulingResult.box_level
  );
  
  // Determine if sentence should be reinserted (Miss always reinserts)
  const shouldReinsert = rating === 'Miss';
  
  // Determine if sentence should be frozen (Miss clears freeze, handled by removing from frozen list)
  const shouldFreeze = false; // Only Repeat freezes, and Miss clears it
  
  return {
    updatedSentence: finalSentence,
    reviewEvent,
    shouldFreeze,
    shouldReinsert,
  };
}

function shouldClearRelearnLock(sentence: Sentence, session: Session, settings: Settings): boolean {
  if (!sentence.scheduling_state.relearn_lock_until_next_session) {
    return false;
  }
  
  if (!sentence.scheduling_state.last_reviewed_at) {
    return false;
  }
  
  // Check if this session is the "next session" after the lock was set
  const [resetHours, resetMinutes] = settings.daily_reset_time.split(':').map(Number);
  const lockTime = sentence.scheduling_state.last_reviewed_at;
  const resetOnLockDay = new Date(lockTime);
  resetOnLockDay.setHours(resetHours, resetMinutes, 0, 0);
  
  const nextResetAfterLock = lockTime < resetOnLockDay
    ? resetOnLockDay
    : new Date(resetOnLockDay.getTime() + 24 * 60 * 60 * 1000);
  
  return session.started_at >= nextResetAfterLock;
}

/**
 * Updates session state.
 */
export function updateSessionState(
  session: Session,
  state: Partial<SessionState>
): Session {
  return {
    ...session,
    state: {
      ...session.state,
      ...state,
    },
  };
}

/**
 * Checks if due queue is complete.
 */
export function isDueQueueComplete(dueQueueLength: number, currentPosition: number): boolean {
  return currentPosition >= dueQueueLength;
}
