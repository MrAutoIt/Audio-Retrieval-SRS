import { StorageAdapter, PendingAudioMetadata } from '../interface/StorageAdapter';
import { Sentence, ReviewEvent, Session, Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';

/**
 * SQLite storage adapter for mobile (Expo).
 * This is a placeholder implementation - actual implementation requires expo-sqlite.
 * The mobile app will need to implement this using expo-sqlite and expo-file-system.
 */
export class SQLiteStorage implements StorageAdapter {
  // Placeholder implementation - to be implemented in mobile app with expo-sqlite
  // This file exists to satisfy the interface but actual implementation happens in the mobile app

  async getSentences(languageCode?: string): Promise<Sentence[]> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getSentence(id: string): Promise<Sentence | null> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async saveSentence(sentence: Sentence): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async updateSentence(sentence: Sentence): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async deleteSentence(id: string): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getReviewEvents(sentenceId?: string): Promise<ReviewEvent[]> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async saveReviewEvent(event: ReviewEvent): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async deleteReviewEvents(sentenceId: string): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getSessions(): Promise<Session[]> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getSession(id: string): Promise<Session | null> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async saveSession(session: Session): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async updateSession(session: Session): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getIncompleteSession(): Promise<Session | null> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async updateSessionState(sessionId: string, state: Partial<Session['state']>): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async deleteSession(id: string): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getSettings(): Promise<Settings | null> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async saveSettings(settings: Settings): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async saveAudio(sentenceId: string, audioData: Blob | ArrayBuffer, filename: string): Promise<string> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getAudio(sentenceId: string): Promise<Blob | null> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async deleteAudio(sentenceId: string): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async audioExists(sentenceId: string): Promise<boolean> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async exportAll(): Promise<{
    sentences: Sentence[];
    reviewEvents: ReviewEvent[];
    sessions: Session[];
    settings: Settings;
    audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>;
  }> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async importAll(data: {
    sentences: Sentence[];
    reviewEvents: ReviewEvent[];
    sessions: Session[];
    settings: Settings;
    audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>;
  }): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async clearAll(): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  // Pending Audio
  async savePendingAudio(audioId: string, audioData: Blob | ArrayBuffer, metadata: PendingAudioMetadata): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getPendingAudio(audioId: string): Promise<Blob | null> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async getAllPendingAudios(languageCode?: string): Promise<PendingAudioMetadata[]> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async deletePendingAudio(audioId: string): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }

  async updatePendingAudioMetadata(audioId: string, metadata: Partial<PendingAudioMetadata>): Promise<void> {
    throw new Error('SQLiteStorage must be implemented in the mobile app with expo-sqlite');
  }
}
