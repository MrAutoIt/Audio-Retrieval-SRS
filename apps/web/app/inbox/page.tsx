'use client';

import { useEffect, useState, useRef } from 'react';
import { getStorage } from '@/lib/storage';
import { Sentence, createSentence, Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';
import Link from 'next/link';
import { Notification } from '@/components/Notification';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getAudioDuration } from '@/lib/audio-utils';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import FullAudioPlayer from '@/components/FullAudioPlayer';
import WhisperSegmentList from '@/components/WhisperSegmentList';
import { WhisperSegment, DuplicateMatch, AudioPlayerState, WhisperTranscriptionResponse } from '@/types/whisper';
import { filterValidSentences, hasMultipleSentences, splitIntoSentences } from '@/lib/sentence-validation';
import { findDuplicateMatchesForSegment } from '@/lib/duplicate-detection';
import { PendingAudioMetadata } from '@audio-retrieval-srs/storage';

export default function InboxPage() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [currentLanguage, setCurrentLanguage] = useState<string>('hu');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSentence, setEditingSentence] = useState<Sentence | null>(null);
  const [formData, setFormData] = useState({
    englishTranslation: '',
    targetText: '',
    tags: '',
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'warning' | 'info' | 'success' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  
  // Whisper workflow state
  const [whisperMode, setWhisperMode] = useState(false);
  const [processingWhisper, setProcessingWhisper] = useState(false);
  const [pendingAudioId, setPendingAudioId] = useState<string | null>(null);
  const [whisperSegments, setWhisperSegments] = useState<WhisperSegment[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [duplicateMatches, setDuplicateMatches] = useState<Map<string, DuplicateMatch[]>>(new Map());
  const [fullAudioBlob, setFullAudioBlob] = useState<Blob | null>(null);
  const [audioPlayerState, setAudioPlayerState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    activeSegmentId: null,
  });
  const [languageMismatch, setLanguageMismatch] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [pendingAudios, setPendingAudios] = useState<PendingAudioMetadata[]>([]);
  const [whisperError, setWhisperError] = useState<string | null>(null);

  useEffect(() => {
    loadSettingsAndSentences();
    loadPendingAudios();
  }, []);

  async function loadSettingsAndSentences() {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    const language = settings.current_language || 'hu';
    setCurrentLanguage(language);
    
    // Filter sentences by current language
    const allSentences = await storage.getSentences(language);
    const inboxSentences = allSentences.filter(s => !s.is_eligible);
    setSentences(inboxSentences);
    setLoading(false);
  }

  async function loadPendingAudios() {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    const language = settings.current_language || 'hu';
    const pending = await storage.getAllPendingAudios(language);
    setPendingAudios(pending);
  }

  async function handleSave() {
    if (!formData.englishTranslation.trim()) {
      setNotification({ message: 'English translation is required', type: 'error' });
      return;
    }

    if (!audioFile && !audioBlob && !editingSentence) {
      setNotification({ message: 'Audio file is required', type: 'error' });
      return;
    }

    const storage = getStorage();
    let audioUri = editingSentence?.target_audio_uri || '';

    if (editingSentence) {
      // Update existing
      let audioDuration = editingSentence.target_audio_duration_seconds;
      
      // Save audio if new and calculate duration
      if (audioFile || audioBlob) {
        const audioData = audioBlob || audioFile!;
        const filename = audioFile?.name || `${Date.now()}.mp3`;
        const dataToSave = audioBlob || (await audioFile!.arrayBuffer());
        audioUri = await storage.saveAudio(
          editingSentence.id,
          dataToSave,
          filename
        );
        
        // Calculate and store audio duration
        const duration = await getAudioDuration(audioData);
        if (duration !== null) {
          audioDuration = duration;
        }
      }

      const updated: Sentence = {
        ...editingSentence,
        english_translation_text: formData.englishTranslation,
        target_text: formData.targetText || undefined,
        language_code: currentLanguage,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : undefined,
        target_audio_uri: audioUri,
        target_audio_duration_seconds: audioDuration,
      };
      await storage.updateSentence(updated);
    } else {
      // Create new sentence first
      const sentence = createSentence(
        currentLanguage,
        formData.englishTranslation,
        '', // Will update after audio is saved
        {
          targetText: formData.targetText || undefined,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : undefined,
        }
      );
      
      // Save audio if provided and calculate duration
      if (audioFile || audioBlob) {
        const audioData = audioBlob || audioFile!;
        const filename = audioFile?.name || `${Date.now()}.mp3`;
        const dataToSave = audioBlob || (await audioFile!.arrayBuffer());
        audioUri = await storage.saveAudio(
          sentence.id,
          dataToSave,
          filename
        );
        sentence.target_audio_uri = audioUri;
        
        // Calculate and store audio duration
        const duration = await getAudioDuration(audioData);
        if (duration !== null) {
          sentence.target_audio_duration_seconds = duration;
        }
      }
      
      await storage.saveSentence(sentence);
    }

    // Reset form
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    const language = settings.current_language || 'hu';
    setFormData({
      englishTranslation: '',
      targetText: '',
      tags: '',
    });
    setAudioFile(null);
    setAudioBlob(null);
    setShowAddForm(false);
    setEditingSentence(null);
    await loadSettingsAndSentences();
  }

  async function handleBulkEligible() {
    if (selectedIds.size === 0) {
      setNotification({ message: 'Please select at least one sentence', type: 'warning' });
      return;
    }

    const storage = getStorage();
    for (const id of selectedIds) {
      const sentence = sentences.find(s => s.id === id);
      if (sentence) {
        const updated = { ...sentence, is_eligible: true };
        // Initialize scheduling state when marking eligible
        updated.scheduling_state = {
          ...updated.scheduling_state,
          box_level: 1,
          due_at: new Date(),
        };
        await storage.updateSentence(updated);
      }
    }
    setSelectedIds(new Set());
    await loadSettingsAndSentences();
  }

  async function handleEdit(sentence: Sentence) {
    setEditingSentence(sentence);
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    const language = settings.current_language || 'hu';
    setFormData({
      englishTranslation: sentence.english_translation_text,
      targetText: sentence.target_text || '',
      tags: sentence.tags?.join(', ') || '',
    });
    setShowAddForm(true);
  }

  async function handleDelete(id: string) {
    setConfirmDialog({
      message: 'Are you sure you want to delete this sentence?',
      onConfirm: async () => {
        const storage = getStorage();
        await storage.deleteSentence(id);
        await loadSettingsAndSentences();
        setConfirmDialog(null);
        setNotification({ message: 'Sentence deleted', type: 'success' });
      },
    });
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function toggleSelectAll() {
    if (selectedIds.size === sentences.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sentences.map(s => s.id)));
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/mp3' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      setNotification({ 
        message: `Failed to access microphone: ${error instanceof Error ? error.message : String(error)}`, 
        type: 'error' 
      });
    }
  }

  function stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  }

  // Whisper workflow functions
  async function handleProcessWithWhisper() {
    const audioToProcess = audioFile || audioBlob;
    if (!audioToProcess) {
      setNotification({ message: 'Please upload an audio file first', type: 'error' });
      return;
    }

    setProcessingWhisper(true);
    setWhisperError(null);
    // Show Whisper Mode UI immediately with loading state
    setWhisperMode(true);
    setShowAddForm(false);
    try {
      const storage = getStorage();
      const settings = await storage.getSettings() || DEFAULT_SETTINGS;
      const expectedLanguage = settings.current_language || 'hu';

      // Save to pending audio storage
      const audioId = `pending-${Date.now()}`;
      const audioBuffer = audioToProcess instanceof File 
        ? await audioToProcess.arrayBuffer() 
        : await audioToProcess.arrayBuffer();
      const audioBlobForStorage = new Blob([audioBuffer], { type: audioToProcess.type || 'audio/mpeg' });
      
      const metadata: PendingAudioMetadata = {
        id: audioId,
        filename: audioToProcess instanceof File ? audioToProcess.name : 'recording.mp3',
        languageCode: expectedLanguage,
        uploadedAt: new Date(),
      };

      await storage.savePendingAudio(audioId, audioBlobForStorage, metadata);
      setPendingAudioId(audioId);
      setFullAudioBlob(audioBlobForStorage);

      // Call Whisper API
      const formData = new FormData();
      formData.append('audio', audioToProcess instanceof File ? audioToProcess : new File([audioToProcess], 'audio.mp3', { type: audioToProcess.type || 'audio/mpeg' }));
      formData.append('expectedLanguage', expectedLanguage);

      const response = await fetch('/api/whisper/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to transcribe audio');
      }

      const result: WhisperTranscriptionResponse = await response.json();
      
      // Debug: Log raw segments to help diagnose issues
      console.log('Raw Whisper segments:', result.segments.length);
      if (result.segments.length > 0) {
        console.log('First segment example:', result.segments[0]);
      }
      
      // Check for language mismatch
      if (!result.languageMatch) {
        setLanguageMismatch(true);
        setDetectedLanguage(result.detectedLanguage);
        // Still show segments but with warning
      }

      // Validate segments - but be lenient to avoid losing segments
      // The API should already split multi-sentence segments, but we'll validate here as a safety check
      let validSegments = filterValidSentences(result.segments);
      
      // Warn about segments with multiple sentences but don't filter them out
      // This way the user can see what needs to be fixed
      const segmentsWithMultipleSentences = validSegments.filter(seg => {
        const origHasMultiple = hasMultipleSentences(seg.originalText);
        const engHasMultiple = hasMultipleSentences(seg.englishText);
        return origHasMultiple || engHasMultiple;
      });
      
      if (segmentsWithMultipleSentences.length > 0) {
        console.warn('Some segments contain multiple sentences (should have been split by API):', segmentsWithMultipleSentences.length);
        // Don't filter them out - let the user see and adjust them
      }
      
      console.log('Valid segments after filtering:', validSegments.length);
      
      // If all segments were filtered out, log why
      if (result.segments.length > 0 && validSegments.length === 0) {
        console.warn('All segments were filtered out. Sample segments:', result.segments.slice(0, 3));
      }
      
      // Check for duplicates
      const allSentences = await storage.getSentences(expectedLanguage);
      const duplicateMap = new Map<string, DuplicateMatch[]>();
      
      for (const segment of validSegments) {
        const matches = findDuplicateMatchesForSegment(
          segment.originalText,
          segment.englishText,
          allSentences
        );
        const allMatches = [...matches.originalMatches, ...matches.englishMatches];
        if (allMatches.length > 0) {
          duplicateMap.set(segment.id, allMatches);
        }
      }

      setWhisperSegments(validSegments);
      setDuplicateMatches(duplicateMap);

      // Update pending audio metadata
      await storage.updatePendingAudioMetadata(audioId, {
        segments: validSegments,
        detectedLanguage: result.detectedLanguage,
      });

    } catch (error) {
      console.error('Whisper processing error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setWhisperError(errorMessage);
      setNotification({
        message: `Failed to process audio: ${errorMessage}`,
        type: 'error',
      });
      // Keep Whisper Mode UI open to show error state
      // Don't close it so user can see what went wrong
    } finally {
      setProcessingWhisper(false);
    }
  }

  async function handleSaveSelectedSegments() {
    if (selectedSegmentIds.size === 0) {
      setNotification({ message: 'Please select at least one segment', type: 'warning' });
      return;
    }

    if (!fullAudioBlob || !pendingAudioId) {
      setNotification({ message: 'Audio data missing', type: 'error' });
      return;
    }

    try {
      const storage = getStorage();
      const settings = await storage.getSettings() || DEFAULT_SETTINGS;
      const language = settings.current_language || 'hu';

      const selectedSegments = whisperSegments.filter(s => selectedSegmentIds.has(s.id));
      
      for (const segment of selectedSegments) {
        // Extract audio segment
        const formData = new FormData();
        formData.append('audio', fullAudioBlob, 'audio.mp3');
        formData.append('startTime', segment.start.toString());
        formData.append('endTime', segment.end.toString());

        const segmentResponse = await fetch('/api/audio/segment', {
          method: 'POST',
          body: formData,
        });

        if (!segmentResponse.ok) {
          throw new Error(`Failed to segment audio for segment ${segment.id}`);
        }

        const segmentAudioBlob = await segmentResponse.blob();

        // Create sentence
        const sentence = createSentence(
          language,
          segment.englishText,
          '', // Will update after audio is saved
          {
            targetText: segment.originalText,
          }
        );

        // Save audio segment
        const audioUri = await storage.saveAudio(
          sentence.id,
          segmentAudioBlob,
          `segment-${sentence.id}.mp3`
        );
        sentence.target_audio_uri = audioUri;

        // Calculate duration
        const duration = segment.end - segment.start;
        sentence.target_audio_duration_seconds = duration;

        await storage.saveSentence(sentence);
      }

      // Update pending audio to mark processed segments
      const pendingMetadata = await storage.getAllPendingAudios(language);
      const currentPending = pendingMetadata.find(p => p.id === pendingAudioId);
      if (currentPending) {
        const processedSegmentIds = new Set(selectedSegmentIds);
        await storage.updatePendingAudioMetadata(pendingAudioId, {
          processedAt: new Date(),
        });
      }

      setNotification({
        message: `Successfully saved ${selectedSegmentIds.size} sentence(s)`,
        type: 'success',
      });

      // Reset Whisper workflow
      setWhisperMode(false);
      setWhisperSegments([]);
      setSelectedSegmentIds(new Set());
      setDuplicateMatches(new Map());
      setFullAudioBlob(null);
      setPendingAudioId(null);
      setLanguageMismatch(false);
      setDetectedLanguage(null);
      setAudioFile(null);
      setAudioBlob(null);

      await loadSettingsAndSentences();
      await loadPendingAudios();
    } catch (error) {
      console.error('Error saving segments:', error);
      setNotification({
        message: `Failed to save segments: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error',
      });
    }
  }

  async function handleUpdateSegment(segmentId: string, updates: Partial<WhisperSegment>) {
    console.log('🔄 handleUpdateSegment called:', { segmentId, updates, pendingAudioId });
    
    // Update local state using functional update to ensure we have latest state
    let updatedSegments: WhisperSegment[];
    setWhisperSegments(prev => {
      updatedSegments = prev.map(seg =>
        seg.id === segmentId ? { ...seg, ...updates } : seg
      );
      console.log('📝 Updated segments array:', updatedSegments.map(s => ({ id: s.id, start: s.start, end: s.end })));
      return updatedSegments;
    });
    
    // Persist to pending audio metadata
    if (pendingAudioId) {
      try {
        const storage = getStorage();
        // Use the updatedSegments from the closure to ensure we save the correct data
        console.log('💾 Saving to storage with segments:', updatedSegments!.map(s => ({ id: s.id, start: s.start, end: s.end })));
        await storage.updatePendingAudioMetadata(pendingAudioId, {
          segments: updatedSegments!,
        });
        
        // Verify it was saved by reading it back
        const allPending = await storage.getAllPendingAudios();
        const savedPending = allPending.find(p => p.id === pendingAudioId);
        console.log('✅ Segment updated and saved to storage. Verification:', {
          pendingAudioId,
          segmentId,
          updates,
          savedSegments: savedPending?.segments?.map(s => ({ id: s.id, start: s.start, end: s.end })) || 'none'
        });
      } catch (error) {
        console.error('❌ Error saving segment update:', error);
        setNotification({
          message: 'Failed to save timestamp changes',
          type: 'error',
        });
      }
    } else {
      console.warn('⚠️ Cannot save segment update: no pendingAudioId');
    }
  }

  async function handleUpdateMultipleSegments(updates: Array<{ segmentId: string; updates: Partial<WhisperSegment> }>) {
    console.log('🔄 handleUpdateMultipleSegments called:', { updates, pendingAudioId });
    
    // Update local state using functional update to ensure we have latest state
    let updatedSegments: WhisperSegment[];
    setWhisperSegments(prev => {
      updatedSegments = prev.map(seg => {
        const segUpdate = updates.find(u => u.segmentId === seg.id);
        return segUpdate ? { ...seg, ...segUpdate.updates } : seg;
      });
      console.log('📝 Updated segments array (multiple):', updatedSegments.map(s => ({ id: s.id, start: s.start, end: s.end })));
      return updatedSegments;
    });
    
    // Persist to pending audio metadata
    if (pendingAudioId) {
      try {
        const storage = getStorage();
        // Use the updatedSegments from the closure to ensure we save the correct data
        console.log('💾 Saving to storage with segments (multiple):', updatedSegments!.map(s => ({ id: s.id, start: s.start, end: s.end })));
        await storage.updatePendingAudioMetadata(pendingAudioId, {
          segments: updatedSegments!,
        });
        
        // Verify it was saved by reading it back
        const allPending = await storage.getAllPendingAudios();
        const savedPending = allPending.find(p => p.id === pendingAudioId);
        console.log('✅ Multiple segments updated and saved to storage. Verification:', {
          pendingAudioId,
          updates: updates.map(u => ({ id: u.segmentId, changes: u.updates })),
          savedSegments: savedPending?.segments?.map(s => ({ id: s.id, start: s.start, end: s.end })) || 'none'
        });
      } catch (error) {
        console.error('❌ Error saving segment updates:', error);
        setNotification({
          message: 'Failed to save timestamp changes',
          type: 'error',
        });
      }
    } else {
      console.warn('⚠️ Cannot save segment updates: no pendingAudioId');
    }
  }

  function handlePlaySegment(segment: WhisperSegment) {
    if (!fullAudioBlob) return;

    // Create audio element and play the segment
    const audio = new Audio(URL.createObjectURL(fullAudioBlob));
    audio.currentTime = segment.start;
    audio.play();
    
    const stopAt = segment.end;
    const checkTime = setInterval(() => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        clearInterval(checkTime);
      }
    }, 100);

    audio.onended = () => clearInterval(checkTime);
  }

  const seekToTimeRef = useRef<((time: number) => void) | null>(null);

  function handleSeekToSegment(segmentId: string) {
    const segment = whisperSegments.find(s => s.id === segmentId);
    if (!segment || !seekToTimeRef.current) return;

    seekToTimeRef.current(segment.start);
  }

  function handleAudioTimeUpdate(currentTime: number, activeSegmentId: string | null) {
    setAudioPlayerState(prev => ({
      ...prev,
      currentTime,
      activeSegmentId,
    }));
  }

  async function handleLoadPendingAudio(pendingAudio: PendingAudioMetadata) {
    try {
      const storage = getStorage();
      const audioBlob = await storage.getPendingAudio(pendingAudio.id);
      if (!audioBlob) {
        setNotification({ message: 'Pending audio file not found', type: 'error' });
        return;
      }

      // Always reload from storage to get the latest segments
      const allPending = await storage.getAllPendingAudios();
      const latestPending = allPending.find(p => p.id === pendingAudio.id);
      const segmentsToLoad = latestPending?.segments || pendingAudio.segments || [];
      
      console.log('📥 Loading pending audio:', {
        pendingAudioId: pendingAudio.id,
        segmentsFromParam: pendingAudio.segments?.map(s => ({ id: s.id, start: s.start, end: s.end })),
        segmentsFromStorage: segmentsToLoad.map(s => ({ id: s.id, start: s.start, end: s.end }))
      });

      setPendingAudioId(pendingAudio.id);
      setFullAudioBlob(audioBlob);
      setWhisperSegments(segmentsToLoad);
      setDetectedLanguage(latestPending?.detectedLanguage || pendingAudio.detectedLanguage);
      setLanguageMismatch(
        (latestPending?.detectedLanguage || pendingAudio.detectedLanguage) && 
        (latestPending?.detectedLanguage || pendingAudio.detectedLanguage) !== pendingAudio.languageCode
      );
      setWhisperMode(true);
      setShowAddForm(false);

      // Check for duplicates
      const settings = await storage.getSettings() || DEFAULT_SETTINGS;
      const language = settings.current_language || 'hu';
      const allSentences = await storage.getSentences(language);
      const duplicateMap = new Map<string, DuplicateMatch[]>();
      
      for (const segment of segmentsToLoad) {
        const matches = findDuplicateMatchesForSegment(
          segment.originalText,
          segment.englishText,
          allSentences
        );
        const allMatches = [...matches.originalMatches, ...matches.englishMatches];
        if (allMatches.length > 0) {
          duplicateMap.set(segment.id, allMatches);
        }
      }
      setDuplicateMatches(duplicateMap);
    } catch (error) {
      console.error('Error loading pending audio:', error);
      setNotification({
        message: 'Failed to load pending audio',
        type: 'error',
      });
    }
  }

  function handleDeletePendingAudio(audioIdToDelete: string) {
    setConfirmDialog({
      message: 'Are you sure you want to delete this pending audio file? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const storage = getStorage();
          await storage.deletePendingAudio(audioIdToDelete);
          
          // If this was the currently loaded audio, reset the Whisper mode
          if (pendingAudioId === audioIdToDelete) {
            handleCloseWhisperMode();
          }
          
          // Reload pending audios list
          await loadPendingAudios();
          
          setNotification({
            message: 'Pending audio file deleted',
            type: 'success',
          });
        } catch (error) {
          console.error('Error deleting pending audio:', error);
          setNotification({
            message: 'Failed to delete pending audio file',
            type: 'error',
          });
        }
      },
    });
  }

  function handleCloseWhisperMode() {
    setWhisperMode(false);
    setPendingAudioId(null);
    setFullAudioBlob(null);
    setWhisperSegments([]);
    setSelectedSegmentIds(new Set());
    setDuplicateMatches(new Map());
    setLanguageMismatch(false);
    setDetectedLanguage(null);
    setProcessingWhisper(false);
    setWhisperError(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Inbox</h1>
          <div className="flex items-center gap-4">
            <LanguageSwitcher onLanguageChange={() => {
              loadSettingsAndSentences();
              loadPendingAudios();
            }} />
            <Link
              href="/"
              className="text-blue-500 hover:text-blue-700"
            >
              ← Back to Home
            </Link>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bg-blue-100 p-4 rounded mb-4 flex justify-between items-center">
            <span>{selectedIds.size} sentence(s) selected</span>
            <button
              onClick={handleBulkEligible}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Mark as Eligible
            </button>
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={async () => {
              setShowAddForm(!showAddForm);
              setEditingSentence(null);
              const storage = getStorage();
              const settings = await storage.getSettings() || DEFAULT_SETTINGS;
              const language = settings.current_language || 'hu';
              setFormData({
                englishTranslation: '',
                targetText: '',
                tags: '',
              });
              setAudioFile(null);
              setAudioBlob(null);
            }}
            className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
          >
            {showAddForm ? 'Cancel' : '+ Add Sentence'}
          </button>
        </div>

        {/* Pending Audio Files Section */}
        {pendingAudios.length > 0 && !whisperMode && (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
            <h2 className="text-xl font-bold mb-3">Pending Audio Files</h2>
            <div className="space-y-2">
              {pendingAudios.map((pending) => (
                <div
                  key={pending.id}
                  className="bg-white border rounded p-3 flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold">{pending.filename}</div>
                    <div className="text-sm text-gray-500">
                      Uploaded: {new Date(pending.uploadedAt).toLocaleString()}
                      {pending.segments && (
                        <> | {pending.segments.length} segments</>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLoadPendingAudio(pending)}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                      Continue Processing
                    </button>
                    <button
                      onClick={() => handleDeletePendingAudio(pending.id)}
                      className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Whisper Mode UI */}
        {whisperMode && (
          <div className="bg-gray-100 p-6 rounded mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Process Audio with Whisper</h2>
              <button
                onClick={handleCloseWhisperMode}
                disabled={processingWhisper}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Close
              </button>
            </div>

            {/* Processing Indicator */}
            {processingWhisper && (
              <div className="bg-blue-100 border border-blue-400 rounded p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <div>
                    <div className="font-semibold text-blue-800">Processing audio with Whisper...</div>
                    <div className="text-sm text-blue-700">This may take a minute. Please wait.</div>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {whisperError && (
              <div className="bg-red-100 border border-red-400 rounded p-4 mb-4">
                <div className="font-semibold text-red-800 mb-2">⚠️ Processing Error</div>
                <div className="text-red-700 mb-3">
                  <strong>Error:</strong> {whisperError}
                </div>
                <div className="mt-3">
                  <button
                    onClick={handleCloseWhisperMode}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                  >
                    Close and Try Again
                  </button>
                </div>
              </div>
            )}

            {/* No Segments Warning (but no error) */}
            {!processingWhisper && !whisperError && whisperSegments.length === 0 && fullAudioBlob && (
              <div className="bg-yellow-100 border border-yellow-400 rounded p-4 mb-4">
                <div className="font-semibold text-yellow-800 mb-2">⚠️ No Segments Generated</div>
                <div className="text-yellow-700">
                  Processing completed but no segments were generated. This could mean:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>The audio file may not contain clear speech</li>
                    <li>The audio may be too short or silent</li>
                    <li>The audio format may not be fully supported</li>
                  </ul>
                  <div className="mt-3">
                    <button
                      onClick={handleCloseWhisperMode}
                      className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                    >
                      Close and Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {languageMismatch && detectedLanguage && (
              <div className="bg-yellow-100 border border-yellow-400 rounded p-4 mb-4">
                <div className="font-semibold text-yellow-800 mb-2">
                  ⚠️ Language Mismatch Detected
                </div>
                <div className="text-yellow-700 mb-3">
                  Expected: <strong>{currentLanguage}</strong> | Detected: <strong>{detectedLanguage}</strong>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const storage = getStorage();
                      const settings = await storage.getSettings() || DEFAULT_SETTINGS;
                      const updated: Settings = {
                        ...settings,
                        current_language: detectedLanguage,
                      };
                      await storage.saveSettings(updated);
                      setCurrentLanguage(detectedLanguage);
                      setLanguageMismatch(false);
                      await loadSettingsAndSentences();
                    }}
                    className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                  >
                    Switch to {detectedLanguage}
                  </button>
                  <button
                    onClick={() => setLanguageMismatch(false)}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                  >
                    Continue Anyway
                  </button>
                </div>
              </div>
            )}

            {whisperSegments.length > 0 && (
              <>
                {/* Header with selection count and save button */}
                <div className="mb-6 flex justify-between items-center sticky top-0 bg-white z-10 pb-4 border-b">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Review Segments</h2>
                    <span className="text-gray-600">
                      {selectedSegmentIds.size} of {whisperSegments.length} segments selected
                    </span>
                  </div>
                  <button
                    onClick={handleSaveSelectedSegments}
                    disabled={selectedSegmentIds.size === 0}
                    className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    Save Selected Sentences
                  </button>
                </div>

                {/* Clean sentence list */}
                <div className="mb-32">
                  <WhisperSegmentList
                    segments={whisperSegments}
                    selectedSegmentIds={selectedSegmentIds}
                    duplicateMatches={duplicateMatches}
                    activeSegmentId={audioPlayerState.activeSegmentId}
                    fullAudioBlob={fullAudioBlob}
                    isPlaying={audioPlayerState.isPlaying}
                    onToggleSelect={(id) => {
                      const newSet = new Set(selectedSegmentIds);
                      if (newSet.has(id)) {
                        newSet.delete(id);
                      } else {
                        newSet.add(id);
                      }
                      setSelectedSegmentIds(newSet);
                    }}
                    onUpdateSegment={handleUpdateSegment}
                    onUpdateMultipleSegments={handleUpdateMultipleSegments}
                    onPlaySegment={handlePlaySegment}
                    onSeekToSegment={handleSeekToSegment}
                    onEditExisting={(sentenceId) => {
                      // Navigate to edit or open edit dialog
                      const sentence = sentences.find(s => s.id === sentenceId);
                      if (sentence) {
                        handleEdit(sentence);
                        setWhisperMode(false);
                      }
                    }}
                  />
                </div>

                {/* Fixed audio player at bottom */}
                {fullAudioBlob && (
                  <FullAudioPlayer
                    audioBlob={fullAudioBlob}
                    segments={whisperSegments}
                    onTimeUpdate={handleAudioTimeUpdate}
                    onSeekToSegment={handleSeekToSegment}
                    onSeekToTimeRef={seekToTimeRef}
                  />
                )}
              </>
            )}
          </div>
        )}

        {showAddForm && !whisperMode && (
          <div className="bg-gray-100 p-6 rounded mb-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingSentence ? 'Edit Sentence' : 'Add New Sentence'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-semibold">English Translation *</label>
                <input
                  type="text"
                  value={formData.englishTranslation}
                  onChange={(e) => setFormData({ ...formData, englishTranslation: e.target.value })}
                  className="w-full p-2 border rounded"
                  placeholder="Enter English translation"
                />
              </div>
              <div>
                <label className="block mb-2 font-semibold">Target Text (Optional)</label>
                <input
                  type="text"
                  value={formData.targetText}
                  onChange={(e) => setFormData({ ...formData, targetText: e.target.value })}
                  className="w-full p-2 border rounded"
                  placeholder="Enter target language text"
                />
              </div>
              <div>
                <label className="block mb-2 font-semibold">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full p-2 border rounded"
                  placeholder="tag1, tag2, tag3"
                />
              </div>
              <div>
                <label className="block mb-2 font-semibold">Audio *</label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="w-full p-2 border rounded"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                      >
                        🎤 Record Audio
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                      >
                        ⏹ Stop Recording
                      </button>
                    )}
                    {(audioFile || audioBlob) && (
                      <button
                        onClick={handleProcessWithWhisper}
                        disabled={processingWhisper}
                        className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:bg-gray-400"
                      >
                        {processingWhisper ? 'Processing...' : '🎙️ Process with Whisper'}
                      </button>
                    )}
                    {audioBlob && (
                      <span className="text-green-600 self-center">✓ Recording saved</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingSentence(null);
                  }}
                  className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={toggleSelectAll}
            className="text-blue-500 hover:text-blue-700"
          >
            {selectedIds.size === sentences.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {sentences.length === 0 ? (
          <p className="text-gray-500">No sentences in inbox. Add your first sentence above!</p>
        ) : (
          <div className="space-y-2">
            {sentences.map((sentence) => (
              <div
                key={sentence.id}
                className="bg-white border rounded p-4 flex items-start gap-4"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(sentence.id)}
                  onChange={() => toggleSelect(sentence.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-semibold">{sentence.english_translation_text}</div>
                  {sentence.target_text && (
                    <div className="text-gray-600">{sentence.target_text}</div>
                  )}
                  <div className="text-sm text-gray-500 mt-1">
                    Language: {sentence.language_code}
                    {sentence.tags && sentence.tags.length > 0 && (
                      <> | Tags: {sentence.tags.join(', ')}</>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(sentence)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(sentence.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          confirmVariant="danger"
        />
      )}
    </main>
  );
}
