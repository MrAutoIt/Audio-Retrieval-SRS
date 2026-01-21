import { StorageAdapter, PendingAudioMetadata } from '../interface/StorageAdapter';
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

interface PendingAudioRecord {
  audioId: string;
  data: Blob;
  metadata: string; // JSON stringified PendingAudioMetadata
}

interface ExportMetadataRecord {
  sentenceId: string;
  exportedAt: string; // ISO string
  exportPackageId: string;
  cardId: string;
}

class AudioRetrievalDB extends Dexie {
  sentences!: Table<SentenceRecord>;
  reviewEvents!: Table<ReviewEventRecord>;
  sessions!: Table<SessionRecord>;
  settings!: Table<SettingsRecord>;
  audio!: Table<AudioRecord>;
  pendingAudio!: Table<PendingAudioRecord>;
  exportMetadata!: Table<ExportMetadataRecord>;

  constructor() {
    super('AudioRetrievalSRS');
    this.version(1).stores({
      sentences: 'id',
      reviewEvents: 'id, sentence_id, session_id, timestamp',
      sessions: 'id, started_at',
      settings: 'id',
      audio: 'sentenceId',
    });
    this.version(2).stores({
      sentences: 'id',
      reviewEvents: 'id, sentence_id, session_id, timestamp',
      sessions: 'id, started_at',
      settings: 'id',
      audio: 'sentenceId',
      pendingAudio: 'audioId',
    });
    this.version(3).stores({
      sentences: 'id',
      reviewEvents: 'id, sentence_id, session_id, timestamp',
      sessions: 'id, started_at',
      settings: 'id',
      audio: 'sentenceId',
      pendingAudio: 'audioId',
      exportMetadata: 'sentenceId',
    });
  }
}

export class IndexedDBStorage implements StorageAdapter {
  private db: AudioRetrievalDB;

  constructor() {
    this.db = new AudioRetrievalDB();
    // Verify database is open and exportMetadata table exists
    this.db.open().then(() => {
      console.log('[IndexedDB] Database opened successfully');
      console.log('[IndexedDB] Database version:', this.db.verno);
      console.log('[IndexedDB] Tables:', Object.keys(this.db.tables));
    }).catch(err => {
      console.error('[IndexedDB] Failed to open database:', err);
    });
  }

  // Sentences
  async getSentences(languageCode?: string): Promise<Sentence[]> {
    const records = await this.db.sentences.toArray();
    const sentences = records.map(r => this.deserializeSentence(r.data));
    if (languageCode) {
      return sentences.filter(s => s.language_code === languageCode);
    }
    return sentences;
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

  // Pending Audio
  async savePendingAudio(audioId: string, audioData: Blob | ArrayBuffer, metadata: PendingAudioMetadata): Promise<void> {
    const blob = audioData instanceof Blob ? audioData : new Blob([audioData]);
    await this.db.pendingAudio.put({
      audioId,
      data: blob,
      metadata: JSON.stringify({
        ...metadata,
        uploadedAt: metadata.uploadedAt.toISOString(),
        processedAt: metadata.processedAt?.toISOString(),
      }),
    });
  }

  async getPendingAudio(audioId: string): Promise<Blob | null> {
    const record = await this.db.pendingAudio.get(audioId);
    return record?.data || null;
  }

  async getAllPendingAudios(languageCode?: string): Promise<PendingAudioMetadata[]> {
    const records = await this.db.pendingAudio.toArray();
    const metadataList = records.map(r => {
      const meta = JSON.parse(r.metadata);
      return {
        ...meta,
        uploadedAt: new Date(meta.uploadedAt),
        processedAt: meta.processedAt ? new Date(meta.processedAt) : undefined,
      } as PendingAudioMetadata;
    });
    if (languageCode) {
      return metadataList.filter(m => m.languageCode === languageCode);
    }
    return metadataList;
  }

  async deletePendingAudio(audioId: string): Promise<void> {
    await this.db.pendingAudio.delete(audioId);
  }

  async updatePendingAudioMetadata(audioId: string, metadata: Partial<PendingAudioMetadata>): Promise<void> {
    try {
      console.log('[Storage] === updatePendingAudioMetadata START ===', audioId);
      const record = await this.db.pendingAudio.get(audioId);
      if (!record) {
        throw new Error(`Pending audio ${audioId} not found`);
      }
      const existing = JSON.parse(record.metadata);
      
      console.log('[Storage] updatePendingAudioMetadata called:', {
        audioId,
        metadataKeys: Object.keys(metadata),
        metadataHasOwnProperty: Object.prototype.hasOwnProperty.call(metadata, 'processedAt'),
        hasProcessedAt: 'processedAt' in metadata,
        processedAtValue: metadata.processedAt,
        processedAtType: typeof metadata.processedAt,
        existingProcessedAt: existing.processedAt
      });
    
    // Determine the new processedAt value
    // Use hasOwnProperty to check if processedAt was explicitly provided (even if undefined)
    let processedAtValue: Date | undefined | null;
    if (Object.prototype.hasOwnProperty.call(metadata, 'processedAt')) {
      // If processedAt is explicitly provided in metadata (even if undefined or null), use it
      // null means explicitly remove it
      processedAtValue = metadata.processedAt === null ? undefined : metadata.processedAt;
      console.log('[Storage] processedAt explicitly provided:', metadata.processedAt, '-> resolved to:', processedAtValue);
    } else {
      // Otherwise, preserve existing value
      processedAtValue = existing.processedAt ? new Date(existing.processedAt) : undefined;
      console.log('[Storage] preserving existing processedAt:', processedAtValue);
    }
    
    // Build the serialized metadata object
    const serializedMetadata: any = {
      id: existing.id || metadata.id,
      filename: metadata.filename ?? existing.filename,
      languageCode: metadata.languageCode ?? existing.languageCode,
      detectedLanguage: metadata.detectedLanguage ?? existing.detectedLanguage,
      uploadedAt: existing.uploadedAt ? new Date(existing.uploadedAt).toISOString() : new Date().toISOString(),
      segments: metadata.segments ?? existing.segments,
      tags: metadata.tags ?? existing.tags,
    };
    
    // Only include processedAt in JSON if it's defined
    if (processedAtValue) {
      serializedMetadata.processedAt = processedAtValue.toISOString();
      console.log('[Storage] Including processedAt in serialized metadata:', serializedMetadata.processedAt);
    } else {
      console.log('[Storage] processedAt is undefined, NOT including in serialized metadata');
    }
    
    console.log('[Storage] Final serialized metadata keys:', Object.keys(serializedMetadata));
    
    await this.db.pendingAudio.update(audioId, {
      metadata: JSON.stringify(serializedMetadata),
    });
    
    // Verify what was stored
    const verifyRecord = await this.db.pendingAudio.get(audioId);
    const verifyMeta = JSON.parse(verifyRecord!.metadata);
    console.log('[Storage] After update, stored metadata has processedAt:', verifyMeta.processedAt);
    console.log('[Storage] === updatePendingAudioMetadata END ===');
    } catch (error) {
      console.error('[Storage] ERROR in updatePendingAudioMetadata:', error);
      throw error;
    }
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

  // Export Metadata
  async getExportMetadata(sentenceId: string): Promise<{ exportedAt: Date; exportPackageId: string; cardId: string } | null> {
    const record = await this.db.exportMetadata.get(sentenceId);
    if (!record) return null;
    return {
      exportedAt: new Date(record.exportedAt),
      exportPackageId: record.exportPackageId,
      cardId: record.cardId,
    };
  }

  async getAllExportMetadata(sentenceIds: string[]): Promise<Map<string, { exportedAt: Date; exportPackageId: string; cardId: string }>> {
    const metadataMap = new Map<string, { exportedAt: Date; exportPackageId: string; cardId: string }>();
    
    if (sentenceIds.length === 0) {
      console.log('[IndexedDB] getAllExportMetadata: No sentence IDs provided');
      return metadataMap;
    }
    
    console.log(`[IndexedDB] getAllExportMetadata: Querying for ${sentenceIds.length} sentence IDs`);
    
    // First, check how many records exist in the table
    const totalCount = await this.db.exportMetadata.count();
    console.log(`[IndexedDB] getAllExportMetadata: Total records in exportMetadata table: ${totalCount}`);
    
    // Batch fetch all metadata records at once
    const records = await this.db.exportMetadata.where('sentenceId').anyOf(sentenceIds).toArray();
    console.log(`[IndexedDB] getAllExportMetadata: Found ${records.length} matching records`);
    
    if (records.length === 0 && totalCount > 0) {
      console.warn('[IndexedDB] getAllExportMetadata: No matching records found, but table has records. Checking if sentenceIds match...');
      // Debug: show all records in the table
      const allRecords = await this.db.exportMetadata.toArray();
      console.log('[IndexedDB] getAllExportMetadata: All records in table:', allRecords.map(r => ({ sentenceId: r.sentenceId, exportedAt: r.exportedAt })));
      console.log('[IndexedDB] getAllExportMetadata: Looking for sentenceIds:', sentenceIds);
    }
    
    for (const record of records) {
      console.log(`[IndexedDB] getAllExportMetadata: Processing record for sentenceId: ${record.sentenceId}`);
      metadataMap.set(record.sentenceId, {
        exportedAt: new Date(record.exportedAt),
        exportPackageId: record.exportPackageId,
        cardId: record.cardId,
      });
    }
    
    console.log(`[IndexedDB] getAllExportMetadata: Returning map with ${metadataMap.size} entries`);
    return metadataMap;
  }

  async saveExportMetadata(sentenceId: string, exportPackageId: string, cardId: string): Promise<void> {
    const record: ExportMetadataRecord = {
      sentenceId,
      exportedAt: new Date().toISOString(),
      exportPackageId,
      cardId,
    };
    console.log('[IndexedDB] saveExportMetadata: Saving record:', record);
    await this.db.exportMetadata.put(record);
    console.log('[IndexedDB] saveExportMetadata: Record saved successfully');
    
    // Verify it was saved
    const verify = await this.db.exportMetadata.get(sentenceId);
    if (verify) {
      console.log('[IndexedDB] saveExportMetadata: Verified saved record:', verify);
    } else {
      console.error('[IndexedDB] saveExportMetadata: WARNING - Record not found after save!');
    }
  }

  async deleteExportMetadata(sentenceId: string): Promise<void> {
    await this.db.exportMetadata.delete(sentenceId);
  }

  // Utility
  async clearAll(): Promise<void> {
    await this.db.sentences.clear();
    await this.db.reviewEvents.clear();
    await this.db.sessions.clear();
    await this.db.settings.clear();
    await this.db.audio.clear();
    await this.db.pendingAudio.clear();
    await this.db.exportMetadata.clear();
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
