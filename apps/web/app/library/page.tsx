'use client';

import { useEffect, useState } from 'react';
import { getStorage } from '@/lib/storage';
import { Sentence, Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';
import { IndexedDBStorage } from '@audio-retrieval-srs/storage';
import { generateCardForSentence, createExportZip } from '@/lib/audio-flashcards-export';
import { v4 as uuidv4 } from 'uuid';
import ExportProgressModal, { ExportItemStatus } from '@/components/ExportProgressModal';
import { Notification } from '@/components/Notification';
import Link from 'next/link';

interface ExportMetadata {
  exportedAt: Date;
  exportPackageId: string;
  cardId: string;
}

export default function LibraryPage() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [filteredSentences, setFilteredSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [boxFilter, setBoxFilter] = useState<number | null>(null);
  const [dueFilter, setDueFilter] = useState<'all' | 'due' | 'not-due'>('all');
  const [exportStatusFilter, setExportStatusFilter] = useState<'all' | 'exported' | 'not-exported'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Export state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportMetadataMap, setExportMetadataMap] = useState<Map<string, ExportMetadata>>(new Map());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportItems, setExportItems] = useState<ExportItemStatus[]>([]);
  const [exportPackageBlob, setExportPackageBlob] = useState<Blob | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'warning' | 'info' | 'success' } | null>(null);

  useEffect(() => {
    loadSentences();
  }, []);

  useEffect(() => {
    filterSentences();
  }, [sentences, searchQuery, tagFilter, boxFilter, dueFilter, exportStatusFilter, exportMetadataMap]);

  async function loadSentences() {
    const startTime = performance.now();
    console.log('[Library] loadSentences: Starting...');
    
    try {
      const step1Start = performance.now();
      const storage = getStorage();
      console.log('[Library] getStorage() took:', performance.now() - step1Start, 'ms');
      
      const step2Start = performance.now();
      const settings = await storage.getSettings() || DEFAULT_SETTINGS;
      console.log('[Library] getSettings() took:', performance.now() - step2Start, 'ms');
      
      const step3Start = performance.now();
      const language = settings.current_language || 'hu';
      const allSentences = await storage.getSentences(language);
      console.log('[Library] getSentences() took:', performance.now() - step3Start, 'ms, returned', allSentences.length, 'sentences');
      
      const step4Start = performance.now();
      const eligibleSentences = allSentences.filter(s => s.is_eligible);
      console.log('[Library] Filtering eligible sentences took:', performance.now() - step4Start, 'ms,', eligibleSentences.length, 'eligible');
      
      setSentences(eligibleSentences);
      console.log('[Library] Main content loaded in:', performance.now() - startTime, 'ms');
      
      // Load export metadata immediately (wait for it to complete before showing UI)
      // This ensures export status is displayed correctly on page load
      try {
        await loadExportMetadata(eligibleSentences);
        console.log('[Library] Export metadata loaded successfully');
      } catch (error) {
        console.error('[Library] Failed to load export metadata:', error);
      }
      
      setLoading(false);
      
    } catch (error) {
      console.error('[Library] Error in loadSentences:', error);
      setLoading(false);
      setNotification({
        message: `Failed to load sentences: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    }
  }

  async function loadExportMetadata(sentencesToLoad: Sentence[]) {
    const startTime = performance.now();
    console.log('[Library] loadExportMetadata: Starting for', sentencesToLoad.length, 'sentences...');
    
    if (sentencesToLoad.length === 0) {
      console.log('[Library] loadExportMetadata: No sentences to load, skipping');
      return;
    }
    
    try {
      const storage = getStorage();
      
      // Check if storage is IndexedDBStorage instance (which has export metadata methods)
      if (!(storage instanceof IndexedDBStorage)) {
        console.warn('[Library] loadExportMetadata: Storage is not IndexedDBStorage, export metadata not available');
        return;
      }
      
      // Access methods directly - use 'as any' to bypass TypeScript since methods exist on IndexedDBStorage
      const indexedDBStorage = storage as any;
      
      // Check if methods exist (they should after rebuilding the storage package)
      if (!indexedDBStorage.getAllExportMetadata || typeof indexedDBStorage.getAllExportMetadata !== 'function') {
        console.error('[Library] loadExportMetadata: getAllExportMetadata method not found. Storage package may need to be rebuilt.');
        console.error('[Library] loadExportMetadata: Storage type:', storage.constructor?.name);
        return;
      }
      
      console.log('[Library] loadExportMetadata: Starting batch load...');
      
      const queryStartTime = performance.now();
      let metadataMap: Map<string, ExportMetadata> = new Map();
      
      // Try to use batch loading first
      try {
        const sentenceIds = sentencesToLoad.map(s => s.id);
        console.log(`[Library] loadExportMetadata: Calling getAllExportMetadata with ${sentenceIds.length} sentence IDs`);
        const batchResult = await indexedDBStorage.getAllExportMetadata(sentenceIds);
        const queryTime = performance.now() - queryStartTime;
        
        console.log(`[Library] loadExportMetadata: getAllExportMetadata returned Map with ${batchResult.size} entries`);
        
        // Convert to ExportMetadata format
        batchResult.forEach((value, sentenceId) => {
          console.log(`[Library] loadExportMetadata: Processing metadata for sentence ${sentenceId}, exportedAt: ${value.exportedAt}`);
          metadataMap.set(sentenceId, {
            exportedAt: value.exportedAt,
            exportPackageId: value.exportPackageId,
            cardId: value.cardId,
          });
        });
        
        console.log(`[Library] loadExportMetadata: Batch load completed in ${queryTime.toFixed(2)}ms, loaded ${metadataMap.size} records`);
      } catch (batchError) {
        console.warn('[Library] loadExportMetadata: Batch load failed, falling back to individual queries:', batchError);
        
        // Fall back to individual queries
        const fallbackStartTime = performance.now();
        let successCount = 0;
        let errorCount = 0;
        
          const metadataPromises = sentencesToLoad.map(async (sentence) => {
            try {
              const metadata = await indexedDBStorage.getExportMetadata(sentence.id);
            if (metadata) {
              successCount++;
              return { sentenceId: sentence.id, metadata };
            }
            return null;
          } catch (error) {
            errorCount++;
            console.warn(`[Library] Failed to load export metadata for sentence ${sentence.id}:`, error);
            return null;
          }
        });
        
        const results = await Promise.all(metadataPromises);
        const fallbackTime = performance.now() - fallbackStartTime;
        
        results.forEach(result => {
          if (result && result.metadata) {
            metadataMap.set(result.sentenceId, {
              exportedAt: result.metadata.exportedAt,
              exportPackageId: result.metadata.exportPackageId,
              cardId: result.metadata.cardId,
            });
          }
        });
        
        console.log(`[Library] loadExportMetadata: Fallback completed in ${fallbackTime.toFixed(2)}ms (success: ${successCount}, errors: ${errorCount})`);
      }
      
      console.log(`[Library] loadExportMetadata: Total time: ${(performance.now() - startTime).toFixed(2)}ms, final map size: ${metadataMap.size}`);
      
      setExportMetadataMap(metadataMap);
    } catch (error) {
      console.error('[Library] loadExportMetadata: Fatal error:', error);
      console.error('[Library] loadExportMetadata: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Continue without metadata - this is not critical
    }
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

    // Export status filter
    if (exportStatusFilter === 'exported') {
      filtered = filtered.filter(s => exportMetadataMap.has(s.id));
    } else if (exportStatusFilter === 'not-exported') {
      filtered = filtered.filter(s => !exportMetadataMap.has(s.id));
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

  function getExportStatus(sentenceId: string): { status: 'exported' | 'not-exported'; date?: Date } {
    const metadata = exportMetadataMap.get(sentenceId);
    if (metadata) {
      return { status: 'exported', date: metadata.exportedAt };
    }
    return { status: 'not-exported' };
  }

  function toggleSelect(sentenceId: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sentenceId)) {
        newSet.delete(sentenceId);
      } else {
        newSet.add(sentenceId);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredSentences.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSentences.map(s => s.id)));
    }
  }

  async function handleExport(sentenceIds: string[], reExport: boolean = false) {
    const storage = getStorage() as IndexedDBStorage;
    
    // Filter out already exported items unless re-exporting
    let sentencesToExport = filteredSentences.filter(s => sentenceIds.includes(s.id));
    if (!reExport) {
      sentencesToExport = sentencesToExport.filter(s => {
        const metadata = exportMetadataMap.get(s.id);
        return !metadata;
      });
    }

    if (sentencesToExport.length === 0) {
      setNotification({
        message: reExport ? 'No items to re-export.' : 'All selected items are already exported. Use "Re-export" to export again.',
        type: 'info',
      });
      return;
    }

    // Initialize export status
    const items: ExportItemStatus[] = sentencesToExport.map(s => ({
      sentenceId: s.id,
      sentenceText: s.english_translation_text,
      status: 'pending',
    }));
    
    setExportItems(items);
    setShowExportModal(true);
    setExportPackageBlob(null);

    // Generate deck ID once
    const deckId = `${uuidv4()}-*`;
    const deckName = 'Hungarian Production Export';
    const successfulCards: Array<{
      cardId: string;
      englishAudio: Blob;
      hungarianAudio: Blob;
      englishAudioId: string;
      hungarianAudioId: string;
      cardMeta: any;
      sentenceId: string;
    }> = [];

    // Process each sentence individually - continue even if one fails
    for (let i = 0; i < sentencesToExport.length; i++) {
      const sentence = sentencesToExport[i];
      
      // Update status to exporting
      setExportItems(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'exporting' };
        return updated;
      });

      try {
        // Generate card data for this sentence
        const card = await generateCardForSentence(sentence, storage);
        
        // Validate card structure
        if (!card || !card.englishAudio || !card.hungarianAudio) {
          throw new Error(`Invalid card structure for sentence ${sentence.id}`);
        }
        
        console.log(`[Library] Generated card for "${sentence.english_translation_text}":`, {
          cardId: card.cardId,
          englishAudioSize: card.englishAudio.size,
          hungarianAudioSize: card.hungarianAudio.size,
          englishAudioId: card.englishAudioId,
          hungarianAudioId: card.hungarianAudioId,
        });
        
        // Save export metadata
        if (storage instanceof IndexedDBStorage) {
          try {
            await storage.saveExportMetadata(sentence.id, deckId, card.cardId);
            console.log(`[Library] Saved export metadata for sentence ${sentence.id}, deckId: ${deckId}, cardId: ${card.cardId}`);
          } catch (saveError) {
            console.error(`[Library] Failed to save export metadata for sentence ${sentence.id}:`, saveError);
          }
        } else {
          console.warn('[Library] Storage is not IndexedDBStorage, cannot save export metadata');
        }
        
        // Update local metadata map
        setExportMetadataMap(prev => {
          const updated = new Map(prev);
          updated.set(sentence.id, {
            exportedAt: new Date(),
            exportPackageId: deckId,
            cardId: card.cardId,
          });
          return updated;
        });

        // Store successful card - ensure all properties are included
        successfulCards.push({
          cardId: card.cardId,
          englishAudio: card.englishAudio,
          hungarianAudio: card.hungarianAudio,
          englishAudioId: card.englishAudioId,
          hungarianAudioId: card.hungarianAudioId,
          cardMeta: card.cardMeta,
          sentenceId: sentence.id,
        });

        // Update status to success
        setExportItems(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'success' };
          return updated;
        });
      } catch (error: any) {
        console.error(`Failed to export sentence ${sentence.id}:`, error);
        setExportItems(prev => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i],
            status: 'failed',
            error: error.message || 'Export failed',
          };
          return updated;
        });
        // Continue processing remaining items
      }
    }

    // Create ZIP file only with successfully exported cards
    if (successfulCards.length > 0) {
      try {
        console.log('[Library] Creating ZIP with', successfulCards.length, 'cards...');
        const packageData = {
          deckId,
          deckName,
          cards: successfulCards,
        };
        const zipBlob = await createExportZip(packageData);
        
        // Validate ZIP blob before setting it
        if (!zipBlob || zipBlob.size === 0) {
          throw new Error('Generated ZIP blob is empty');
        }
        
        console.log('[Library] ZIP created successfully:', zipBlob.size, 'bytes');
        setExportPackageBlob(zipBlob);
      } catch (error: any) {
        console.error('[Library] Failed to create ZIP:', error);
        setNotification({
          message: `Failed to create export package: ${error.message}`,
          type: 'error',
        });
        setExportPackageBlob(null);
      }
    } else {
      setNotification({
        message: 'Export failed for all items. Please check the errors above and try again.',
        type: 'error',
      });
    }
  }

  async function handleDownloadPackage(blob: Blob) {
    console.log('[Library] handleDownloadPackage: Blob size:', blob.size, 'bytes, type:', blob.type);
    
    // Validate blob before downloading
    if (!blob || blob.size === 0) {
      console.error('[Library] Blob is empty or invalid');
      setNotification({
        message: 'Export package is empty. Please try exporting again.',
        type: 'error',
      });
      return;
    }
    
    // Verify the blob is actually a valid ZIP by checking its first bytes (ZIP magic number: PK\x03\x04)
    try {
      const arrayBuffer = await blob.slice(0, 4).arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const zipMagic = bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
      if (!zipMagic) {
        console.error('[Library] Blob does not have ZIP magic number! First bytes:', Array.from(bytes).map(b => '0x' + b.toString(16)).join(' '));
        setNotification({
          message: 'Generated file is not a valid ZIP format. Please try exporting again.',
          type: 'error',
        });
        return;
      }
      console.log('[Library] ZIP magic number verified: PK', bytes[2].toString(16));
    } catch (verifyError) {
      console.warn('[Library] Could not verify ZIP magic number:', verifyError);
    }
    
    try {
      // Create download link with today's date and time
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const dateTimeStr = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
      const fileName = `audio-flashcards-export-${dateTimeStr}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      
      // Append to body, click, then remove after delay to ensure download starts
      document.body.appendChild(a);
      a.click();
      
      console.log('[Library] Download initiated for file:', fileName, '- size:', blob.size, 'bytes');
      
      // Clean up after a delay to ensure download starts before revoking URL
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
        console.log('[Library] Download link cleaned up');
      }, 2000); // Increased delay to 2 seconds to ensure download completes
    } catch (error: any) {
      console.error('[Library] Download failed:', error);
      setNotification({
        message: `Failed to download package: ${error.message}`,
        type: 'error',
      });
    }
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
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(sentenceId);
        return newSet;
      });
      setExportMetadataMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(sentenceId);
        return newMap;
      });
    } catch (error) {
      console.error('Error deleting sentence:', error);
      setNotification({
        message: 'Failed to delete sentence. Please try again.',
        type: 'error',
      });
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

  const hasSelection = selectedIds.size > 0;

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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            <div>
              <label className="block mb-2 font-semibold">Export Status</label>
              <select
                value={exportStatusFilter}
                onChange={(e) => setExportStatusFilter(e.target.value as typeof exportStatusFilter)}
                className="w-full p-2 border rounded"
              >
                <option value="all">All</option>
                <option value="exported">Exported</option>
                <option value="not-exported">Not Exported</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-gray-600">
            Showing {filteredSentences.length} of {sentences.length} sentences
          </p>
          <div className="flex gap-2">
            <button
              onClick={toggleSelectAll}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              {selectedIds.size === filteredSentences.length ? 'Deselect All' : 'Select All'}
            </button>
            {hasSelection && (
              <>
                <button
                  onClick={() => handleExport(Array.from(selectedIds), false)}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Export Selected ({selectedIds.size})
                </button>
                <button
                  onClick={() => handleExport(Array.from(selectedIds), true)}
                  className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                  Re-export Selected
                </button>
              </>
            )}
          </div>
        </div>

        {filteredSentences.length === 0 ? (
          <p className="text-gray-500">No sentences match your filters.</p>
        ) : (
          <div className="space-y-2">
            {filteredSentences.map((sentence) => {
              const exportStatus = getExportStatus(sentence.id);
              const isSelected = selectedIds.has(sentence.id);

              return (
                <div
                  key={sentence.id}
                  className={`block bg-white border rounded p-4 hover:bg-gray-50 relative group ${
                    isSelected ? 'border-blue-500 bg-blue-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(sentence.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <Link href={`/library/${sentence.id}`} className="flex-1">
                        <div className="font-semibold">{sentence.english_translation_text}</div>
                        {sentence.target_text && (
                          <div className="text-gray-600">{sentence.target_text}</div>
                        )}
                        <div className="text-sm text-gray-500 mt-2 flex gap-4 flex-wrap">
                          <span>Box {sentence.scheduling_state.box_level}</span>
                          <span>{getDueStatus(sentence)}</span>
                          {sentence.tags && sentence.tags.length > 0 && (
                            <span>Tags: {sentence.tags.join(', ')}</span>
                          )}
                          {exportStatus.status === 'exported' && exportStatus.date && (
                            <span className="text-green-600">
                              Exported {exportStatus.date.toLocaleDateString()} {exportStatus.date.toLocaleTimeString()}
                            </span>
                          )}
                          {exportStatus.status === 'not-exported' && (
                            <span className="text-gray-400">Not exported</span>
                          )}
                        </div>
                      </Link>
                    </div>
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
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleExport([sentence.id], exportStatus.status === 'exported');
                            }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-1 text-sm text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-opacity"
                            title={exportStatus.status === 'exported' ? 'Re-export' : 'Export'}
                          >
                            {exportStatus.status === 'exported' ? '↻' : '📤'}
                          </button>
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
              );
            })}
          </div>
        )}
      </div>

      <ExportProgressModal
        isOpen={showExportModal}
        items={exportItems}
        onClose={() => {
          setShowExportModal(false);
          setExportItems([]);
          setExportPackageBlob(null);
        }}
        onDownload={handleDownloadPackage}
        exportPackageBlob={exportPackageBlob}
      />
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </main>
  );
}
