'use client';

import { useEffect, useState } from 'react';
import { getStorage } from '@/lib/storage';
import { Sentence, Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';
import Link from 'next/link';

export default function LibraryPage() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [filteredSentences, setFilteredSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [boxFilter, setBoxFilter] = useState<number | null>(null);
  const [dueFilter, setDueFilter] = useState<'all' | 'due' | 'not-due'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadSentences();
  }, []);

  useEffect(() => {
    filterSentences();
  }, [sentences, searchQuery, tagFilter, boxFilter, dueFilter]);

  async function loadSentences() {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    const language = settings.current_language || 'hu';
    const allSentences = await storage.getSentences(language);
    const eligibleSentences = allSentences.filter(s => s.is_eligible);
    setSentences(eligibleSentences);
    setLoading(false);
  }

  function filterSentences() {
    let filtered = [...sentences];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.english_translation_text.toLowerCase().includes(query) ||
        s.target_text?.toLowerCase().includes(query)
      );
    }

    // Tag filter
    if (tagFilter) {
      filtered = filtered.filter(s =>
        s.tags?.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()))
      );
    }

    // Box filter
    if (boxFilter !== null) {
      filtered = filtered.filter(s => s.scheduling_state.box_level === boxFilter);
    }

    // Due filter
    const now = new Date();
    if (dueFilter === 'due') {
      filtered = filtered.filter(s =>
        s.scheduling_state.due_at <= now ||
        s.scheduling_state.relearn_lock_until_next_session
      );
    } else if (dueFilter === 'not-due') {
      filtered = filtered.filter(s =>
        s.scheduling_state.due_at > now &&
        !s.scheduling_state.relearn_lock_until_next_session
      );
    }

    setFilteredSentences(filtered);
  }

  function getDueStatus(sentence: Sentence): string {
    const now = new Date();
    if (sentence.scheduling_state.relearn_lock_until_next_session) {
      return 'Relearn Locked';
    }
    if (sentence.scheduling_state.due_at <= now) {
      return 'Due Now';
    }
    return 'Not Due';
  }

  async function handleDeleteSentence(sentenceId: string) {
    if (confirmDeleteId !== sentenceId) {
      // First click - show confirmation
      setConfirmDeleteId(sentenceId);
      return;
    }

    // Second click - confirm deletion
    setDeletingId(sentenceId);
    setConfirmDeleteId(null);

    try {
      const storage = getStorage();
      await storage.deleteSentence(sentenceId);
      
      // Remove from local state
      setSentences(prev => prev.filter(s => s.id !== sentenceId));
      
      // If we're on the detail page for this sentence, it will redirect automatically
    } catch (error) {
      console.error('Error deleting sentence:', error);
      alert('Failed to delete sentence. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  function handleCancelDelete() {
    setConfirmDeleteId(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>Loading...</p>
      </main>
    );
  }

  const allTags = Array.from(
    new Set(sentences.flatMap(s => s.tags || []))
  ).sort();

  const boxLevels = Array.from(
    new Set(sentences.map(s => s.scheduling_state.box_level))
  ).sort((a, b) => a - b);

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Library</h1>
          <Link
            href="/"
            className="text-blue-500 hover:text-blue-700"
          >
            ← Back to Home
          </Link>
        </div>

        <div className="bg-gray-100 p-4 rounded mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block mb-2 font-semibold">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sentences..."
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block mb-2 font-semibold">Tag</label>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-2 font-semibold">Box Level</label>
              <select
                value={boxFilter === null ? '' : boxFilter}
                onChange={(e) => setBoxFilter(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full p-2 border rounded"
              >
                <option value="">All Boxes</option>
                {boxLevels.map(level => (
                  <option key={level} value={level}>Box {level}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-2 font-semibold">Due Status</label>
              <select
                value={dueFilter}
                onChange={(e) => setDueFilter(e.target.value as typeof dueFilter)}
                className="w-full p-2 border rounded"
              >
                <option value="all">All</option>
                <option value="due">Due</option>
                <option value="not-due">Not Due</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-gray-600">
            Showing {filteredSentences.length} of {sentences.length} sentences
          </p>
        </div>

        {filteredSentences.length === 0 ? (
          <p className="text-gray-500">No sentences match your filters.</p>
        ) : (
          <div className="space-y-2">
            {filteredSentences.map((sentence) => (
              <div
                key={sentence.id}
                className="block bg-white border rounded p-4 hover:bg-gray-50 relative group"
              >
                <div className="flex justify-between items-start">
                  <Link
                    href={`/library/${sentence.id}`}
                    className="flex-1"
                  >
                    <div className="font-semibold">{sentence.english_translation_text}</div>
                    {sentence.target_text && (
                      <div className="text-gray-600">{sentence.target_text}</div>
                    )}
                    <div className="text-sm text-gray-500 mt-2 flex gap-4">
                      <span>Box {sentence.scheduling_state.box_level}</span>
                      <span>{getDueStatus(sentence)}</span>
                      {sentence.tags && sentence.tags.length > 0 && (
                        <span>Tags: {sentence.tags.join(', ')}</span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {confirmDeleteId === sentence.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-red-600 font-semibold">Delete?</span>
                        <button
                          onClick={() => handleDeleteSentence(sentence.id)}
                          disabled={deletingId === sentence.id}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {deletingId === sentence.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={handleCancelDelete}
                          disabled={deletingId === sentence.id}
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link
                          href={`/library/${sentence.id}`}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          →
                        </Link>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteSentence(sentence.id);
                          }}
                          disabled={deletingId === sentence.id}
                          className="opacity-0 group-hover:opacity-100 px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          title="Delete sentence"
                        >
                          {deletingId === sentence.id ? '...' : '🗑️'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
