import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const expectedLanguage = formData.get('expectedLanguage') as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Check file size (Whisper API limit is 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 25MB' },
        { status: 400 }
      );
    }

    // Convert File to format OpenAI expects
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type });
    const audioFileForOpenAI = new File([audioBlob], audioFile.name, {
      type: audioFile.type || 'audio/mpeg',
    });

    // Call Whisper API with transcription (original language)
    const transcription = await openai.audio.transcriptions.create({
      file: audioFileForOpenAI,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: expectedLanguage || undefined, // Optional hint
    });

    const segments = transcription.segments || [];
    
    // Split segments that contain multiple sentences and translate each sentence individually
    // This ensures strict one-sentence-per-segment enforcement
    const { splitIntoSentences } = await import('@/lib/sentence-validation');
    
    const finalSegments: Array<{
      start: number;
      end: number;
      originalText: string;
      englishText: string;
    }> = [];
    
    if (segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const originalText = segment.text.trim();
        
        if (!originalText) {
          continue;
        }
        
        // Split the original text into individual sentences
        const originalSentences = splitIntoSentences(originalText);
        const segmentDuration = segment.end - segment.start;
        const timePerSentence = segmentDuration / originalSentences.length;
        
        // Translate each sentence individually
        for (let j = 0; j < originalSentences.length; j++) {
          const sentence = originalSentences[j];
          
          if (!sentence || sentence.trim().length === 0) {
            continue;
          }
          
          try {
            const translationResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini', // Using mini for cost efficiency, can upgrade to gpt-4o for better quality
              messages: [
                {
                  role: 'system',
                  content: `You are a professional translator. Translate the following SINGLE SENTENCE from ${expectedLanguage || 'the source language'} to English. 

IMPORTANT RULES:
1. Translate ONLY ONE SENTENCE - do not add multiple sentences
2. Preserve all proper nouns (names of people, places, characters, etc.) exactly as they appear in the original or use their standard English equivalents
3. Maintain the tone and style of the original text
4. Keep cultural references and context intact
5. Translate naturally and fluently, not word-for-word
6. If the text mentions specific characters or names (like "Dörszli" which refers to "Dursley" from Harry Potter), use the correct English name
7. Do not add explanations, notes, or extra context - just provide the translation
8. The output must be a SINGLE SENTENCE only

Translate only the text as a single sentence.`,
                },
                {
                  role: 'user',
                  content: sentence,
                },
              ],
              temperature: 0.3, // Lower temperature for more consistent translations
              max_tokens: 200, // Reduced since we're translating single sentences
            });
            
            let translatedText = translationResponse.choices[0]?.message?.content?.trim() || '';
            
            // If translation failed or is empty, try a fallback or skip
            if (!translatedText) {
              console.warn(`Translation failed for sentence ${j} in segment ${i}, skipping`);
              continue;
            }
            
            // Calculate proportional timestamps for this sentence
            const sentenceStart = segment.start + (j * timePerSentence);
            const sentenceEnd = j === originalSentences.length - 1 
              ? segment.end // Last sentence gets the remaining time
              : segment.start + ((j + 1) * timePerSentence);
            
            finalSegments.push({
              start: sentenceStart,
              end: sentenceEnd,
              originalText: sentence,
              englishText: translatedText,
            });
          } catch (error) {
            console.error(`Error translating sentence ${j} in segment ${i}:`, error);
            // Don't skip - include the original text with empty translation so it's still visible
            // User can manually add translation or re-process
            const sentenceStart = segment.start + (j * timePerSentence);
            const sentenceEnd = j === originalSentences.length - 1 
              ? segment.end
              : segment.start + ((j + 1) * timePerSentence);
            
            finalSegments.push({
              start: sentenceStart,
              end: sentenceEnd,
              originalText: sentence,
              englishText: '', // Empty translation - will show as error but still visible
            });
          }
        }
      }
    }

    // Map to aligned segments format
    const alignedSegments = finalSegments.map((seg, index) => ({
      id: `segment-${index}`,
      start: seg.start,
      end: seg.end,
      originalText: seg.originalText,
      englishText: seg.englishText,
      isAdjusted: false,
    }));

    // Get detected language
    const detectedLanguage = transcription.language || 'unknown';
    
    // Map Whisper language names to ISO 639-1 codes
    const languageNameToCode: Record<string, string> = {
      'hungarian': 'hu',
      'spanish': 'es',
      'french': 'fr',
      'german': 'de',
      'italian': 'it',
      'portuguese': 'pt',
      'russian': 'ru',
      'japanese': 'ja',
      'korean': 'ko',
      'chinese': 'zh',
      'arabic': 'ar',
      'hindi': 'hi',
      'polish': 'pl',
      'turkish': 'tr',
      'dutch': 'nl',
      'swedish': 'sv',
      'danish': 'da',
      'norwegian': 'no',
      'finnish': 'fi',
      'czech': 'cs',
    };
    
    const detectedLanguageLower = detectedLanguage.toLowerCase();
    const detectedCode = languageNameToCode[detectedLanguageLower] || detectedLanguageLower;
    
    // Compare language codes
    const languageMatch = expectedLanguage
      ? detectedCode === expectedLanguage.toLowerCase() ||
        detectedLanguageLower === expectedLanguage.toLowerCase() ||
        detectedLanguageLower.startsWith(expectedLanguage.toLowerCase()) ||
        expectedLanguage.toLowerCase().startsWith(detectedCode)
      : true;

    // Get audio duration
    const duration = transcription.duration || 0;

    return NextResponse.json({
      segments: alignedSegments,
      detectedLanguage: detectedCode, // Return the ISO code instead of full name
      languageMatch,
      duration,
    });
  } catch (error) {
    console.error('Whisper API error:', error);
    
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: `OpenAI API error: ${error.message}` },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}
