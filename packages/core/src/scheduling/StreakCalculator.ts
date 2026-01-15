import { Session } from '../models/Session';
import { ReviewEvent } from '../models/ReviewEvent';
import { Settings } from '../models/Settings';

/**
 * Calculates streak as consecutive days with at least one completed session.
 * "Completed session" = session was started and at least one item was reviewed.
 */
export function calculateStreak(
  sessions: Session[],
  reviewEvents: ReviewEvent[],
  settings: Settings,
  now: Date = new Date()
): number {
  if (sessions.length === 0) {
    return 0;
  }

  // Get completed sessions (started + at least one review)
  const completedSessions = sessions.filter(session => {
    if (!session.ended_at || !session.state.is_complete) {
      return false;
    }
    // Check if session has at least one review event
    return reviewEvents.some(event => event.session_id === session.id);
  });

  if (completedSessions.length === 0) {
    return 0;
  }

  // Group sessions by day (using daily reset time boundary)
  const [resetHours, resetMinutes] = settings.daily_reset_time.split(':').map(Number);
  
  function getDayBoundary(date: Date): Date {
    const boundary = new Date(date);
    boundary.setHours(resetHours, resetMinutes, 0, 0);
    if (boundary > date) {
      boundary.setDate(boundary.getDate() - 1);
    }
    return boundary;
  }

  // Get unique days with completed sessions
  const daysWithSessions = new Set<string>();
  completedSessions.forEach(session => {
    const dayBoundary = getDayBoundary(session.started_at);
    daysWithSessions.add(dayBoundary.toISOString().split('T')[0]);
  });

  // Sort days descending
  const sortedDays = Array.from(daysWithSessions)
    .map(d => new Date(d))
    .sort((a, b) => b.getTime() - a.getTime());

  // Calculate consecutive days from today backwards
  let streak = 0;
  const todayBoundary = getDayBoundary(now);
  
  for (let i = 0; i < sortedDays.length; i++) {
    const expectedDay = new Date(todayBoundary);
    expectedDay.setDate(expectedDay.getDate() - i);
    
    const dayStr = expectedDay.toISOString().split('T')[0];
    const hasSession = sortedDays.some(d => d.toISOString().split('T')[0] === dayStr);
    
    if (hasSession) {
      streak++;
    } else {
      break; // Streak broken
    }
  }

  return streak;
}
