import { Sentence, Rating } from '../models/Sentence';
import { Session } from '../models/Session';
import { Settings } from '../models/Settings';
import { ReviewEvent } from '../models/ReviewEvent';
import { shouldAppearInSession } from './OptionAClamp';
import { getNextSessionDueAt } from './LeitnerScheduler';

export interface QueueItem {
  sentence: Sentence;
  position: number;
}

/**
 * Builds the due queue for a session, respecting Option A clamp.
 */
export function buildDueQueue(
  sentences: Sentence[],
  session: Session,
  settings: Settings,
  now: Date = new Date()
): QueueItem[] {
  const eligible = sentences.filter(s => s.is_eligible);
  
  const dueItems: QueueItem[] = [];
  
  eligible.forEach(sentence => {
    // Check if past due date
    const isPastDue = sentence.scheduling_state.due_at <= now;
    
    // Check if relearn locked and should appear (Option A clamp)
    const shouldAppear = sentence.scheduling_state.relearn_lock_until_next_session
      ? shouldAppearInSession(sentence, session.started_at, settings)
      : false;
    
    if (isPastDue || shouldAppear) {
      dueItems.push({
        sentence,
        position: dueItems.length,
      });
    }
  });
  
  // Sort by due date (earliest first), then by relearn lock priority
  dueItems.sort((a, b) => {
    const aLock = a.sentence.scheduling_state.relearn_lock_until_next_session ? 1 : 0;
    const bLock = b.sentence.scheduling_state.relearn_lock_until_next_session ? 1 : 0;
    
    if (aLock !== bLock) {
      return bLock - aLock; // Locked items first
    }
    
    return a.sentence.scheduling_state.due_at.getTime() - b.sentence.scheduling_state.due_at.getTime();
  });
  
  return dueItems;
}

/**
 * Builds the extra practice queue, prioritizing recent Miss items, then random.
 */
export function buildExtraQueue(
  sentences: Sentence[],
  sessionId: string,
  reviewEvents: ReviewEvent[],
  settings: Settings
): QueueItem[] {
  const eligible = sentences.filter(s => s.is_eligible);
  
  // Get recent Miss items from current or recent sessions
  const recentMiss: Sentence[] = [];
  const otherEligible: Sentence[] = [];
  
  // Find items rated Miss in recent sessions (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentEvents = reviewEvents.filter(e => 
    e.timestamp >= sevenDaysAgo && 
    e.rating === 'Miss'
  );
  
  const recentSentenceIds = new Set(recentEvents.map(e => e.sentence_id));
  
  eligible.forEach(sentence => {
    if (recentSentenceIds.has(sentence.id)) {
      recentMiss.push(sentence);
    } else {
      otherEligible.push(sentence);
    }
  });
  
  // Shuffle both arrays
  const shuffledMiss = shuffleArray([...recentMiss]);
  const shuffledOther = shuffleArray([...otherEligible]);
  
  // Combine: recent Miss first, then random others
  const combined = [...shuffledMiss, ...shuffledOther];
  
  return combined.map((sentence, index) => ({
    sentence,
    position: index,
  }));
}

/**
 * Reinserts an item into the queue after 2-4 other items.
 */
export function reinsertItem(
  queue: QueueItem[],
  item: QueueItem,
  currentPosition: number
): QueueItem[] {
  // Calculate reinsertion position: 2-4 items after current
  const offset = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
  const reinsertPosition = Math.min(currentPosition + offset, queue.length);
  
  // Remove item from current position
  const withoutItem = queue.filter(q => q.sentence.id !== item.sentence.id);
  
  // Insert at new position
  const newQueue = [...withoutItem];
  newQueue.splice(reinsertPosition, 0, item);
  
  // Update positions
  return newQueue.map((q, index) => ({
    ...q,
    position: index,
  }));
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
