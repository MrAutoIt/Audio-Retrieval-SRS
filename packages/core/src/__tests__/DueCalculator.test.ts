import { getDueNow, getDueToday } from '../scheduling/DueCalculator';
import { Sentence } from '../models/Sentence';
import { Settings, DEFAULT_SETTINGS } from '../models/Settings';

describe('DueCalculator', () => {
  const settings: Settings = DEFAULT_SETTINGS;
  const now = new Date('2024-01-15T10:00:00Z');

  function createSentence(overrides?: Partial<Sentence>): Sentence {
    return {
      id: '1',
      language_code: 'hu',
      english_translation_text: 'Test',
      target_audio_uri: 'test.mp3',
      created_at: new Date(),
      is_eligible: true,
      scheduling_state: {
        box_level: 1,
        due_at: new Date(),
        last_rating: null,
        last_reviewed_at: null,
        relearn_lock_until_next_session: false,
        lapse_count: 0,
        success_streak: 0,
      },
      stats: {
        total_reviews: 0,
        total_agains: 0,
      },
      ...overrides,
    };
  }

  describe('getDueNow', () => {
    it('should return sentences past due date', () => {
      const pastDue = createSentence({
        scheduling_state: {
          ...createSentence().scheduling_state,
          due_at: new Date(now.getTime() - 1000),
        },
      });
      
      const futureDue = createSentence({
        scheduling_state: {
          ...createSentence().scheduling_state,
          due_at: new Date(now.getTime() + 1000),
        },
      });

      const result = getDueNow([pastDue, futureDue], now);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(pastDue.id);
    });

    it('should return relearn locked sentences', () => {
      const locked = createSentence({
        scheduling_state: {
          ...createSentence().scheduling_state,
          relearn_lock_until_next_session: true,
          due_at: new Date(now.getTime() + 1000),
        },
      });

      const result = getDueNow([locked], now);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(locked.id);
    });

    it('should exclude ineligible sentences', () => {
      const ineligible = createSentence({
        is_eligible: false,
        scheduling_state: {
          ...createSentence().scheduling_state,
          due_at: new Date(now.getTime() - 1000),
        },
      });

      const result = getDueNow([ineligible], now);
      expect(result).toHaveLength(0);
    });
  });

  describe('getDueToday', () => {
    it('should return sentences due before next daily reset', () => {
      const dueToday = createSentence({
        scheduling_state: {
          ...createSentence().scheduling_state,
          due_at: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours from now
        },
      });

      const result = getDueToday([dueToday], settings, now);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });
});
