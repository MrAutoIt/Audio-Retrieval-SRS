'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStorage } from '@/lib/storage';
import { Sentence, ReviewEvent } from '@audio-retrieval-srs/core';
import Link from 'next/link';

export default function SentenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (params.id) {
      loadSentence();
    }
  }, [params.id]);

  async function loadSentence() {
    const storage = getStorage();
    const sentenceId = params.id as string;
    const loadedSentence = await storage.getSentence(sentenceId);
    
    if (!loadedSentence) {
      router.push('/library');
      return;
    }

    setSentence(loadedSentence);
    
    // Load review events
    const events = await storage.getReviewEvents(sentenceId);
    setReviewEvents(events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    // Check audio
    const audio = await storage.getAudio(sentenceId);
    if (audio) {
      const url = URL.createObjectURL(audio);
      setAudioUrl(url);
      setAudioError(false);
    } else {
      setAudioError(true);
    }

    setLoading(false);
  }

  async function playAudio() {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
      setPlaying(true);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setAudioError(true);
        setPlaying(false);
      };
    }
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleString();
  }

  function formatInterval(days: number): string {
    if (days < 1) return 'Less than 1 day';
    if (days === 1) return '1 day';
    if (days < 7) return `${days} days`;
    if (days < 30) return `${Math.floor(days / 7)} weeks`;
    return `${Math.floor(days / 30)} months`;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>Loading...</p>
      </main>
    );
  }

  if (!sentence) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-4">
          <Link
            href="/library"
            className="text-blue-500 hover:text-blue-700"
          >
            ← Back to Library
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-8">Sentence Detail</h1>

        <div className="bg-white border rounded p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                English Translation
              </label>
              <div className="text-lg">{sentence.english_translation_text}</div>
            </div>

            {sentence.target_text && (
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">
                  Target Text
                </label>
                <div className="text-lg">{sentence.target_text}</div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Language
              </label>
              <div>{sentence.language_code}</div>
            </div>

            {sentence.tags && sentence.tags.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">
                  Tags
                </label>
                <div className="flex gap-2 flex-wrap">
                  {sentence.tags.map(tag => (
                    <span
                      key={tag}
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Audio
              </label>
              {audioError ? (
                <div className="space-y-2">
                  <div className="text-red-600 font-semibold">
                    ⚠ Audio file missing or corrupted
                  </div>
                  <button
                    onClick={() => router.push(`/inbox?edit=${sentence.id}`)}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Re-record Audio
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={playAudio}
                    disabled={playing}
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
                  >
                    {playing ? 'Playing...' : '▶ Play Audio'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Scheduling State</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Box Level
              </label>
              <div className="text-lg font-bold">Box {sentence.scheduling_state.box_level}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Next Due
              </label>
              <div>
                {formatDate(sentence.scheduling_state.due_at)}
                <br />
                <span className="text-sm text-gray-500">
                  ({formatInterval(
                    Math.ceil(
                      (sentence.scheduling_state.due_at.getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                    )
                  )})
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Last Rating
              </label>
              <div>{sentence.scheduling_state.last_rating || 'None'}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Status
              </label>
              <div>
                {sentence.scheduling_state.relearn_lock_until_next_session && (
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">
                    Relearn Locked
                  </span>
                )}
                {sentence.scheduling_state.success_streak > 0 && (
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm ml-2">
                    {sentence.scheduling_state.success_streak} streak
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Total Reviews
              </label>
              <div>{sentence.stats.total_reviews}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Total Misses
              </label>
              <div>{sentence.stats.total_misses}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-6">
          <h2 className="text-2xl font-bold mb-4">Review History</h2>
          {reviewEvents.length === 0 ? (
            <p className="text-gray-500">No review history yet.</p>
          ) : (
            <div className="space-y-2">
              {reviewEvents.map((event) => (
                <div
                  key={event.id}
                  className="border-b pb-2 last:border-0"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">
                        Rating: <span className={`${
                          event.rating === 'Miss' || event.rating === 'Again' ? 'text-red-600' :
                          event.rating === 'Repeat' ? 'text-orange-600' :
                          event.rating === 'Next' ? 'text-blue-600' :
                          event.rating === 'Hard' ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>{event.rating}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatDate(event.timestamp)}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div>Box {event.box_level_after}</div>
                      <div className="text-gray-500">
                        Interval: {formatInterval(event.computed_interval_days)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
