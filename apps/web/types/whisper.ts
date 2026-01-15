import { Sentence } from '@audio-retrieval-srs/core';

export interface WhisperSegment {
  id: string;
  start: number; // seconds (editable)
  end: number; // seconds (editable)
  originalText: string;
  englishText: string;
  isAdjusted?: boolean; // true if user manually adjusted times
}

export interface DuplicateMatch {
  sentence: Sentence;
  similarity: number; // 0-1
  matchType: 'english' | 'target' | 'both';
}

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activeSegmentId: string | null; // which segment is currently playing
}

export interface WhisperTranscriptionResponse {
  segments: WhisperSegment[];
  detectedLanguage: string;
  languageMatch: boolean;
  duration: number;
}
