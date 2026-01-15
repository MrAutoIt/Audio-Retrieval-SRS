import { Sentence, Rating } from '../models/Sentence';
import { ReviewEvent } from '../models/ReviewEvent';
import { isStabilized } from '../scheduling/LeitnerScheduler';

/**
 * Counts sentences that are "stabilized" (Box >= 4 AND no Miss in last 2 sessions).
 */
export function countStabilized(
  sentences: Sentence[],
  reviewEvents: ReviewEvent[]
): number {
  const eligible = sentences.filter(s => s.is_eligible);
  
  // Group review events by sentence
  const eventsBySentence = new Map<string, Array<{ rating: Rating; timestamp: Date }>>();
  
  reviewEvents.forEach(event => {
    if (!eventsBySentence.has(event.sentence_id)) {
      eventsBySentence.set(event.sentence_id, []);
    }
    eventsBySentence.get(event.sentence_id)!.push({
      rating: event.rating as Rating,
      timestamp: event.timestamp,
    });
  });
  
  let count = 0;
  eligible.forEach(sentence => {
    const events = eventsBySentence.get(sentence.id) || [];
    if (isStabilized(sentence, events)) {
      count++;
    }
  });
  
  return count;
}
