'use client';

import { useEffect, useState } from 'react';
import { getStorage } from '@/lib/storage';
import { 
  getDueNow, 
  getDueToday, 
  calculateStreak,
  countStabilized
} from '@audio-retrieval-srs/core';
import { Sentence, Session, ReviewEvent, Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';
import Link from 'next/link';
import { migrateAudioDurations } from '@/lib/migrate-audio-durations';

export default function Home() {
  const [dueNow, setDueNow] = useState(0);
  const [dueToday, setDueToday] = useState(0);
  const [relearnLocked, setRelearnLocked] = useState(0);
  const [streak, setStreak] = useState(0);
  const [stabilized, setStabilized] = useState(0);
  const [hasIncompleteSession, setHasIncompleteSession] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const storage = getStorage();
      const appSettings = await storage.getSettings() || DEFAULT_SETTINGS;
      const language = appSettings.current_language || 'hu';
      const sentences = await storage.getSentences(language);
      const sessions = await storage.getSessions();
      const reviewEvents = await storage.getReviewEvents();
      const settings = appSettings;
      const incompleteSession = await storage.getIncompleteSession();

      const now = new Date();
      const dueNowItems = getDueNow(sentences, now);
      const dueTodayItems = getDueToday(sentences, settings, now);
      const relearnLockedItems = sentences.filter(s => 
        s.is_eligible && s.scheduling_state.relearn_lock_until_next_session
      );

      setDueNow(dueNowItems.length);
      setDueToday(dueTodayItems.length);
      setRelearnLocked(relearnLockedItems.length);
      setStreak(calculateStreak(sessions, reviewEvents, settings, now));
      setStabilized(countStabilized(sentences, reviewEvents));
      setHasIncompleteSession(incompleteSession !== null);
      setLoading(false);
    }

    async function checkAndMigrate() {
      const storage = getStorage();
      const appSettings = await storage.getSettings() || DEFAULT_SETTINGS;
      const language = appSettings.current_language || 'hu';
      const sentences = await storage.getSentences(language);
      const needsMigration = sentences.some(s => 
        s.target_audio_uri && (!s.target_audio_duration_seconds || s.target_audio_duration_seconds <= 0)
      );
      
      try {
        const { verifyAudioDurations } = await import('@/lib/verify-audio-durations');
        
        if (needsMigration) {
          // Verify before migration
          const beforeVerification = await verifyAudioDurations();
          console.log('Before migration:', {
            total: beforeVerification.total,
            withAudio: beforeVerification.withAudio,
            withDuration: beforeVerification.withDuration,
            missingDuration: beforeVerification.missingDuration,
          });
          
          // Run migration
          const result = await migrateAudioDurations();
          console.log('Migration result:', {
            total: result.total,
            updated: result.updated,
            failed: result.failed,
            errors: result.errors.length > 0 ? result.errors : 'none'
          });
          
          // Verify after migration
          const afterVerification = await verifyAudioDurations();
          console.log('After migration verification:', {
            total: afterVerification.total,
            withAudio: afterVerification.withAudio,
            withDuration: afterVerification.withDuration,
            missingDuration: afterVerification.missingDuration,
            invalidDuration: afterVerification.invalidDuration,
          });
          
          // Log details of sentences that still need attention
          const stillMissing = afterVerification.sentences.filter(s => 
            s.status === 'missing_duration' || s.status === 'invalid_duration'
          );
          if (stillMissing.length > 0) {
            console.warn('Sentences still missing valid duration:', stillMissing.map(s => ({
              id: s.id,
              text: s.englishText,
              status: s.status,
              duration: s.duration
            })));
          } else {
            console.log('✓ All sentences with audio now have valid durations');
          }
          
          // Reload stats after migration
          const appSettings = await storage.getSettings() || DEFAULT_SETTINGS;
          const language = appSettings.current_language || 'hu';
          const updatedSentences = await storage.getSentences(language);
          const updatedReviewEvents = await storage.getReviewEvents();
          setStabilized(countStabilized(updatedSentences, updatedReviewEvents));
        } else {
          // Even if no migration needed, verify current state
          const verification = await verifyAudioDurations();
          console.log('Audio duration verification (no migration needed):', {
            total: verification.total,
            withAudio: verification.withAudio,
            withDuration: verification.withDuration,
            missingDuration: verification.missingDuration,
            invalidDuration: verification.invalidDuration,
          });
          
          if (verification.missingDuration > 0 || verification.invalidDuration > 0) {
            const issues = verification.sentences.filter(s => 
              s.status === 'missing_duration' || s.status === 'invalid_duration'
            );
            console.warn('Sentences with duration issues:', issues.map(s => ({
              id: s.id,
              text: s.englishText,
              status: s.status,
              duration: s.duration
            })));
          }
        }
      } catch (error) {
        console.error('Migration/verification failed:', error);
      }
    }
    
    loadStats();
    checkAndMigrate();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-4xl font-bold mb-8">Audio Retrieval SRS</h1>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-blue-100 p-4 rounded">
            <div className="text-2xl font-bold">{dueNow}</div>
            <div className="text-sm text-gray-600">Due Now</div>
          </div>
          <div className="bg-green-100 p-4 rounded">
            <div className="text-2xl font-bold">{dueToday}</div>
            <div className="text-sm text-gray-600">Due Today</div>
          </div>
          <div className="bg-yellow-100 p-4 rounded">
            <div className="text-2xl font-bold">{relearnLocked}</div>
            <div className="text-sm text-gray-600">Relearn Locked</div>
          </div>
          <div className="bg-purple-100 p-4 rounded">
            <div className="text-2xl font-bold">{streak}</div>
            <div className="text-sm text-gray-600">Streak</div>
          </div>
          <div className="bg-indigo-100 p-4 rounded">
            <div className="text-2xl font-bold">{stabilized}</div>
            <div className="text-sm text-gray-600">Stabilized</div>
          </div>
        </div>

        <div className="space-y-4">
          {hasIncompleteSession && (
            <Link
              href="/session"
              className="block bg-orange-500 text-white px-6 py-3 rounded text-center font-semibold hover:bg-orange-600"
            >
              Resume Session
            </Link>
          )}

          <div className="grid grid-cols-3 gap-4">
            <Link
              href="/session?duration=10"
              className="bg-blue-500 text-white px-6 py-3 rounded text-center font-semibold hover:bg-blue-600"
            >
              Start 10 min
            </Link>
            <Link
              href="/session?duration=20"
              className="bg-blue-500 text-white px-6 py-3 rounded text-center font-semibold hover:bg-blue-600"
            >
              Start 20 min
            </Link>
            <Link
              href="/session?duration=45"
              className="bg-blue-500 text-white px-6 py-3 rounded text-center font-semibold hover:bg-blue-600"
            >
              Start 45 min
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
            <Link
              href="/inbox"
              className="bg-gray-200 px-6 py-3 rounded text-center font-semibold hover:bg-gray-300"
            >
              Inbox
            </Link>
            <Link
              href="/library"
              className="bg-gray-200 px-6 py-3 rounded text-center font-semibold hover:bg-gray-300"
            >
              Library
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
