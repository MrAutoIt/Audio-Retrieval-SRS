import { isNextSession, shouldAppearInSession, clearRelearnLock } from '../scheduling/OptionAClamp';
import { Sentence } from '../models/Sentence';
import { Settings, DEFAULT_SETTINGS } from '../models/Settings';

describe('OptionAClamp', () => {
  const settings: Settings = DEFAULT_SETTINGS;

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

  describe('isNextSession', () => {
    it('should identify next session after daily reset', () => {
      const lastRatingAt = new Date('2024-01-15T02:00:00Z'); // Before 4 AM reset
      const sessionStartedAt = new Date('2024-01-15T05:00:00Z'); // After 4 AM reset
      
      expect(isNextSession(sessionStartedAt, lastRatingAt, settings)).toBe(true);
    });

    it('should return false for session before reset', () => {
      const lastRatingAt = new Date('2024-01-15T02:00:00Z');
      const sessionStartedAt = new Date('2024-01-15T03:00:00Z'); // Before reset
      
      expect(isNextSession(sessionStartedAt, lastRatingAt, settings)).toBe(false);
    });
  });

  describe('shouldAppearInSession', () => {
    it('should return true for relearn locked sentence in next session', () => {
      const sentence = createSentence({
        scheduling_state: {
          ...createSentence().scheduling_state,
          relearn_lock_until_next_session: true,
          last_reviewed_at: new Date('2024-01-15T02:00:00Z'),
        },
      });
      
      const sessionStartedAt = new Date('2024-01-15T05:00:00Z');
      
      expect(shouldAppearInSession(sentence, sessionStartedAt, settings)).toBe(true);
    });

    it('should return false for sentence without relearn lock', () => {
      const sentence = createSentence();
      const sessionStartedAt = new Date();
      
      expect(shouldAppearInSession(sentence, sessionStartedAt, settings)).toBe(false);
    });
  });

  describe('clearRelearnLock', () => {
    it('should clear relearn lock', () => {
      const sentence = createSentence({
        scheduling_state: {
          ...createSentence().scheduling_state,
          relearn_lock_until_next_session: true,
        },
      });
      
      const cleared = clearRelearnLock(sentence);
      expect(cleared.scheduling_state.relearn_lock_until_next_session).toBe(false);
    });
  });
});
