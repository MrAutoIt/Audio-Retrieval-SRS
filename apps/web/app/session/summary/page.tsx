'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getStorage } from '@/lib/storage';
import { Session, ReviewEvent } from '@audio-retrieval-srs/core';
import Link from 'next/link';

export default function SessionSummaryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      router.push('/');
      return;
    }

    const storage = getStorage();
    const loadedSession = await storage.getSession(sessionId);
    
    if (!loadedSession) {
      router.push('/');
      return;
    }

    setSession(loadedSession);

    // Load review events for this session
    const allEvents = await storage.getReviewEvents();
    const sessionEvents = allEvents.filter(e => e.session_id === sessionId);
    setReviewEvents(sessionEvents);

    setLoading(false);
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>Loading summary...</p>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  const duration = session.state.elapsed_time_seconds;
  const itemsReviewed = reviewEvents.length;
  const missCount = reviewEvents.filter(e => e.rating === 'Miss' || e.rating === 'Again').length; // Backward compatibility
  const repeatCount = reviewEvents.filter(e => e.rating === 'Repeat').length;
  const nextCount = reviewEvents.filter(e => e.rating === 'Next').length;
  const easyCount = reviewEvents.filter(e => e.rating === 'Easy').length;
  const avgSecondsPerItem = itemsReviewed > 0 ? duration / itemsReviewed : 0;
  const projectedTimePer10 = avgSecondsPerItem * 10;
  const isPartial = !session.state.is_complete || !session.ended_at;

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-4xl font-bold mb-8">Session Summary</h1>

        {isPartial && (
          <div className="bg-yellow-100 border border-yellow-500 rounded p-4 mb-6">
            <p className="font-semibold text-yellow-800">
              ⚠ Session was stopped early (partial completion)
            </p>
          </div>
        )}

        <div className="bg-white border rounded p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Duration
              </label>
              <div className="text-lg font-bold">{formatTime(duration)}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Items Reviewed
              </label>
              <div className="text-lg font-bold">{itemsReviewed}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Target Duration
              </label>
              <div className="text-lg">{formatTime(session.target_minutes * 60)}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Ratings</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-red-100 p-4 rounded text-center">
              <div className="text-3xl font-bold text-red-600">{missCount}</div>
              <div className="text-sm text-gray-600">Miss</div>
            </div>
            <div className="bg-orange-100 p-4 rounded text-center">
              <div className="text-3xl font-bold text-orange-600">{repeatCount}</div>
              <div className="text-sm text-gray-600">Repeat</div>
            </div>
            <div className="bg-blue-100 p-4 rounded text-center">
              <div className="text-3xl font-bold text-blue-600">{nextCount}</div>
              <div className="text-sm text-gray-600">Next</div>
            </div>
            <div className="bg-green-100 p-4 rounded text-center">
              <div className="text-3xl font-bold text-green-600">{easyCount}</div>
              <div className="text-sm text-gray-600">Easy</div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Timing Statistics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Average per Item
              </label>
              <div className="text-lg font-bold">
                {formatDuration(Math.round(avgSecondsPerItem))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Projected Time per 10 Items
              </label>
              <div className="text-lg font-bold">
                {formatDuration(Math.round(projectedTimePer10))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Link
            href="/"
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
          >
            Back to Home
          </Link>
          <Link
            href="/library"
            className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600"
          >
            View Library
          </Link>
        </div>
      </div>
    </main>
  );
}
