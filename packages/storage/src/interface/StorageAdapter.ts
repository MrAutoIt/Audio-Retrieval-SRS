import { Sentence } from '@audio-retrieval-srs/core';
import { ReviewEvent } from '@audio-retrieval-srs/core';
import { Session } from '@audio-retrieval-srs/core';
import { Settings } from '@audio-retrieval-srs/core';

/**
 * Abstract storage interface for platform-specific implementations.
 */
export interface StorageAdapter {
  // Sentences
  getSentences(): Promise<Sentence[]>;
  getSentence(id: string): Promise<Sentence | null>;
  saveSentence(sentence: Sentence): Promise<void>;
  updateSentence(sentence: Sentence): Promise<void>;
  deleteSentence(id: string): Promise<void>;
  
  // Review Events
  getReviewEvents(sentenceId?: string): Promise<ReviewEvent[]>;
  saveReviewEvent(event: ReviewEvent): Promise<void>;
  deleteReviewEvents(sentenceId: string): Promise<void>;
  
  // Sessions
  getSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  updateSession(session: Session): Promise<void>;
  getIncompleteSession(): Promise<Session | null>;
  updateSessionState(sessionId: string, state: Partial<Session['state']>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  
  // Settings
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;
  
  // Audio
  saveAudio(sentenceId: string, audioData: Blob | ArrayBuffer, filename: string): Promise<string>;
  getAudio(sentenceId: string): Promise<Blob | null>;
  deleteAudio(sentenceId: string): Promise<void>;
  audioExists(sentenceId: string): Promise<boolean>;
  
  // Import/Export
  exportAll(): Promise<{
    sentences: Sentence[];
    reviewEvents: ReviewEvent[];
    sessions: Session[];
    settings: Settings;
    audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>;
  }>;
  importAll(data: {
    sentences: Sentence[];
    reviewEvents: ReviewEvent[];
    sessions: Session[];
    settings: Settings;
    audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>;
  }): Promise<void>;
  
  // Utility
  clearAll(): Promise<void>;
}
