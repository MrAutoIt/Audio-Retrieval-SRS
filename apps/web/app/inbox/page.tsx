'use client';

import { useEffect, useState } from 'react';
import { getStorage } from '@/lib/storage';
import { Sentence, createSentence } from '@audio-retrieval-srs/core';
import Link from 'next/link';
import { Notification } from '@/components/Notification';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getAudioDuration } from '@/lib/audio-utils';

export default function InboxPage() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSentence, setEditingSentence] = useState<Sentence | null>(null);
  const [formData, setFormData] = useState({
    englishTranslation: '',
    targetText: '',
    languageCode: 'hu',
    tags: '',
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'warning' | 'info' | 'success' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadSentences();
  }, []);

  async function loadSentences() {
    const storage = getStorage();
    const allSentences = await storage.getSentences();
    const inboxSentences = allSentences.filter(s => !s.is_eligible);
    setSentences(inboxSentences);
    setLoading(false);
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
        language_code: formData.languageCode,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : undefined,
        target_audio_uri: audioUri,
        target_audio_duration_seconds: audioDuration,
      };
      await storage.updateSentence(updated);
    } else {
      // Create new sentence first
      const sentence = createSentence(
        formData.languageCode,
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
    setFormData({
      englishTranslation: '',
      targetText: '',
      languageCode: 'hu',
      tags: '',
    });
    setAudioFile(null);
    setAudioBlob(null);
    setShowAddForm(false);
    setEditingSentence(null);
    await loadSentences();
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
    await loadSentences();
  }

  function handleEdit(sentence: Sentence) {
    setEditingSentence(sentence);
    setFormData({
      englishTranslation: sentence.english_translation_text,
      targetText: sentence.target_text || '',
      languageCode: sentence.language_code,
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
        await loadSentences();
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
          <Link
            href="/"
            className="text-blue-500 hover:text-blue-700"
          >
            ← Back to Home
          </Link>
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
            onClick={() => {
              setShowAddForm(!showAddForm);
              setEditingSentence(null);
              setFormData({
                englishTranslation: '',
                targetText: '',
                languageCode: 'hu',
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

        {showAddForm && (
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
                <label className="block mb-2 font-semibold">Language Code</label>
                <input
                  type="text"
                  value={formData.languageCode}
                  onChange={(e) => setFormData({ ...formData, languageCode: e.target.value })}
                  className="w-full p-2 border rounded"
                  placeholder="hu"
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
                    accept="audio/mpeg,audio/mp3"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="w-full p-2 border rounded"
                  />
                  <div className="flex gap-2">
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
