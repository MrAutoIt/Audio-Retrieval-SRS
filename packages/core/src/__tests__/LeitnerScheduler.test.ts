import { calculateNextDue, getNextSessionDueAt, isStabilized } from '../scheduling/LeitnerScheduler';
import { Sentence, Rating } from '../models/Sentence';
import { Settings, DEFAULT_SETTINGS } from '../models/Settings';

describe('LeitnerScheduler', () => {
  const settings: Settings = DEFAULT_SETTINGS;
  const now = new Date('2024-01-15T10:00:00Z');

  describe('calculateNextDue', () => {
    it('should reset to box 1 and set relearn lock for Again rating', () => {
      const result = calculateNextDue('Again', 5, new Date(), settings, now);
      expect(result.box_level).toBe(1);
      expect(result.relearn_lock).toBe(true);
      expect(result.due_at.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should use box-aware conservative interval for Hard rating', () => {
      const currentBox = 4;
      const currentInterval = settings.box_intervals[currentBox - 1]; // 8 days
      const result = calculateNextDue('Hard', currentBox, new Date(), settings, now);
      
      expect(result.box_level).toBe(currentBox); // Stay in same box
      expect(result.relearn_lock).toBe(false);
      
      // Should be max(1 day, 0.5 × 8) = 4 days
      const expectedDays = Math.max(1, Math.round(currentInterval * 0.5));
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + expectedDays);
      
      expect(result.due_at.getDate()).toBe(expectedDate.getDate());
    });

    it('should advance box and use new interval for Easy rating', () => {
      const currentBox = 2;
      const result = calculateNextDue('Easy', currentBox, new Date(), settings, now);
      
      expect(result.box_level).toBe(currentBox + 1);
      expect(result.relearn_lock).toBe(false);
      
      const newInterval = settings.box_intervals[currentBox]; // 4 days
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + newInterval);
      
      expect(result.due_at.getDate()).toBe(expectedDate.getDate());
    });

    it('should cap box level at maximum', () => {
      const maxBox = settings.box_intervals.length;
      const result = calculateNextDue('Easy', maxBox, new Date(), settings, now);
      expect(result.box_level).toBe(maxBox);
    });
  });

  describe('getNextSessionDueAt', () => {
    it('should calculate next session after daily reset', () => {
      const resetTime = getNextSessionDueAt(now, settings);
      expect(resetTime.getHours()).toBe(4);
      expect(resetTime.getMinutes()).toBe(0);
    });
  });

  describe('isStabilized', () => {
    it('should return false for box level < 4', () => {
      const sentence: Sentence = {
        id: '1',
        language_code: 'hu',
        english_translation_text: 'Test',
        target_audio_uri: 'test.mp3',
        created_at: new Date(),
        is_eligible: true,
        scheduling_state: {
          box_level: 3,
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
      };
      
      expect(isStabilized(sentence, [])).toBe(false);
    });

    it('should return false if Again in last 2 sessions', () => {
      const sentence: Sentence = {
        id: '1',
        language_code: 'hu',
        english_translation_text: 'Test',
        target_audio_uri: 'test.mp3',
        created_at: new Date(),
        is_eligible: true,
        scheduling_state: {
          box_level: 4,
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
      };
      
      const reviewEvents = [
        { rating: 'Again' as Rating, timestamp: new Date() },
      ];
      
      expect(isStabilized(sentence, reviewEvents)).toBe(false);
    });

    it('should return true for stabilized sentence', () => {
      const sentence: Sentence = {
        id: '1',
        language_code: 'hu',
        english_translation_text: 'Test',
        target_audio_uri: 'test.mp3',
        created_at: new Date(),
        is_eligible: true,
        scheduling_state: {
          box_level: 4,
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
      };
      
      const reviewEvents = [
        { rating: 'Easy' as Rating, timestamp: new Date() },
        { rating: 'Easy' as Rating, timestamp: new Date() },
      ];
      
      expect(isStabilized(sentence, reviewEvents)).toBe(true);
    });
  });
});
