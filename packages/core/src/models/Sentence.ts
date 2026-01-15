import { v4 as uuidv4 } from 'uuid';

export type Rating = 'Miss' | 'Repeat' | 'Next' | 'Easy';

export interface SchedulingState {
  box_level: number;
  due_at: Date;
  last_rating: Rating | null;
  last_reviewed_at: Date | null;
  relearn_lock_until_next_session: boolean;
  lapse_count: number;
  success_streak: number;
}

export interface SentenceStats {
  total_reviews: number;
  total_misses: number;
}

export interface Sentence {
  id: string;
  language_code: string;
  english_translation_text: string;
  target_text?: string;
  target_audio_uri: string;
  target_audio_duration_seconds?: number; // Duration of the target audio in seconds
  tags?: string[];
  created_at: Date;
  is_eligible: boolean;
  scheduling_state: SchedulingState;
  stats: SentenceStats;
}

export function createSentence(
  languageCode: string,
  englishTranslation: string,
  targetAudioUri: string,
  options?: {
    targetText?: string;
    tags?: string[];
  }
): Sentence {
  const now = new Date();
  return {
    id: uuidv4(),
    language_code: languageCode,
    english_translation_text: englishTranslation,
    target_text: options?.targetText,
    target_audio_uri: targetAudioUri,
    tags: options?.tags,
    created_at: now,
    is_eligible: false,
    scheduling_state: {
      box_level: 1,
      due_at: now,
      last_rating: null,
      last_reviewed_at: null,
      relearn_lock_until_next_session: false,
      lapse_count: 0,
      success_streak: 0,
    },
    stats: {
      total_reviews: 0,
      total_misses: 0,
    },
  };
}
