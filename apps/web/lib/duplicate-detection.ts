import { Sentence } from '@audio-retrieval-srs/core';
import { DuplicateMatch } from '@/types/whisper';

/**
 * Calculates Levenshtein distance between two strings.
 * Returns a similarity score between 0 and 1 (1 = identical, 0 = completely different).
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matrix: number[][] = [];
  const len1 = s1.length;
  const len2 = s2.length;

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Finds duplicate matches for a given text against existing sentences.
 * Uses fuzzy matching with a similarity threshold.
 */
export function findDuplicateMatches(
  newText: string,
  existingSentences: Sentence[],
  language: 'english' | 'target',
  threshold: number = 0.8
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const sentence of existingSentences) {
    let similarity = 0;
    let matchType: 'english' | 'target' | 'both' = 'english';

    // Check English translation
    if (sentence.english_translation_text) {
      const englishSim = levenshteinSimilarity(newText, sentence.english_translation_text);
      if (englishSim > similarity) {
        similarity = englishSim;
        matchType = 'english';
      }
    }

    // Check target language text
    if (sentence.target_text && language === 'target') {
      const targetSim = levenshteinSimilarity(newText, sentence.target_text);
      if (targetSim > similarity) {
        similarity = targetSim;
        matchType = 'target';
      }
    }

    // Check if both match
    if (sentence.english_translation_text && sentence.target_text) {
      const englishSim = levenshteinSimilarity(newText, sentence.english_translation_text);
      const targetSim = levenshteinSimilarity(newText, sentence.target_text);
      if (englishSim >= threshold && targetSim >= threshold) {
        similarity = Math.max(englishSim, targetSim);
        matchType = 'both';
      }
    }

    // Add match if above threshold
    if (similarity >= threshold) {
      matches.push({
        sentence,
        similarity,
        matchType,
      });
    }
  }

  // Sort by similarity (highest first)
  return matches.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Finds duplicate matches for both original and English text.
 */
export function findDuplicateMatchesForSegment(
  originalText: string,
  englishText: string,
  existingSentences: Sentence[],
  threshold: number = 0.8
): {
  originalMatches: DuplicateMatch[];
  englishMatches: DuplicateMatch[];
  bothMatch: boolean;
} {
  const originalMatches = findDuplicateMatches(originalText, existingSentences, 'target', threshold);
  const englishMatches = findDuplicateMatches(englishText, existingSentences, 'english', threshold);

  // Check if any sentence matches both
  const bothMatch = originalMatches.some(om =>
    englishMatches.some(em => em.sentence.id === om.sentence.id)
  );

  return {
    originalMatches,
    englishMatches,
    bothMatch,
  };
}
