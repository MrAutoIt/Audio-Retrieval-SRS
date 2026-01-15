'use client';

import { useState } from 'react';
import { DuplicateMatch } from '@/types/whisper';
import { getStorage } from '@/lib/storage';

interface DuplicateWarningProps {
  matches: DuplicateMatch[];
  onIgnore: () => void;
  onEditExisting: (sentenceId: string) => void;
}

export default function DuplicateWarning({ matches, onIgnore, onEditExisting }: DuplicateWarningProps) {
  const [expanded, setExpanded] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  if (matches.length === 0) {
    return null;
  }

  async function playAudio(sentenceId: string) {
    try {
      const storage = getStorage();
      const audio = await storage.getAudio(sentenceId);
      if (audio) {
        const url = URL.createObjectURL(audio);
        const audioElement = new Audio(url);
        setPlayingAudioId(sentenceId);
        audioElement.play();
        audioElement.onended = () => {
          setPlayingAudioId(null);
          URL.revokeObjectURL(url);
        };
        audioElement.onerror = () => {
          setPlayingAudioId(null);
          URL.revokeObjectURL(url);
        };
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setPlayingAudioId(null);
    }
  }

  const matchTypes = {
    english: 'English text',
    target: 'Target language',
    both: 'Both languages',
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-yellow-800 font-semibold">⚠️ Potential Duplicate</span>
          <span className="text-sm text-yellow-700">
            ({matches.length} similar sentence{matches.length !== 1 ? 's' : ''} found)
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-yellow-700 hover:text-yellow-900 text-sm"
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {matches.map((match, index) => (
            <div
              key={match.sentence.id}
              className="bg-white border border-yellow-200 rounded p-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Match #{index + 1} ({Math.round(match.similarity * 100)}% similar)
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Type: {matchTypes[match.matchType]}
                  </div>
                  <div className="mt-2">
                    <div className="text-sm text-gray-700">
                      <strong>English:</strong> {match.sentence.english_translation_text}
                    </div>
                    {match.sentence.target_text && (
                      <div className="text-sm text-gray-700 mt-1">
                        <strong>Target:</strong> {match.sentence.target_text}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => playAudio(match.sentence.id)}
                    disabled={playingAudioId === match.sentence.id}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                  >
                    {playingAudioId === match.sentence.id ? '⏸' : '▶'}
                  </button>
                  <button
                    onClick={() => onEditExisting(match.sentence.id)}
                    className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <button
              onClick={onIgnore}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              Ignore and Add Anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
