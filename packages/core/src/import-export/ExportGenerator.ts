import { Sentence } from '../models/Sentence';
import { ReviewEvent } from '../models/ReviewEvent';
import { Session } from '../models/Session';
import { Settings } from '../models/Settings';

export interface ExportData {
  sentences: Sentence[];
  reviewEvents: ReviewEvent[];
  sessions: Session[];
  settings: Settings;
  audioFiles: Array<{
    sentenceId: string;
    filename: string;
    data: Blob | ArrayBuffer;
  }>;
}

/**
 * Generates export data structure.
 */
export function generateExportData(
  sentences: Sentence[],
  reviewEvents: ReviewEvent[],
  sessions: Session[],
  settings: Settings,
  audioFiles: Array<{ sentenceId: string; filename: string; data: Blob | ArrayBuffer }>
): ExportData {
  return {
    sentences,
    reviewEvents,
    sessions,
    settings,
    audioFiles,
  };
}

/**
 * Converts export data to JSON format (for sentences, events, sessions, settings).
 */
export function exportToJSON(data: ExportData): {
  sentences: string;
  reviewEvents: string;
  sessions: string;
  settings: string;
} {
  return {
    sentences: JSON.stringify(data.sentences, null, 2),
    reviewEvents: JSON.stringify(data.reviewEvents, null, 2),
    sessions: JSON.stringify(data.sessions, null, 2),
    settings: JSON.stringify(data.settings, null, 2),
  };
}

/**
 * Creates a zip structure description (actual zip creation happens in platform-specific code).
 */
export interface ZipStructure {
  files: Array<{
    path: string;
    content: string | Blob | ArrayBuffer;
  }>;
}

export function createZipStructure(data: ExportData): ZipStructure {
  const jsonData = exportToJSON(data);
  
  const files: ZipStructure['files'] = [
    {
      path: 'sentences.json',
      content: jsonData.sentences,
    },
    {
      path: 'review_events.json',
      content: jsonData.reviewEvents,
    },
    {
      path: 'sessions.json',
      content: jsonData.sessions,
    },
    {
      path: 'settings.json',
      content: jsonData.settings,
    },
  ];
  
  // Add audio files
  data.audioFiles.forEach(audioFile => {
    files.push({
      path: `audio/${audioFile.filename}`,
      content: audioFile.data instanceof Blob ? audioFile.data : new Blob([audioFile.data]),
    });
  });
  
  return { files };
}
