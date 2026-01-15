import { v4 as uuidv4 } from 'uuid';
import { Rating } from './Sentence';

export interface ReviewEvent {
  id: string;
  sentence_id: string;
  timestamp: Date;
  rating: Rating;
  session_id: string;
  computed_next_due_at: Date;
  computed_interval_days: number;
  box_level_after: number;
}

export function createReviewEvent(
  sentenceId: string,
  sessionId: string,
  rating: Rating,
  nextDueAt: Date,
  intervalDays: number,
  boxLevelAfter: number
): ReviewEvent {
  return {
    id: uuidv4(),
    sentence_id: sentenceId,
    timestamp: new Date(),
    rating,
    session_id: sessionId,
    computed_next_due_at: nextDueAt,
    computed_interval_days: intervalDays,
    box_level_after: boxLevelAfter,
  };
}
