import { v4 as uuidv4 } from 'uuid';
import { Sentence } from '@audio-retrieval-srs/core';
import { StorageAdapter } from '@audio-retrieval-srs/storage';

/**
 * Detect audio format from blob data by examining magic bytes/file headers
 * Returns the appropriate file extension: 'mp3', 'm4a', or 'wav'
 * Falls back to 'mp3' if format cannot be determined
 */
async function detectAudioFormat(audioBlob: Blob): Promise<'mp3' | 'm4a' | 'wav'> {
  try {
    // Read first 12 bytes to check magic bytes/headers
    const firstBytes = await audioBlob.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(firstBytes);
    
    // Check for MP3: MP3 files can start with ID3 tag (0x49 0x44 0x33 = "ID3")
    // or frame sync pattern (0xFF 0xFB or 0xFF 0xF3 or 0xFF 0xF2 or 0xFF 0xE3)
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      // ID3 tag found - this is MP3
      console.log('[Export] Audio format detected: MP3 (ID3 tag)');
      return 'mp3';
    }
    
    // Check for MP3 frame sync pattern (must have 0xFF followed by 0xE? or 0xF? indicating MP3)
    // Valid patterns: 0xFF 0xE0-0xFF, 0xFF 0xF0-0xFF (with proper bit patterns)
    if (bytes[0] === 0xFF && ((bytes[1] & 0xE0) === 0xE0 || (bytes[1] & 0xF0) === 0xF0)) {
      // Additional validation: check that it's likely MP3 (bits 4-7 of second byte should be 1111 for MPEG-1 Layer 3)
      if ((bytes[1] & 0xF6) >= 0xE0) {
        console.log('[Export] Audio format detected: MP3 (frame sync)');
        return 'mp3';
      }
    }
    
    // Check for M4A/MP4/QuickTime: should have "ftyp" at offset 4
    // Or can start with bytes 0x00 0x00 0x00 0x?? followed by "ftyp"
    if (bytes.length >= 8) {
      const ftypAt4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
      // Or check for QuickTime header pattern
      const isQuickTime = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
      
      if (ftypAt4 || isQuickTime) {
        // For M4A, we need to check if it's AAC in M4A container
        // Read more bytes to check the brand
        if (bytes.length >= 12) {
          const brandBytes = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
          // Common M4A brands: M4A, mp41, mp42, isom
          if (brandBytes === 'M4A ' || brandBytes === 'mp41' || brandBytes === 'mp42' || brandBytes === 'isom' || 
              brandBytes === 'M4A ' || bytes[8] === 0x4D && bytes[9] === 0x34 && bytes[10] === 0x41) {
            console.log('[Export] Audio format detected: M4A (ftyp + M4A brand)');
            return 'm4a';
          }
        }
        // If ftyp is present but we can't identify the brand, still assume M4A for AAC
        console.log('[Export] Audio format detected: M4A (ftyp present, assuming AAC)');
        return 'm4a';
      }
    }
    
    // Check for WAV/RIFF: starts with "RIFF" (0x52 0x49 0x46 0x46)
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      // Verify it says "WAVE" at offset 8
      if (bytes.length >= 12) {
        const waveCheck = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
        if (waveCheck) {
          console.log('[Export] Audio format detected: WAV (RIFF WAVE)');
          return 'wav';
        }
      }
    }
    
    // Fallback: check MIME type if magic bytes don't match
    const mimeType = audioBlob.type.toLowerCase();
    if (mimeType.includes('m4a') || mimeType.includes('mp4') || mimeType.includes('aac')) {
      console.warn('[Export] Audio format: MIME type suggests M4A, but magic bytes did not confirm. Using M4A based on MIME type.');
      return 'm4a';
    }
    if (mimeType.includes('wav') || mimeType.includes('wave')) {
      console.warn('[Export] Audio format: MIME type suggests WAV, but magic bytes did not confirm. Using WAV based on MIME type.');
      return 'wav';
    }
    
    // Default to MP3 if we can't determine
    console.warn('[Export] Audio format: Could not detect format from magic bytes or MIME type. Defaulting to MP3.');
    return 'mp3';
  } catch (error) {
    console.error('[Export] Error detecting audio format:', error);
    // Fallback to MP3 on error
    return 'mp3';
  }
}

/**
 * Audio Flashcards export package structure
 */
export interface AudioFlashcardsCardMeta {
  name: string;
  id: string; // UUID-[] format
  created: number; // ms timestamp
  order: string[]; // Audio file IDs without extensions, in playback order
}

export interface AudioFlashcardsDirectoryMeta {
  name: string;
  id: string; // UUID-* format
}

export interface ExportPackage {
  deckId: string; // UUID-* format
  deckName: string;
  cards: Array<{
    cardId: string; // UUID-[] format
    englishAudio: Blob;
    hungarianAudio: Blob;
    englishAudioId: string; // UUID for English audio file (without extension)
    hungarianAudioId: string; // UUID for Hungarian audio file (without extension)
    cardMeta: AudioFlashcardsCardMeta;
  }>;
}

/**
 * Generate a single card for a sentence
 * Returns the card data or throws an error
 */
export async function generateCardForSentence(
  sentence: Sentence,
  storage: StorageAdapter
): Promise<{
  cardId: string;
  englishAudio: Blob;
  hungarianAudio: Blob;
  englishAudioId: string;
  hungarianAudioId: string;
  cardMeta: AudioFlashcardsCardMeta;
}> {
  const cardId = `${uuidv4()}-[]`;
  
  // Get Hungarian audio (existing)
  const hungarianAudio = await storage.getAudio(sentence.id);
  if (!hungarianAudio) {
    throw new Error(`Missing Hungarian audio for sentence ${sentence.id}`);
  }

  // Generate English audio via TTS API
  const ttsResponse = await fetch('/api/tts/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: sentence.english_translation_text,
      language: 'en',
    }),
  });

  if (!ttsResponse.ok) {
    // Try to parse error message from JSON response
    let errorMessage = ttsResponse.statusText;
    try {
      const errorData = await ttsResponse.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    throw new Error(`TTS generation failed: ${errorMessage}`);
  }

  const englishAudio = await ttsResponse.blob();

  // Generate UUIDs for audio files (without extensions)
  const englishAudioId = uuidv4();
  const hungarianAudioId = uuidv4();

  // Create card.meta
  const cardMeta: AudioFlashcardsCardMeta = {
    name: sentence.english_translation_text,
    id: cardId,
    created: sentence.created_at.getTime(),
    order: [englishAudioId, hungarianAudioId],
  };

  return {
    cardId,
    englishAudio,
    hungarianAudio,
    englishAudioId,
    hungarianAudioId,
    cardMeta,
  };
}

/**
 * Generate an export package for selected sentences
 * @deprecated Use processSentencesIndividually for better error handling
 */
export async function generateExportPackage(
  sentences: Sentence[],
  storage: StorageAdapter
): Promise<ExportPackage> {
  const deckId = `${uuidv4()}-*`;
  const deckName = 'Hungarian Production Export';

  const cards = await Promise.all(
    sentences.map(sentence => generateCardForSentence(sentence, storage))
  );

  return {
    deckId,
    deckName,
    cards,
  };
}

/**
 * Create a ZIP file from the export package structure
 * Uses JSZip library - we'll need to add it as a dependency
 */
export async function createExportZip(packageData: ExportPackage): Promise<Blob> {
  console.log('[Export] createExportZip: Starting, cards count:', packageData.cards.length);
  console.log('[Export] Deck ID:', packageData.deckId);
  console.log('[Export] Deck Name:', packageData.deckName);
  
  if (packageData.cards.length === 0) {
    throw new Error('Cannot create ZIP with no cards');
  }
  
  // Validate cards structure
  for (let i = 0; i < packageData.cards.length; i++) {
    const card = packageData.cards[i];
    console.log(`[Export] Card ${i}:`, {
      cardId: card.cardId,
      hasEnglishAudio: !!card.englishAudio,
      englishAudioSize: card.englishAudio?.size || 0,
      hasHungarianAudio: !!card.hungarianAudio,
      hungarianAudioSize: card.hungarianAudio?.size || 0,
      englishAudioId: card.englishAudioId,
      hungarianAudioId: card.hungarianAudioId,
    });
  }
  
  try {
    // Dynamic import of JSZip to avoid bundling issues
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Use exact deck ID (UUID-*) as required by Audio Flashcards format
    const deckFolder = zip.folder(packageData.deckId);
    if (!deckFolder) {
      throw new Error('Failed to create deck folder in ZIP');
    }
    console.log('[Export] Created deck folder (exact Audio Flashcards format):', packageData.deckId);

    // Add directory.meta
    const directoryMeta: AudioFlashcardsDirectoryMeta = {
      name: packageData.deckName,
      id: packageData.deckId,
    };
    const directoryMetaJson = JSON.stringify(directoryMeta, null, 2);
    deckFolder.file('directory.meta', directoryMetaJson);
    console.log('[Export] Added directory.meta:', directoryMetaJson.length, 'bytes');

    // Add each card folder
    let filesAddedCount = 1; // Start with directory.meta
    for (let i = 0; i < packageData.cards.length; i++) {
      const card = packageData.cards[i];
      console.log(`[Export] Processing card ${i + 1}/${packageData.cards.length}:`, card.cardId);
      
      // Use exact card ID (UUID-[]) as required by Audio Flashcards format
      const cardFolder = deckFolder.folder(card.cardId);
      if (!cardFolder) {
        throw new Error(`Failed to create card folder ${card.cardId} in ZIP`);
      }
      console.log(`[Export] Created card folder (exact Audio Flashcards format):`, card.cardId);

      // Add card.meta
      const cardMetaJson = JSON.stringify(card.cardMeta, null, 2);
      cardFolder.file('card.meta', cardMetaJson);
      filesAddedCount++;
      console.log(`[Export] Added card.meta for ${card.cardId}:`, cardMetaJson.length, 'bytes');

      // Determine file extension for English audio (always MP3 from TTS)
      const englishExt = 'mp3';
      
      // Detect actual format for Hungarian audio from the blob data itself
      // This ensures the extension matches the actual format for Audio Flashcards playback
      console.log(`[Export] Detecting Hungarian audio format for card ${card.cardId}...`);
      const hungarianExt = await detectAudioFormat(card.hungarianAudio);
      console.log(`[Export] Hungarian audio format detected: ${hungarianExt}`);

      // Use the audio IDs from the card
      const englishAudioId = card.englishAudioId;
      const hungarianAudioId = card.hungarianAudioId;

      // Validate audio blobs before adding
      if (!card.englishAudio || card.englishAudio.size === 0) {
        throw new Error(`English audio blob is empty for card ${card.cardId}`);
      }
      if (!card.hungarianAudio || card.hungarianAudio.size === 0) {
        throw new Error(`Hungarian audio blob is empty for card ${card.cardId}`);
      }

      // Add audio files with proper names (matching the order in cardMeta)
      // Convert blobs to ArrayBuffer to ensure compatibility
      console.log(`[Export] Converting blobs to ArrayBuffer for card ${card.cardId}...`);
      const englishAudioBuffer = await card.englishAudio.arrayBuffer();
      const hungarianAudioBuffer = await card.hungarianAudio.arrayBuffer();
      
      console.log(`[Export] ArrayBuffers created - English: ${englishAudioBuffer.byteLength} bytes, Hungarian: ${hungarianAudioBuffer.byteLength} bytes`);
      
      const englishFileName = `${englishAudioId}.${englishExt}`;
      const hungarianFileName = `${hungarianAudioId}.${hungarianExt}`;
      
      // Add files with explicit binary flag for better compatibility
      cardFolder.file(englishFileName, englishAudioBuffer, { binary: true });
      filesAddedCount++;
      cardFolder.file(hungarianFileName, hungarianAudioBuffer, { binary: true });
      filesAddedCount++;
      
      console.log(`[Export] Added audio files for ${card.cardId}: ${englishFileName} (${englishAudioBuffer.byteLength} bytes), ${hungarianFileName} (${hungarianAudioBuffer.byteLength} bytes)`);
    }

    console.log(`[Export] Total files added to ZIP: ${filesAddedCount} (expected: ${1 + packageData.cards.length * 3} = 1 directory.meta + ${packageData.cards.length} card.meta + ${packageData.cards.length * 2} audio files)`);

    // Verify ZIP structure before generating
    const zipFiles: string[] = [];
    zip.forEach((relativePath, file) => {
      const isDir = file.dir ? '[DIR]' : '[FILE]';
      const size = file._data ? (file._data.uncompressedSize || 'unknown') : 'unknown';
      zipFiles.push(`${isDir} ${relativePath} (${size} bytes)`);
    });
    console.log('[Export] ZIP structure before generation:');
    zipFiles.forEach(path => console.log('  ', path));
    console.log('[Export] Total entries in ZIP object:', zipFiles.length);
    
    // Also check the internal files object directly
    const filesObj = (zip as any).files;
    if (filesObj) {
      const fileKeys = Object.keys(filesObj);
      console.log('[Export] Internal zip.files object has', fileKeys.length, 'keys');
      if (fileKeys.length === 0) {
        console.error('[Export] ERROR: zip.files is empty! Files were not added correctly!');
      } else {
        // Show first few entries
        fileKeys.slice(0, 5).forEach(key => {
          const file = filesObj[key];
          console.log(`  - "${key}": dir=${file.dir}, data=${!!file._data}, size=${file._data?.uncompressedSize || 'N/A'}`);
        });
        if (fileKeys.length > 5) {
          console.log(`  ... and ${fileKeys.length - 5} more entries`);
        }
      }
    } else {
      console.error('[Export] ERROR: zip.files object is missing!');
    }

    // Generate ZIP with explicit options for maximum Windows Explorer compatibility
    console.log('[Export] Generating ZIP blob...');
    
    // Windows Explorer is very picky - use simple, compatible settings:
    // - type: 'blob' is most compatible with browser downloads
    // - compression: 'DEFLATE' (ID 8) is standard and required for Windows
    // - compressionOptions: level 6 is balanced
    // - streamFiles: false ensures all files are generated synchronously
    // Note: JSZip will automatically avoid ZIP64 for files < 4GB (our case)
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6, // Balanced compression
      },
      streamFiles: false,
    });
    console.log('[Export] ZIP blob generated directly:', blob.size, 'bytes, type:', blob.type);
    
    // Validate the blob
    if (!blob || blob.size === 0) {
      throw new Error('Generated ZIP blob is empty');
    }
    
    if (blob.type && blob.type !== 'application/zip' && blob.type !== 'application/x-zip-compressed') {
      console.warn('[Export] Unexpected blob type:', blob.type, '- expected application/zip');
    }
    
    // Try to verify the ZIP by reading it back
    try {
      const JSZip = (await import('jszip')).default;
      const zipBuffer = await blob.arrayBuffer();
      const verifyZip = new JSZip();
      const loadedZip = await verifyZip.loadAsync(zipBuffer);
      
      const loadedFiles: string[] = [];
      loadedZip.forEach((relativePath, file) => {
        const isDir = file.dir ? '[DIR]' : '[FILE]';
        const size = file._data ? (file._data.uncompressedSize || 'unknown') : 'unknown';
        loadedFiles.push(`${isDir} ${relativePath} (${size} bytes)`);
      });
      
      console.log('[Export] Verified ZIP by reading it back:');
      loadedFiles.forEach(path => console.log('  ', path));
      console.log('[Export] Verified ZIP has', loadedFiles.length, 'entries');
      
      if (loadedFiles.length === 0) {
        throw new Error('ZIP verification failed: no files found in generated ZIP');
      }
    } catch (verifyError) {
      console.error('[Export] ZIP verification failed:', verifyError);
      // Don't throw here - the ZIP might still be valid even if we can't verify it
      console.warn('[Export] Continuing despite verification failure - ZIP might still be valid');
    }
    
    return blob;
  } catch (error) {
    console.error('[Export] Error creating ZIP:', error);
    console.error('[Export] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

/**
 * Create a ZIP file containing only audio files for selected sentences
 * This does not call any APIs - it uses existing audio from storage
 */
export async function createAudioOnlyZip(
  sentences: Array<{ id: string; english_translation_text: string }>,
  storage: StorageAdapter
): Promise<Blob> {
  console.log('[Export] createAudioOnlyZip: Starting, sentences count:', sentences.length);
  
  if (sentences.length === 0) {
    throw new Error('Cannot create ZIP with no sentences');
  }
  
  try {
    // Dynamic import of JSZip to avoid bundling issues
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Process each sentence
    let filesAddedCount = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      console.log(`[Export] Processing sentence ${i + 1}/${sentences.length}: ${sentence.id}`);
      
      // Get audio from storage
      const audio = await storage.getAudio(sentence.id);
      if (!audio) {
        console.warn(`[Export] No audio found for sentence ${sentence.id}, skipping`);
        continue;
      }

      // Detect audio format
      const audioExt = await detectAudioFormat(audio);
      console.log(`[Export] Audio format detected: ${audioExt} for sentence ${sentence.id}`);

      // Create a safe filename from the English text (sanitize for filesystem)
      const safeFilename = sentence.english_translation_text
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 50) // Limit length
        || `sentence_${sentence.id.substring(0, 8)}`; // Fallback to sentence ID

      const fileName = `${safeFilename}.${audioExt}`;
      
      // Convert blob to ArrayBuffer
      const audioBuffer = await audio.arrayBuffer();
      
      // Add file to ZIP
      zip.file(fileName, audioBuffer, { binary: true });
      filesAddedCount++;
      
      console.log(`[Export] Added audio file: ${fileName} (${audioBuffer.byteLength} bytes)`);
    }

    if (filesAddedCount === 0) {
      throw new Error('No audio files found to export');
    }

    console.log(`[Export] Total audio files added to ZIP: ${filesAddedCount}`);

    // Generate ZIP
    console.log('[Export] Generating audio-only ZIP blob...');
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6,
      },
      streamFiles: false,
    });
    
    console.log('[Export] Audio-only ZIP blob generated:', blob.size, 'bytes, type:', blob.type);
    
    // Validate the blob
    if (!blob || blob.size === 0) {
      throw new Error('Generated audio-only ZIP blob is empty');
    }
    
    return blob;
  } catch (error) {
    console.error('[Export] Error creating audio-only ZIP:', error);
    console.error('[Export] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}
