import { StorageAdapter } from '../interface/StorageAdapter';
import { Sentence, ReviewEvent, Session, Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';
import Dexie, { Table } from 'dexie';

interface SentenceRecord {
  id: string;
  data: string; // JSON stringified Sentence
}

interface ReviewEventRecord {
  id: string;
  data: string; // JSON stringified ReviewEvent
}

interface SessionRecord {
  id: string;
  data: string; // JSON stringified Session
}

interface SettingsRecord {
  id: 'settings';
  data: string; // JSON stringified Settings
}

interface AudioRecord {
  sentenceId: string;
  data: Blob;
  filename: string;
}

class AudioRetrievalDB extends Dexie {
  sentences!: Table<SentenceRecord>;
  reviewEvents!: Table<ReviewEventRecord>;
  sessions!: Table<SessionRecord>;
  settings!: Table<SettingsRecord>;
  audio!: Table<AudioRecord>;

  constructor() {
    super('AudioRetrievalSRS');
    this.version(1).stores({
      sentences: 'id',
      reviewEvents: 'id, sentence_id, session_id, timestamp',
      sessions: 'id, started_at',
      settings: 'id',
      audio: 'sentenceId',
    });
  }
}

export class IndexedDBStorage implements StorageAdapter {
  private db: AudioRetrievalDB;

  constructor() {
    this.db = new AudioRetrievalDB();
  }

  // Sentences
  async getSentences(): Promise<Sentence[]> {
    const records = await this.db.sentences.toArray();
    return records.map(r => this.deserializeSentence(r.data));
  }

  async getSentence(id: string): Promise<Sentence | null> {
    const record = await this.db.sentences.get(id);
    return record ? this.deserializeSentence(record.data) : null;
  }

  async saveSentence(sentence: Sentence): Promise<void> {
    await this.db.sentences.put({
      id: sentence.id,
      data: this.serializeSentence(sentence),
    });
  }

  async updateSentence(sentence: Sentence): Promise<void> {
    await this.saveSentence(sentence);
  }

  async deleteSentence(id: string): Promise<void> {
    await this.db.sentences.delete(id);
    await this.deleteAudio(id);
    await this.deleteReviewEvents(id);
  }

  // Review Events
  async getReviewEvents(sentenceId?: string): Promise<ReviewEvent[]> {
    let query = this.db.reviewEvents.toCollection();
    if (sentenceId) {
      query = this.db.reviewEvents.where('sentence_id').equals(sentenceId);
    }
    const records = await query.toArray();
    return records.map(r => this.deserializeReviewEvent(r.data));
  }

  async saveReviewEvent(event: ReviewEvent): Promise<void> {
    await this.db.reviewEvents.put({
      id: event.id,
      data: this.serializeReviewEvent(event),
    });
  }

  async deleteReviewEvents(sentenceId: string): Promise<void> {
    await this.db.reviewEvents.where('sentence_id').equals(sentenceId).delete();
  }

  // Sessions
  async getSessions(): Promise<Session[]> {
    const records = await this.db.sessions.toArray();
    return records.map(r => this.deserializeSession(r.data));
  }

  async getSession(id: string): Promise<Session | null> {
    const record = await this.db.sessions.get(id);
    return record ? this.deserializeSession(record.data) : null;
  }

  async saveSession(session: Session): Promise<void> {
    await this.db.sessions.put({
      id: session.id,
      data: this.serializeSession(session),
    });
  }

  async updateSession(session: Session): Promise<void> {
    await this.saveSession(session);
  }

  async getIncompleteSession(): Promise<Session | null> {
    const sessions = await this.getSessions();
    return sessions.find(s => !s.state.is_complete && s.ended_at === null) || null;
  }

  async updateSessionState(sessionId: string, state: Partial<Session['state']>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const updated: Session = {
      ...session,
      state: {
        ...session.state,
        ...state,
      },
    };
    await this.saveSession(updated);
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.sessions.delete(id);
    // Optionally delete related review events
    await this.db.reviewEvents.where('session_id').equals(id).delete();
  }

  // Settings
  async getSettings(): Promise<Settings | null> {
    const record = await this.db.settings.get('settings');
    return record ? this.deserializeSettings(record.data) : DEFAULT_SETTINGS;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.db.settings.put({
      id: 'settings',
      data: JSON.stringify(settings),
    });
  }

  // Audio
  async saveAudio(sentenceId: string, audioData: Blob | ArrayBuffer, filename: string): Promise<string> {
    const blob = audioData instanceof Blob ? audioData : new Blob([audioData]);
    await this.db.audio.put({
      sentenceId,
      data: blob,
      filename,
    });
    return `indexeddb://audio/${sentenceId}`;
  }

  async getAudio(sentenceId: string): Promise<Blob | null> {
    const record = await this.db.audio.get(sentenceId);
    return record?.data || null;
  }

  async deleteAudio(sentenceId: string): Promise<void> {
    await this.db.audio.delete(sentenceId);
  }

  async audioExists(sentenceId: string): Promise<boolean> {
    const count = await this.db.audio.where('sentenceId').equals(sentenceId).count();
    return count > 0;
  }

  // Import/Export
  async exportAll(): Promise<{
    sentences: Sentence[];
    reviewEvents: ReviewEvent[];
    sessions: Session[];
    settings: Settings;
    audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>;
  }> {
    const sentences = await this.getSentences();
    const reviewEvents = await this.getReviewEvents();
    const sessions = await this.getSessions();
    const settings = await this.getSettings() || DEFAULT_SETTINGS;
    
    const audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }> = [];
    for (const sentence of sentences) {
      const audio = await this.getAudio(sentence.id);
      if (audio) {
        const record = await this.db.audio.get(sentence.id);
        audioFiles.push({
          sentenceId: sentence.id,
          filename: record?.filename || `${sentence.id}.mp3`,
          data: audio,
        });
      }
    }

    return {
      sentences,
      reviewEvents,
      sessions,
      settings,
      audioFiles,
    };
  }

  async importAll(data: {
    sentences: Sentence[];
    reviewEvents: ReviewEvent[];
    sessions: Session[];
    settings: Settings;
    audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>;
  }): Promise<void> {
    // Clear existing data
    await this.clearAll();

    // Import sentences
    for (const sentence of data.sentences) {
      await this.saveSentence(sentence);
    }

    // Import review events
    for (const event of data.reviewEvents) {
      await this.saveReviewEvent(event);
    }

    // Import sessions
    for (const session of data.sessions) {
      await this.saveSession(session);
    }

    // Import settings
    await this.saveSettings(data.settings);

    // Import audio files
    for (const audioFile of data.audioFiles) {
      await this.saveAudio(audioFile.sentenceId, audioFile.data, audioFile.filename);
    }
  }

  // Utility
  async clearAll(): Promise<void> {
    await this.db.sentences.clear();
    await this.db.reviewEvents.clear();
    await this.db.sessions.clear();
    await this.db.settings.clear();
    await this.db.audio.clear();
  }

  // Serialization helpers
  private serializeSentence(sentence: Sentence): string {
    return JSON.stringify({
      ...sentence,
      created_at: sentence.created_at.toISOString(),
      scheduling_state: {
        ...sentence.scheduling_state,
        due_at: sentence.scheduling_state.due_at.toISOString(),
        last_reviewed_at: sentence.scheduling_state.last_reviewed_at?.toISOString() || null,
      },
    });
  }

  private deserializeSentence(data: string): Sentence {
    const obj = JSON.parse(data);
    return {
      ...obj,
      created_at: new Date(obj.created_at),
      scheduling_state: {
        ...obj.scheduling_state,
        due_at: new Date(obj.scheduling_state.due_at),
        last_reviewed_at: obj.scheduling_state.last_reviewed_at ? new Date(obj.scheduling_state.last_reviewed_at) : null,
      },
    };
  }

  private serializeReviewEvent(event: ReviewEvent): string {
    return JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString(),
      computed_next_due_at: event.computed_next_due_at.toISOString(),
    });
  }

  private deserializeReviewEvent(data: string): ReviewEvent {
    const obj = JSON.parse(data);
    return {
      ...obj,
      timestamp: new Date(obj.timestamp),
      computed_next_due_at: new Date(obj.computed_next_due_at),
    };
  }

  private serializeSession(session: Session): string {
    return JSON.stringify({
      ...session,
      started_at: session.started_at.toISOString(),
      ended_at: session.ended_at?.toISOString() || null,
    });
  }

  private deserializeSession(data: string): Session {
    const obj = JSON.parse(data);
    return {
      ...obj,
      started_at: new Date(obj.started_at),
      ended_at: obj.ended_at ? new Date(obj.ended_at) : null,
    };
  }

  private deserializeSettings(data: string): Settings {
    return JSON.parse(data);
  }
}
