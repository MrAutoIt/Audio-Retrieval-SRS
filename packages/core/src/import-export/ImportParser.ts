import { Sentence, createSentence } from '../models/Sentence';

export interface ImportSentenceData {
  english_translation_text: string;
  target_text?: string;
  language_code?: string;
  tags?: string[];
  id?: string;
}

const MAX_AUDIO_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface AudioFileInfo {
  file: File;
  sentenceId?: string;
  filename: string;
}

/**
 * Validates an audio file (format and size).
 */
export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  // Check file type (MP3)
  if (!file.type.includes('audio/mpeg') && !file.name.toLowerCase().endsWith('.mp3')) {
    return {
      valid: false,
      error: `Invalid audio format: ${file.type}. Expected MP3.`,
    };
  }
  
  // Check file size
  if (file.size > MAX_AUDIO_FILE_SIZE) {
    return {
      valid: false,
      error: `Audio file too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 5MB.`,
    };
  }
  
  return { valid: true };
}

/**
 * Parses CSV data into sentence data.
 */
export function parseCSV(csvText: string): ImportSentenceData[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const data: ImportSentenceData[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Partial<ImportSentenceData> = {};
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      switch (header) {
        case 'english_translation_text':
        case 'english':
        case 'translation':
          row.english_translation_text = value;
          break;
        case 'target_text':
        case 'target':
        case 'text':
          row.target_text = value || undefined;
          break;
        case 'language_code':
        case 'language':
          row.language_code = value || 'hu';
          break;
        case 'tags':
          row.tags = value ? value.split(';').map(t => t.trim()) : undefined;
          break;
        case 'id':
          row.id = value || undefined;
          break;
      }
    });
    
    if (row.english_translation_text) {
      data.push({
        english_translation_text: row.english_translation_text,
        target_text: row.target_text,
        language_code: row.language_code || 'hu',
        tags: row.tags,
        id: row.id,
      });
    }
  }
  
  return data;
}

/**
 * Parses JSON data into sentence data.
 */
export function parseJSON(jsonText: string): ImportSentenceData[] {
  try {
    const data = JSON.parse(jsonText);
    if (Array.isArray(data)) {
      return data.map(item => ({
        english_translation_text: item.english_translation_text || item.english || item.translation,
        target_text: item.target_text || item.target,
        language_code: item.language_code || item.language || 'hu',
        tags: item.tags,
        id: item.id,
      })).filter(item => item.english_translation_text);
    }
    return [];
  } catch (error) {
    throw new Error(`Invalid JSON format: ${error}`);
  }
}

/**
 * Matches audio files to sentences by filename or ID.
 */
export function matchAudioToSentences(
  audioFiles: AudioFileInfo[],
  sentences: ImportSentenceData[]
): Map<string, string> {
  const mapping = new Map<string, string>(); // sentenceId -> audio filename/URI
  
  audioFiles.forEach(audioFile => {
    // Try to match by ID first
    if (audioFile.sentenceId) {
      const sentence = sentences.find(s => s.id === audioFile.sentenceId);
      if (sentence) {
        mapping.set(sentence.id || '', audioFile.filename);
        return;
      }
    }
    
    // Try to match by filename (without extension)
    const filenameWithoutExt = audioFile.filename.replace(/\.(mp3|wav|m4a)$/i, '');
    const sentence = sentences.find(s => {
      const sentenceId = s.id || '';
      return sentenceId === filenameWithoutExt || 
             s.english_translation_text.toLowerCase().includes(filenameWithoutExt.toLowerCase());
    });
    
    if (sentence) {
      mapping.set(sentence.id || '', audioFile.filename);
    }
  });
  
  return mapping;
}
