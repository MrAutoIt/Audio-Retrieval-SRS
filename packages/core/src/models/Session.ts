import { v4 as uuidv4 } from 'uuid';
import { Settings } from './Settings';

export type SessionMode = 'DueOnly' | 'DueThenExtra';

export interface SessionState {
  current_item_id: string | null;
  queue_position: number;
  elapsed_time_seconds: number;
  is_complete: boolean;
  frozen_sentence_ids: string[]; // Session-scoped freeze flags
}

export interface Session {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  mode: SessionMode;
  target_minutes: number;
  settings_snapshot: Settings;
  state: SessionState;
}

export function createSession(
  targetMinutes: number,
  settings: Settings,
  mode: SessionMode = 'DueThenExtra'
): Session {
  return {
    id: uuidv4(),
    started_at: new Date(),
    ended_at: null,
    mode,
    target_minutes: targetMinutes,
    settings_snapshot: settings,
    state: {
      current_item_id: null,
      queue_position: 0,
      elapsed_time_seconds: 0,
      is_complete: false,
      frozen_sentence_ids: [],
    },
  };
}

export function isIncompleteSession(session: Session): boolean {
  return !session.state.is_complete && session.ended_at === null;
}
