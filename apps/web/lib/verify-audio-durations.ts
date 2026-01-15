/**
 * Utility to verify that audio durations are correctly stored for all sentences.
 * This can be used to check migration results.
 */
import { getStorage } from './storage';
import { Sentence } from '@audio-retrieval-srs/core';

export interface VerificationResult {
  total: number;
  withAudio: number;
  withDuration: number;
  missingDuration: number;
  invalidDuration: number;
  sentences: Array<{
    id: string;
    englishText: string;
    hasAudio: boolean;
    hasDuration: boolean;
    duration?: number;
    status: 'ok' | 'missing_duration' | 'invalid_duration' | 'no_audio';
  }>;
}

export async function verifyAudioDurations(): Promise<VerificationResult> {
  const storage = getStorage();
  const sentences = await storage.getSentences();
  
  const result: VerificationResult = {
    total: sentences.length,
    withAudio: 0,
    withDuration: 0,
    missingDuration: 0,
    invalidDuration: 0,
    sentences: [],
  };

  for (const sentence of sentences) {
    const hasAudio = !!sentence.target_audio_uri;
    const hasDuration = !!(sentence.target_audio_duration_seconds && sentence.target_audio_duration_seconds > 0);
    const duration = sentence.target_audio_duration_seconds;
    
    let status: 'ok' | 'missing_duration' | 'invalid_duration' | 'no_audio';
    
    if (!hasAudio) {
      status = 'no_audio';
    } else {
      result.withAudio++;
      
      if (!hasDuration) {
        status = 'missing_duration';
        result.missingDuration++;
      } else if (duration && (duration <= 0 || !isFinite(duration))) {
        status = 'invalid_duration';
        result.invalidDuration++;
      } else {
        status = 'ok';
        result.withDuration++;
      }
    }
    
    result.sentences.push({
      id: sentence.id,
      englishText: sentence.english_translation_text,
      hasAudio,
      hasDuration,
      duration,
      status,
    });
  }

  return result;
}
