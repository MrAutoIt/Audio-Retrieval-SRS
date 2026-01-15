/**
 * Validates that a text segment is a proper sentence.
 * Checks for sentence endings, minimum length, and basic structure.
 * 
 * Note: Whisper segments may not always end with punctuation, so we're more lenient.
 */
export function isValidSentence(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();

  // Minimum length check (at least 2 characters)
  if (trimmed.length < 2) {
    return false;
  }

  // Check for basic sentence structure (should have at least one letter/number)
  // This helps filter out fragments like "..." or "!!"
  const hasContent = /[a-zA-Z0-9\u00C0-\u017F\u0100-\u017F]/.test(trimmed); // Includes accented characters and Hungarian characters
  if (!hasContent) {
    return false;
  }

  // Check that it's not just punctuation
  const onlyPunctuation = /^[^\w\s]+$/.test(trimmed);
  if (onlyPunctuation) {
    return false;
  }

  // Check for reasonable word count (at least 1 word)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) {
    return false;
  }

  // Whisper segments may not end with punctuation, so we don't require it
  // But if it does have ending punctuation, that's a bonus
  // We'll accept segments that have meaningful content

  return true;
}

/**
 * Splits text into individual sentences.
 * Detects sentence boundaries by looking for sentence-ending punctuation followed by whitespace or end of string.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  // Split by sentence-ending punctuation (. ! ?) followed by whitespace or end of string
  // This regex looks for: punctuation + optional quote + whitespace or end of string
  const sentenceRegex = /([.!?]+["']?)\s+/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceRegex.exec(trimmed)) !== null) {
    const sentence = trimmed.substring(lastIndex, match.index + match[1].length).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    lastIndex = match.index + match[0].length;
  }

  // Add the last sentence (or the whole text if no matches)
  const remaining = trimmed.substring(lastIndex).trim();
  if (remaining.length > 0) {
    sentences.push(remaining);
  }

  // If no sentences were found (no punctuation), return the whole text as one sentence
  if (sentences.length === 0) {
    return [trimmed];
  }

  return sentences.filter(s => s.length > 0);
}

/**
 * Checks if text contains multiple sentences.
 */
export function hasMultipleSentences(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  // Look for sentence-ending punctuation in the middle of the text
  // (not just at the end)
  const sentenceEndings = /[.!?]+["']?\s+[A-Z\u00C0-\u017F]/;
  return sentenceEndings.test(trimmed);
}

/**
 * Filters segments to only include valid sentences.
 * 
 * Note: We're lenient here - Whisper segments are often chunks of speech
 * that may not have perfect sentence structure or punctuation.
 */
export function filterValidSentences<T extends { originalText: string; englishText: string }>(
  segments: T[]
): T[] {
  return segments.filter(seg => {
    const origValid = isValidSentence(seg.originalText);
    const engValid = isValidSentence(seg.englishText);
    
    // If either text is valid, include the segment
    // This is more lenient - we don't require both to be perfect
    return origValid || engValid;
  });
}
