/**
 * Migration utility to backfill audio durations for existing sentences.
 * This should be run once to update all existing sentences with their audio durations.
 */
import { getStorage } from './storage';
import { getAudioDuration } from './audio-utils';
import { Sentence } from '@audio-retrieval-srs/core';

export async function migrateAudioDurations(): Promise<{
  total: number;
  updated: number;
  failed: number;
  errors: Array<{ sentenceId: string; error: string }>;
}> {
  const storage = getStorage();
  const sentences = await storage.getSentences();
  const results = {
    total: sentences.length,
    updated: 0,
    failed: 0,
    errors: [] as Array<{ sentenceId: string; error: string }>,
  };

  for (const sentence of sentences) {
    // Skip if duration already exists
    if (sentence.target_audio_duration_seconds && sentence.target_audio_duration_seconds > 0) {
      continue;
    }

    // Skip if no audio
    if (!sentence.target_audio_uri) {
      continue;
    }

    try {
      const audio = await storage.getAudio(sentence.id);
      if (!audio) {
        results.failed++;
        results.errors.push({
          sentenceId: sentence.id,
          error: 'Audio file not found',
        });
        continue;
      }

      const duration = await getAudioDuration(audio);
      if (duration !== null && duration > 0) {
        const updated: Sentence = {
          ...sentence,
          target_audio_duration_seconds: duration,
        };
        await storage.updateSentence(updated);
        results.updated++;
      } else {
        results.failed++;
        results.errors.push({
          sentenceId: sentence.id,
          error: 'Could not determine audio duration',
        });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        sentenceId: sentence.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
