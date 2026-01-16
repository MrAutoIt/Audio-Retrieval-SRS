'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getStorage } from '@/lib/storage';
import {
  Sentence,
  Session,
  createSession,
  Settings,
  DEFAULT_SETTINGS,
  Rating,
} from '@audio-retrieval-srs/core';
import {
  buildDueQueue,
  buildExtraQueue,
  reinsertItem,
} from '@audio-retrieval-srs/core';
import {
  processItem,
  handleRating,
  calculateResponseWindow,
  updateSessionState,
  isDueQueueComplete,
  SessionItemState,
} from '@audio-retrieval-srs/core';
import Link from 'next/link';

export default function SessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [currentItem, setCurrentItem] = useState<SessionItemState | null>(null);
  const [dueQueue, setDueQueue] = useState<Array<{ sentence: Sentence; position: number }>>([]);
  const [extraQueue, setExtraQueue] = useState<Array<{ sentence: Sentence; position: number }>>([]);
  const [currentQueue, setCurrentQueue] = useState<Array<{ sentence: Sentence; position: number }>>([]);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [dueQueueComplete, setDueQueueComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [targetSeconds, setTargetSeconds] = useState(0);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [capturingRating, setCapturingRating] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isResumed, setIsResumed] = useState(false);
  const [isPlayingAnswer, setIsPlayingAnswer] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const capturingRatingRef = useRef(false);
  const recognitionRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preloadedAudioRef = useRef<{ sentenceId: string; blob: Blob; url: string } | null>(null);
  const intentionalAbortRef = useRef<{ recognition: SpeechRecognition | null; timestamp: number } | null>(null);
  const abortErrorCountRef = useRef<{ recognition: SpeechRecognition; count: number; lastAbort: number } | null>(null);

  useEffect(() => {
    initializeSession();
    checkSpeechRecognition();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore errors
        }
      }
      if (preloadedAudioRef.current?.url) {
        URL.revokeObjectURL(preloadedAudioRef.current.url);
        preloadedAudioRef.current = null;
      }
      capturingRatingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (session && startTimeRef.current) {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((new Date().getTime() - startTimeRef.current!.getTime()) / 1000);
        setElapsedSeconds(elapsed);
        
        // Auto-save session state periodically
        if (elapsed % 10 === 0) {
          saveSessionState();
        }

        // Check if target time reached
        if (elapsed >= targetSeconds) {
          endSession();
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [session, targetSeconds]);

  async function initializeSession() {
    const storage = getStorage();
    
    // Check for incomplete session
    const incomplete = await storage.getIncompleteSession();
    if (incomplete) {
      // Auto-resume incomplete session (user can end it if they want)
      await resumeSession(incomplete);
      return;
    }

    // Get duration from URL or default
    const duration = parseInt(searchParams.get('duration') || '10');
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    
    const newSession = createSession(duration, settings);
    await storage.saveSession(newSession);
    setSession(newSession);
    setTargetSeconds(duration * 60);
    startTimeRef.current = new Date();

    await loadQueues(newSession, settings);
    setLoading(false);
  }

  async function resumeSession(incompleteSession: Session) {
    const storage = getStorage();
    const settings = incompleteSession.settings_snapshot;
    
    // Backward compatibility: initialize frozen_sentence_ids if missing
    if (!incompleteSession.state.frozen_sentence_ids) {
      incompleteSession.state.frozen_sentence_ids = [];
    }
    
    setSession(incompleteSession);
    setCurrentPosition(incompleteSession.state.queue_position);
    setElapsedSeconds(incompleteSession.state.elapsed_time_seconds);
    setTargetSeconds(incompleteSession.target_minutes * 60);
    setIsResumed(true);
    startTimeRef.current = new Date(Date.now() - incompleteSession.state.elapsed_time_seconds * 1000);

    await loadQueues(incompleteSession, settings);
    setLoading(false);
    
    // Hide resumed indicator after 5 seconds
    setTimeout(() => setIsResumed(false), 5000);
  }

  async function loadQueues(session: Session, settings: Settings) {
    const storage = getStorage();
    const appSettings = await storage.getSettings() || DEFAULT_SETTINGS;
    const language = appSettings.current_language || 'hu';
    const sentences = await storage.getSentences(language);
    const reviewEvents = await storage.getReviewEvents();

    const due = buildDueQueue(sentences, session, settings);
    const extra = buildExtraQueue(sentences, session.id, reviewEvents, settings);

    setDueQueue(due);
    setExtraQueue(extra);
    setCurrentQueue(due);
    setDueQueueComplete(due.length === 0);

    if (due.length > 0) {
      await startNextItem(due[0].sentence, settings);
    } else if (extra.length > 0) {
      setDueQueueComplete(true);
      await startNextItem(extra[0].sentence, settings);
    }
  }

  function checkSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setSpeechAvailable(true);
    } else {
      setSpeechAvailable(false);
      setUsingFallback(true);
    }
  }

  async function startNextItem(sentence: Sentence, settings: Settings) {
    const storage = getStorage();
    
    // Check if audio exists
    const audioExists = await storage.audioExists(sentence.id);
    if (!audioExists) {
      // Skip this item
      console.warn(`Skipping sentence ${sentence.id} - audio missing`);
      moveToNextItem();
      return;
    }

    // Use stored audio duration, or fallback to calculating it
    let audioDuration = sentence.target_audio_duration_seconds;
    
    if (!audioDuration || audioDuration <= 0) {
      // Fallback: calculate duration if not stored (for old sentences)
      const audio = await storage.getAudio(sentence.id);
      if (audio) {
        const { getAudioDuration } = await import('@/lib/audio-utils');
        const calculatedDuration = await getAudioDuration(audio);
        audioDuration = calculatedDuration || 3; // Default 3 seconds if calculation fails
        
        // Update the sentence with the calculated duration for future use
        if (calculatedDuration) {
          const updated = { ...sentence, target_audio_duration_seconds: calculatedDuration };
          await storage.updateSentence(updated);
        }
      } else {
        audioDuration = 3; // Default fallback
      }
    }

    const responseWindow = calculateResponseWindow(audioDuration, settings);

    const itemState: SessionItemState = {
      sentence,
      responseWindowSeconds: responseWindow,
      targetAudioDurationSeconds: audioDuration,
      phase: 'prompt',
      startTime: new Date(),
    };

    setCurrentItem(itemState);

    // Preload audio in the background so it's ready when needed
    storage.getAudio(sentence.id).then(audio => {
      if (audio) {
        // Clean up previous preloaded audio
        if (preloadedAudioRef.current?.url) {
          URL.revokeObjectURL(preloadedAudioRef.current.url);
        }
        const url = URL.createObjectURL(audio);
        preloadedAudioRef.current = {
          sentenceId: sentence.id,
          blob: audio,
          url: url
        };
        console.log('Audio preloaded for sentence:', sentence.id);
      }
    }).catch(err => {
      console.error('Failed to preload audio:', err);
    });

    // Play English prompt via TTS - use a small delay to ensure state is set
    setTimeout(() => {
      if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(sentence.english_translation_text);
        utterance.onend = () => {
          console.log('TTS ended, transitioning to response phase');
          // Move to response phase
          setCurrentItem(prev => {
            if (!prev || prev.sentence.id !== sentence.id) {
              console.warn('TTS onend: item mismatch or missing', { prevId: prev?.sentence.id, sentenceId: sentence.id });
              return prev;
            }
            const result = processItem(prev, settings, queueLengthRef.current || currentQueue.length, currentPositionRef.current || currentPosition);
            console.log('TTS onend: processItem result', { oldPhase: prev.phase, newPhase: result.nextState?.phase });
            return result.nextState || prev;
          });
        };
        utterance.onerror = (event) => {
          console.error('TTS error:', event);
          // Fallback: transition to response phase even if TTS errors
          setCurrentItem(prev => {
            if (!prev || prev.sentence.id !== sentence.id) return prev;
            const result = processItem(prev, settings, queueLengthRef.current || currentQueue.length, currentPositionRef.current || currentPosition);
            return result.nextState || prev;
          });
        };
        window.speechSynthesis.speak(utterance);
      } else {
        // Fallback: show text and auto-advance
        setTimeout(() => {
          setCurrentItem(prev => {
            if (!prev || prev.sentence.id !== sentence.id) return prev;
            const result = processItem(prev, settings, currentQueue.length, currentPosition);
            return result.nextState || prev;
          });
        }, 2000);
      }
    }, 100);
  }

  // Extract stable primitive values for dependency array to avoid size changes
  const currentPhase = currentItem?.phase ?? null;
  const currentSentenceId = currentItem?.sentence.id ?? null;
  const sessionId = session?.id ?? null;
  const queueLength = currentQueue.length;
  const extraQueueLength = extraQueue.length;

  // Use refs to always access latest state in intervals
  const currentItemRef = useRef(currentItem);
  const sessionRef = useRef(session);
  const isPlayingAnswerRef = useRef(isPlayingAnswer);
  const currentPositionRef = useRef(currentPosition);
  const queueLengthRef = useRef(queueLength);
  const extraQueueRef = useRef(extraQueue);
  const dueQueueCompleteRef = useRef(dueQueueComplete);

  // Keep refs in sync with state
  useEffect(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    isPlayingAnswerRef.current = isPlayingAnswer;
  }, [isPlayingAnswer]);
  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);
  useEffect(() => {
    queueLengthRef.current = queueLength;
  }, [queueLength]);
  useEffect(() => {
    extraQueueRef.current = extraQueue;
  }, [extraQueue]);
  useEffect(() => {
    dueQueueCompleteRef.current = dueQueueComplete;
  }, [dueQueueComplete]);

  useEffect(() => {
    if (!currentItem || !session) return;

    // Only check phase transitions, don't trigger TTS here
    const checkPhase = setInterval(() => {
      // Always read from refs to get latest state
      const currentItemState = currentItemRef.current;
      const sessionState = sessionRef.current;
      const isPlaying = isPlayingAnswerRef.current;
      
      if (!currentItemState || !sessionState || isPlaying) return; // Don't check while audio is playing

      const settings = sessionState.settings_snapshot;
      const result = processItem(currentItemState, settings, queueLengthRef.current, currentPositionRef.current);

      // Only handle phase transitions that don't involve TTS
      if (result.shouldPlayAnswer && currentItemState.phase === 'response' && !isPlaying) {
        console.log('Interval detected shouldPlayAnswer, calling playTargetAudio', { phase: currentItemState.phase });
        playTargetAudio();
      }

      // Handle automatic phase transitions (e.g., prompt -> response if TTS onend didn't fire)
      // But don't auto-transition from 'answer' phase - let audio control that
      if (result.nextState && result.nextState.phase !== currentItemState.phase && currentItemState.phase !== 'answer') {
        // Special case: if we're still in 'prompt' phase but TTS should have finished,
        // transition to 'response' (defensive against TTS onend not firing)
        if (currentItemState.phase === 'prompt' && result.nextState.phase === 'response') {
          console.log('Auto-transitioning from prompt to response (TTS may have finished silently)');
        }
        setCurrentItem(result.nextState);
      }

      if (result.dueQueueComplete && !dueQueueCompleteRef.current) {
        setDueQueueComplete(true);
        playDueCompleteNotice();
        // Switch to extra queue
        if (extraQueueRef.current.length > 0) {
          setCurrentQueue(extraQueueRef.current);
          setCurrentPosition(0);
        }
      }
    }, 100);

    return () => clearInterval(checkPhase);
  }, [currentPhase, currentSentenceId, sessionId, queueLength, currentPosition, dueQueueComplete, isPlayingAnswer, extraQueueLength]);

  async function playTargetAudio() {
    // Always read from refs to get latest state
    const currentItemState = currentItemRef.current;
    const sessionState = sessionRef.current;
    const isPlaying = isPlayingAnswerRef.current;
    
    if (!currentItemState || !sessionState || isPlaying) {
      console.log('playTargetAudio: conditions not met', { hasItem: !!currentItemState, hasSession: !!sessionState, isPlaying });
      return;
    }

    const startTime = performance.now();
    console.log('playTargetAudio: starting', { sentenceId: currentItemState.sentence.id, phase: currentItemState.phase });

    // Set playing state immediately before loading
    setIsPlayingAnswer(true);
    isPlayingAnswerRef.current = true;
    
    // First, transition to answer phase (show "Playing answer..." immediately)
    setCurrentItem(prev => {
      if (!prev) return prev;
      const nextState = {
        ...prev,
        phase: 'answer' as const,
        startTime: new Date(),
      };
      // Update ref immediately
      currentItemRef.current = nextState;
      return nextState;
    });

    let audio: Blob | null = null;
    let audioUrl: string | null = null;

    // Try to use preloaded audio first
    if (preloadedAudioRef.current?.sentenceId === currentItemState.sentence.id) {
      console.log('Using preloaded audio');
      audio = preloadedAudioRef.current.blob;
      audioUrl = preloadedAudioRef.current.url;
      // Clear the ref so we don't revoke the URL prematurely
      preloadedAudioRef.current = null;
    } else {
      // Fallback: load from storage
      console.log('Loading audio from storage (not preloaded)');
      const storage = getStorage();
      audio = await storage.getAudio(currentItemState.sentence.id);
      
      if (!audio) {
        setIsPlayingAnswer(false);
        isPlayingAnswerRef.current = false;
        moveToNextItem();
        return;
      }
      
      audioUrl = URL.createObjectURL(audio);
    }

    const loadTime = performance.now() - startTime;
    console.log(`Audio loaded in ${loadTime.toFixed(2)}ms`);

    const audioElement = new Audio(audioUrl);
    audioRef.current = audioElement;

    // Preload the audio element to ensure it's ready to play
    audioElement.preload = 'auto';
    
    // Wait for audio to be ready before playing
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('Audio ready timeout, attempting to play anyway');
        resolve();
      }, 5000); // 5 second timeout

      if (audioElement.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        clearTimeout(timeout);
        resolve();
      } else {
        audioElement.addEventListener('canplay', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
        audioElement.addEventListener('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        }, { once: true });
        // Trigger loading
        audioElement.load();
      }
    });

    try {
      await readyPromise;
      const readyTime = performance.now() - startTime;
      console.log(`Audio ready in ${readyTime.toFixed(2)}ms`);

      // Now play the audio
      await audioElement.play();
      const playTime = performance.now() - startTime;
      console.log(`Audio started playing in ${playTime.toFixed(2)}ms total`);
    } catch (error: any) {
      setIsPlayingAnswer(false);
      isPlayingAnswerRef.current = false;
      console.error('Failed to play audio:', error);
      URL.revokeObjectURL(audioUrl!);
      moveToNextItem();
      return;
    }

    audioElement.onended = () => {
      URL.revokeObjectURL(audioUrl!);
      setIsPlayingAnswer(false);
      isPlayingAnswerRef.current = false;
      // Move to rating phase after audio finishes
      setCurrentItem(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'rating',
          startTime: new Date(),
        };
      });
      // Play audio cue to indicate it's time to rate
      playRatingCue();
      // Small delay before starting rating capture
      setTimeout(() => {
        startRatingCapture();
      }, 300);
    };

    audioElement.onerror = (e) => {
      console.error('Audio element error:', e);
      URL.revokeObjectURL(audioUrl!);
      setIsPlayingAnswer(false);
      isPlayingAnswerRef.current = false;
      moveToNextItem();
    };

    audioElement.onplay = () => {
      console.log('Audio playback started');
      // Ensure we're in answer phase when audio starts
      setCurrentItem(prev => {
        if (!prev || prev.phase !== 'answer') return prev;
        return prev;
      });
    };
  }

  function startRatingCapture() {
    capturingRatingRef.current = true;
    setCapturingRating(true);

    if (speechAvailable && !usingFallback) {
      startSpeechRecognition();
    } else {
      // Use fallback UI
      setUsingFallback(true);
    }
  }

  function startSpeechRecognition() {
    // Clear any pending restart timeout
    if (recognitionRestartTimeoutRef.current) {
      clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }
    
    // Clean up any existing recognition instance
    if (recognitionRef.current) {
      // Mark this as an intentional abort so onend doesn't try to restart
      const oldRecognition = recognitionRef.current;
      intentionalAbortRef.current = {
        recognition: oldRecognition,
        timestamp: Date.now()
      };
      
      // Clear abort error count for the old recognition
      if (abortErrorCountRef.current?.recognition === oldRecognition) {
        abortErrorCountRef.current = null;
      }
      
      // Clear any pending restart timeout
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
        recognitionRestartTimeoutRef.current = null;
      }
      
      try {
        oldRecognition.stop();
        oldRecognition.abort(); // Force abort to ensure clean state
      } catch (e) {
        // Ignore errors from stopping
      }
      
      // Clear the ref immediately - don't wait for onend
      recognitionRef.current = null;
      
      // Clear the intentional abort flag after a delay to allow onend to fire
      setTimeout(() => {
        if (intentionalAbortRef.current?.recognition === oldRecognition) {
          intentionalAbortRef.current = null;
        }
      }, 1000);
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUsingFallback(true);
      return;
    }

    // Create a fresh recognition instance
    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Single result mode (more reliable)
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      console.log('Recognition result received');
      
      // Clear any pending restart timeout
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
        recognitionRestartTimeoutRef.current = null;
      }
      
      // Reset abort error count on successful result
      if (abortErrorCountRef.current?.recognition === recognition) {
        abortErrorCountRef.current = null;
      }
      
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      console.log('Transcript:', transcript);
      let rating: Rating | null = null;

      if (transcript.includes('miss')) {
        rating = 'Miss';
      } else if (transcript.includes('repeat')) {
        rating = 'Repeat';
      } else if (transcript.includes('next')) {
        rating = 'Next';
      } else if (transcript.includes('easy')) {
        rating = 'Easy';
      }

      if (rating) {
        console.log('Rating detected:', rating);
        handleRatingCapture(rating);
      } else {
        console.log('No valid rating found in transcript:', transcript);
        // Restart recognition to keep listening
        recognitionRestartTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current === recognition && capturingRatingRef.current && !usingFallback) {
            try {
              console.log('Restarting recognition after invalid transcript...');
              recognition.start();
            } catch (e: any) {
              console.error('Failed to restart recognition after invalid transcript:', e);
              // If it's an InvalidStateError, the recognition might already be starting
              if (e.name !== 'InvalidStateError') {
                setUsingFallback(true);
              }
            }
          }
        }, 500);
      }
    };

    recognition.onerror = (event: any) => {
      console.log('Recognition error:', event.error, event.message);
      
      // Clear any pending restart timeout
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
        recognitionRestartTimeoutRef.current = null;
      }
      
      // Handle different error types
      if (event.error === 'no-speech') {
        // Reset abort error count on successful no-speech (expected behavior)
        abortErrorCountRef.current = null;
        // No speech detected - recognition will auto-restart via onend handler
        // Don't restart here, let onend handle it
        return;
      }
      if (event.error === 'aborted') {
        // Track abort errors - if we get too many rapid aborts, stop trying to restart
        const now = Date.now();
        if (abortErrorCountRef.current?.recognition === recognition) {
          abortErrorCountRef.current.count++;
          abortErrorCountRef.current.lastAbort = now;
          
          // If we've had multiple aborts in quick succession, give up
          if (abortErrorCountRef.current.count >= 3 && (now - abortErrorCountRef.current.lastAbort) < 1000) {
            console.error('Too many rapid aborts detected, stopping recognition');
            capturingRatingRef.current = false;
            setCapturingRating(false);
            setUsingFallback(true);
            abortErrorCountRef.current = null;
            return;
          }
        } else {
          abortErrorCountRef.current = {
            recognition: recognition,
            count: 1,
            lastAbort: now
          };
        }
        
        // If this was an intentional abort, we'll ignore the onend restart
        // If it wasn't intentional, onend will handle restart
        return;
      }
      
      // Reset abort error count on other errors
      abortErrorCountRef.current = null;
      if (event.error === 'not-allowed') {
        // Microphone permission denied
        console.error('Microphone permission denied');
        capturingRatingRef.current = false;
        setUsingFallback(true);
        return;
      }
      if (event.error === 'network') {
        // Network error - try to restart
        console.warn('Recognition network error, will attempt restart');
        return; // Let onend handle restart
      }
      // Other errors - log and fallback
      console.error('Recognition error:', event.error, event.message);
      capturingRatingRef.current = false;
      setUsingFallback(true);
    };

    recognition.onend = () => {
      console.log('Recognition ended, recognitionRef matches:', recognitionRef.current === recognition, 'capturingRatingRef:', capturingRatingRef.current);
      
      // Clear any pending restart timeout first
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
        recognitionRestartTimeoutRef.current = null;
      }
      
      // Check if this was an intentional abort (e.g., when starting new recognition or stopping)
      const wasIntentionalAbort = intentionalAbortRef.current?.recognition === recognition;
      if (wasIntentionalAbort) {
        console.log('Recognition ended due to intentional abort, not restarting');
        // Clear the intentional abort flag and abort error count
        setTimeout(() => {
          if (intentionalAbortRef.current?.recognition === recognition) {
            intentionalAbortRef.current = null;
          }
          if (abortErrorCountRef.current?.recognition === recognition) {
            abortErrorCountRef.current = null;
          }
        }, 100);
        return;
      }
      
      // Check if we've had too many abort errors - if so, don't restart
      if (abortErrorCountRef.current?.recognition === recognition && abortErrorCountRef.current.count >= 3) {
        console.log('Too many abort errors for this recognition instance, not restarting');
        capturingRatingRef.current = false;
        setCapturingRating(false);
        setUsingFallback(true);
        abortErrorCountRef.current = null;
        return;
      }
      
      // Only restart if ref still matches (hasn't been cleared by handleRatingCapture)
      // and we're still supposed to be capturing
      // Use capturingRatingRef instead of closure to avoid stale values
      if (recognitionRef.current === recognition && capturingRatingRef.current && !usingFallback) {
        recognitionRestartTimeoutRef.current = setTimeout(() => {
          // Double-check everything before restarting
          // Also check that we haven't had too many aborts
          if (recognitionRef.current === recognition && 
              capturingRatingRef.current && 
              !usingFallback &&
              (!abortErrorCountRef.current || abortErrorCountRef.current.recognition !== recognition || abortErrorCountRef.current.count < 3)) {
            try {
              console.log('Restarting recognition after onend...');
              recognition.start();
              // Reset abort count on successful restart
              if (abortErrorCountRef.current?.recognition === recognition) {
                abortErrorCountRef.current.count = 0;
              }
            } catch (e: any) {
              // Ignore "already started" errors - recognition might have restarted already
              if (e.name === 'InvalidStateError' && e.message?.includes('already started')) {
                console.log('Recognition already started, ignoring error');
              } else {
                console.error('Failed to restart recognition after onend:', e);
                capturingRatingRef.current = false;
                setCapturingRating(false);
                setUsingFallback(true);
                abortErrorCountRef.current = null;
              }
            }
          } else {
            console.log('Skipping restart - conditions changed:', {
              refMatches: recognitionRef.current === recognition,
              capturing: capturingRatingRef.current,
              usingFallback,
              abortCount: abortErrorCountRef.current?.recognition === recognition ? abortErrorCountRef.current.count : 0
            });
          }
        }, 500); // Increased delay to reduce rapid restart attempts
      } else {
        console.log('Not restarting recognition - conditions not met:', {
          refMatches: recognitionRef.current === recognition,
          capturing: capturingRatingRef.current,
          usingFallback
        });
      }
    };

    recognitionRef.current = recognition;
    
    console.log('Starting speech recognition...');
    try {
      recognition.start();
      console.log('Speech recognition started');
    } catch (e) {
      console.error('Failed to start recognition:', e);
      setUsingFallback(true);
    }
  }
  
  function playRatingCue() {
    // Play a short beep/tone using Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // 800Hz tone
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
      // Fallback: use a simple TTS beep sound
      console.warn('Web Audio API not available, skipping audio cue');
    }
  }

  async function handleRatingCapture(rating: Rating) {
    if (!currentItem || !session) return;
    
    // Guard against invalid sentence state
    if (!currentItem.sentence.scheduling_state) {
      console.error('Sentence missing scheduling_state:', currentItem.sentence);
      return;
    }

    console.log('handleRatingCapture called with rating:', rating);
    
    // Clear any pending restart timeout
    if (recognitionRestartTimeoutRef.current) {
      clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }
    
    // Set capturingRating to false first to prevent restarts
    capturingRatingRef.current = false;
    setCapturingRating(false);
    
    // Stop recognition
    if (recognitionRef.current) {
      // Mark this as an intentional abort
      const oldRecognition = recognitionRef.current;
      intentionalAbortRef.current = {
        recognition: oldRecognition,
        timestamp: Date.now()
      };
      
      try {
        oldRecognition.stop();
        oldRecognition.abort(); // Force abort to ensure it stops immediately
      } catch (e) {
        // Ignore errors
      }
      
      // Clear abort error count
      if (abortErrorCountRef.current?.recognition === oldRecognition) {
        abortErrorCountRef.current = null;
      }
      
      // Clear the ref immediately
      recognitionRef.current = null;
      
      // Clear the intentional abort flag after a delay
      setTimeout(() => {
        if (intentionalAbortRef.current?.recognition === oldRecognition) {
          intentionalAbortRef.current = null;
        }
      }, 1000);
    }

    const storage = getStorage();
    const settings = session.settings_snapshot;

    const { updatedSentence, reviewEvent, shouldFreeze, shouldReinsert } = handleRating(
      currentItem.sentence,
      rating,
      session,
      settings
    );

    // Update sentence (for Repeat, updatedSentence is unchanged, so this is a no-op)
    // But we still save it for consistency
    await storage.updateSentence(updatedSentence);
    await storage.saveReviewEvent(reviewEvent);

    // Handle freeze state
    let updatedSession = session;
    if (shouldFreeze && !session.state.frozen_sentence_ids.includes(currentItem.sentence.id)) {
      // Add to frozen list (first time only)
      const newFrozenIds = [...session.state.frozen_sentence_ids, currentItem.sentence.id];
      updatedSession = updateSessionState(session, { frozen_sentence_ids: newFrozenIds });
      await storage.updateSession(updatedSession);
      setSession(updatedSession);
      
      // Play audio cue for freeze (optional - can be a short beep or TTS)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance('Frozen');
        utterance.volume = 0.3;
        window.speechSynthesis.speak(utterance);
      }
    } else if (rating === 'Miss') {
      // Miss clears freeze (remove from frozen list if present)
      const newFrozenIds = session.state.frozen_sentence_ids.filter(id => id !== currentItem.sentence.id);
      if (newFrozenIds.length !== session.state.frozen_sentence_ids.length) {
        updatedSession = updateSessionState(session, { frozen_sentence_ids: newFrozenIds });
        await storage.updateSession(updatedSession);
        setSession(updatedSession);
      }
    }

    // Handle reinsertion (Miss or Repeat)
    if (shouldReinsert && currentQueue.length > 0) {
      const reinserted = reinsertItem(currentQueue, { sentence: updatedSentence, position: currentPosition }, currentPosition);
      setCurrentQueue(reinserted);
    }

    moveToNextItem();
  }

  function moveToNextItem() {
    if (!session) return;

    // Clean up any preloaded audio from previous item
    if (preloadedAudioRef.current?.url) {
      URL.revokeObjectURL(preloadedAudioRef.current.url);
      preloadedAudioRef.current = null;
    }

    const nextPosition = currentPosition + 1;
    
    if (nextPosition >= currentQueue.length) {
      // Queue exhausted
      if (dueQueueComplete && extraQueue.length > 0) {
        // Switch to extra queue
        setCurrentQueue(extraQueue);
        setCurrentPosition(0);
        if (extraQueue.length > 0) {
          startNextItem(extraQueue[0].sentence, session.settings_snapshot);
        }
      } else {
        endSession();
      }
    } else {
      setCurrentPosition(nextPosition);
      if (currentQueue[nextPosition]) {
        startNextItem(currentQueue[nextPosition].sentence, session.settings_snapshot);
      }
    }
  }

  function playDueCompleteNotice() {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('Due reviews complete.');
      window.speechSynthesis.speak(utterance);
    }
  }

  async function saveSessionState() {
    if (!session) return;

    const storage = getStorage();
    const updated = updateSessionState(session, {
      current_item_id: currentItem?.sentence.id || null,
      queue_position: currentPosition,
      elapsed_time_seconds: elapsedSeconds,
    });
    await storage.updateSession(updated);
    setSession(updated);
  }

  async function endSession() {
    if (!session) return;

    setSessionComplete(true);
    const storage = getStorage();
    
    // Clear frozen sentence IDs at session end
    const updated: Session = {
      ...session,
      ended_at: new Date(),
      state: {
        ...session.state,
        is_complete: true,
        elapsed_time_seconds: elapsedSeconds,
        frozen_sentence_ids: [], // Clear freeze state at session end
      },
    };

    await storage.updateSession(updated);
    
    // Navigate to summary
    router.push(`/session/summary?sessionId=${session.id}`);
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>Loading session...</p>
      </main>
    );
  }

  if (sessionComplete) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>Session complete! Redirecting...</p>
      </main>
    );
  }

  if (!currentItem) {
    return (
      <main className="flex min-h-screen flex-col p-8">
        <p>No items to review. <Link href="/">Return to home</Link></p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Practice Session</h1>
          <div className="text-right">
            <div>Time: {formatTime(elapsedSeconds)} / {formatTime(targetSeconds)}</div>
            <div className="text-sm text-gray-600">
              {currentPosition + 1} / {currentQueue.length}
            </div>
          </div>
        </div>

        {isResumed && (
          <div className="bg-blue-100 border border-blue-500 rounded p-4 mb-4">
            <p className="font-semibold text-blue-800">↻ Resumed incomplete session</p>
          </div>
        )}

        {dueQueueComplete && (
          <div className="bg-green-100 border border-green-500 rounded p-4 mb-4">
            <p className="font-semibold text-green-800">✓ Due reviews complete. Continuing with extra practice.</p>
          </div>
        )}

        <div className="bg-white border rounded p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">
                English Prompt
              </label>
              <div className="text-xl font-semibold">
                {currentItem.sentence.english_translation_text}
              </div>
            </div>

            {currentItem.phase === 'response' && (
              <div className="bg-yellow-50 border border-yellow-300 rounded p-4">
                <p className="font-semibold">Response window: {currentItem.responseWindowSeconds.toFixed(1)}s</p>
                <p className="text-sm text-gray-600">Think of your answer...</p>
              </div>
            )}

            {currentItem.phase === 'answer' && (
              <div className="bg-blue-50 border border-blue-300 rounded p-4">
                <p className="font-semibold">Playing answer...</p>
              </div>
            )}

            {currentItem.phase === 'rating' && capturingRating && (
              <div className={`bg-purple-50 border-2 border-purple-400 rounded p-4 ${!usingFallback ? 'animate-pulse' : ''}`}>
                {usingFallback ? (
                  <div>
                    <p className="font-semibold mb-4">Rate this item:</p>
                    <div className="flex gap-4 justify-center flex-wrap">
                      <button
                        onClick={() => handleRatingCapture('Miss')}
                        className="bg-red-500 text-white px-6 py-3 rounded hover:bg-red-600 font-semibold"
                      >
                        Miss
                      </button>
                      <button
                        onClick={() => handleRatingCapture('Repeat')}
                        className="bg-orange-500 text-white px-6 py-3 rounded hover:bg-orange-600 font-semibold"
                      >
                        Repeat
                      </button>
                      <button
                        onClick={() => handleRatingCapture('Next')}
                        className="bg-blue-500 text-white px-6 py-3 rounded hover:bg-blue-600 font-semibold"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => handleRatingCapture('Easy')}
                        className="bg-green-500 text-white px-6 py-3 rounded hover:bg-green-600 font-semibold"
                      >
                        Easy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                    <p className="font-semibold text-lg">🎤 Listening for rating... (say "Miss", "Repeat", "Next", or "Easy")</p>
                    <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={endSession}
            className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600"
          >
            End Session
          </button>
        </div>
      </div>
    </main>
  );
}
