import { calculateStreak } from '../scheduling/StreakCalculator';
import { Session } from '../models/Session';
import { ReviewEvent } from '../models/ReviewEvent';
import { Settings, DEFAULT_SETTINGS } from '../models/Settings';

describe('StreakCalculator', () => {
  const settings: Settings = DEFAULT_SETTINGS;

  function createSession(id: string, startedAt: Date, endedAt: Date | null = null, isComplete = true): Session {
    return {
      id,
      started_at: startedAt,
      ended_at: endedAt,
      mode: 'DueThenExtra',
      target_minutes: 10,
      settings_snapshot: settings,
      state: {
        current_item_id: null,
        queue_position: 0,
        elapsed_time_seconds: 0,
        is_complete: isComplete,
      },
    };
  }

  function createReviewEvent(sessionId: string, timestamp: Date): ReviewEvent {
    return {
      id: '1',
      sentence_id: '1',
      timestamp,
      rating: 'Easy',
      session_id: sessionId,
      computed_next_due_at: new Date(),
      computed_interval_days: 1,
      box_level_after: 2,
    };
  }

  it('should return 0 for no sessions', () => {
    expect(calculateStreak([], [], settings)).toBe(0);
  });

  it('should return 0 for sessions without reviews', () => {
    const session = createSession('1', new Date());
    expect(calculateStreak([session], [], settings)).toBe(0);
  });

  it('should calculate streak for consecutive days', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const session1 = createSession('1', twoDaysAgo, twoDaysAgo);
    const session2 = createSession('2', yesterday, yesterday);
    const session3 = createSession('3', now, now);

    const event1 = createReviewEvent('1', twoDaysAgo);
    const event2 = createReviewEvent('2', yesterday);
    const event3 = createReviewEvent('3', now);

    const streak = calculateStreak([session1, session2, session3], [event1, event2, event3], settings, now);
    expect(streak).toBeGreaterThanOrEqual(1);
  });
});
