# Session Freeze Implementation Summary

## Overview
This document summarizes the implementation of the revised "session freeze" behavior for sentence rating commands, which separates in-session repetition from long-term box promotion.

## Key Changes

### Rating Commands
- **"Again" → "Miss"**: Renamed to avoid ambiguity with "Repeat"
- **"Hard" → Removed**: No longer used
- **"Repeat"**: New command for in-session practice (does not affect scheduling)
- **"Next"**: New command for "good enough for today" (no promotion)
- **"Easy"**: Still promotes, but respects freeze state

### Data Model Updates
- Added `frozen_sentence_ids: string[]` to `SessionState` (session-scoped)
- Updated `SentenceStats.total_agains` → `total_misses`
- Freeze state is cleared at session end and when new sessions start

## State Transition Table

| Command | In-Session Behavior | Box Change | due_at Change | Lock Change | Freeze State |
|---------|-------------------|------------|---------------|-------------|--------------|
| **Miss** | Reinserts after 2-4 items | Reset to 1 | next_session_due_at | Set relearn_lock=true | Clears freeze (if frozen) |
| **Repeat** | Reinserts after 2-4 items | **No change** | **No change** | **No change** | Sets freeze (first time only) |
| **Next** | No reinsertion | **No change** | Current box interval | No change | Clears at session end |
| **Easy** (not frozen) | No reinsertion | **Promotes +1** | New box interval | No change | N/A |
| **Easy** (frozen) | No reinsertion | **No change** | Current box interval | No change | Clears at session end |

### Notes:
- **Repeat**: Never changes long-term scheduling; creates ReviewEvent for history only
- **Miss**: Always overrides freeze state and resets to box 1
- **Next**: Always keeps current box, schedules by current box interval
- **Easy**: Only promotes if sentence is NOT frozen; if frozen, behaves like Next

## Edge Cases Handled

### 1. Backward Compatibility
- Old sessions without `frozen_sentence_ids` are handled (initialized to `[]` in `resumeSession`)
- Old ReviewEvents with "Again" or "Hard" ratings are displayed correctly in UI
- Old sentences with `total_agains` stat are migrated to `total_misses` (read-only compatibility)

### 2. Repeat Command Behavior
- Repeat can be used unlimited times; each use requeues the item
- Freeze flag is set on first Repeat use; subsequent Repeats don't change scheduling
- Repeat does NOT update sentence scheduling_state (box_level, due_at, relearn_lock unchanged)
- ReviewEvent is still created for history tracking

### 3. Freeze State Management
- Freeze state is session-scoped and cleared at session end
- Miss clears freeze immediately (removes from frozen list)
- Frozen sentences cannot be promoted via Easy (treated like Next)
- Freeze state persists within a session (survives session resume)

### 4. Miss Command Priority
- Miss always overrides freeze state (resets to box 1 regardless of freeze)
- Miss always sets relearn_lock and schedules for next_session
- Miss always reinserts into current session queue

### 5. Audio Cue
- First-time freeze triggers audio cue ("Frozen" TTS at 0.3 volume)
- Audio cue only plays once per sentence per session

## Implementation Files Modified

### Core Models
- `packages/core/src/models/Sentence.ts`: Rating type, stats rename
- `packages/core/src/models/Session.ts`: Added frozen_sentence_ids

### Core Logic
- `packages/core/src/scheduling/LeitnerScheduler.ts`: Updated calculateNextDue for new commands
- `packages/core/src/session/SessionRunner.ts`: Updated handleRating with freeze logic
- `packages/core/src/scheduling/SessionQueue.ts`: Updated buildExtraQueue for Miss (was Again/Hard)

### UI Components
- `apps/web/app/session/page.tsx`: Updated rating capture, freeze state management
- `apps/web/app/session/summary/page.tsx`: Updated rating counts display
- `apps/web/app/library/[id]/page.tsx`: Updated stats and rating colors
- `apps/web/app/onboarding/page.tsx`: Updated rating descriptions

## Function Signature Changes

### `handleRating`
**Before:**
```typescript
handleRating(sentence, rating, session, settings, now?): { updatedSentence, reviewEvent }
```

**After:**
```typescript
handleRating(sentence, rating, session, settings, now?): { 
  updatedSentence, 
  reviewEvent, 
  shouldFreeze, 
  shouldReinsert 
}
```

### `calculateNextDue`
**Before:**
```typescript
calculateNextDue(rating, currentBox, currentDue, settings, now?): SchedulingResult
```

**After:**
```typescript
calculateNextDue(rating, currentBox, currentDue, settings, now?, isFrozen?): SchedulingResult
```

## Testing Considerations

The following areas should be tested:
1. Repeat command does not change scheduling
2. Easy command respects freeze state
3. Miss command clears freeze and resets
4. Freeze state persists across session resume
5. Freeze state clears at session end
6. Audio cue plays on first freeze
7. Backward compatibility with old sessions

## Migration Notes

- Existing ReviewEvents with "Again" or "Hard" ratings will continue to display correctly
- Old sessions will work correctly after upgrade (frozen_sentence_ids initialized on resume)
- Sentence stats migration (total_agains → total_misses) is handled in code
- No database migration script needed (handled at runtime)
