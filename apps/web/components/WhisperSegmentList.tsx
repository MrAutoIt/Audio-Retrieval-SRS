'use client';

import { useState, useEffect, useRef } from 'react';
import { WhisperSegment, DuplicateMatch } from '@/types/whisper';
import DuplicateWarning from './DuplicateWarning';

interface WhisperSegmentListProps {
  segments: WhisperSegment[];
  selectedSegmentIds: Set<string>;
  duplicateMatches: Map<string, DuplicateMatch[]>;
  activeSegmentId: string | null;
  fullAudioBlob: Blob | null;
  onToggleSelect: (segmentId: string) => void;
  onUpdateSegment: (segmentId: string, updates: Partial<WhisperSegment>) => Promise<void>;
  onUpdateMultipleSegments?: (updates: Array<{ segmentId: string; updates: Partial<WhisperSegment> }>) => Promise<void>;
  onPlaySegment: (segment: WhisperSegment) => void;
  onSeekToSegment: (segmentId: string) => void;
  onEditExisting: (sentenceId: string) => void;
  isPlaying?: boolean; // Whether the full audio is playing
}

export default function WhisperSegmentList({
  segments,
  selectedSegmentIds,
  duplicateMatches,
  activeSegmentId,
  fullAudioBlob,
  onToggleSelect,
  onUpdateSegment,
  onUpdateMultipleSegments,
  onSeekToSegment,
  onEditExisting,
  isPlaying = false,
}: WhisperSegmentListProps) {
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [clickedSegmentId, setClickedSegmentId] = useState<string | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [playingSegmentTime, setPlayingSegmentTime] = useState<number>(0);
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const [pendingChanges, setPendingChanges] = useState<{ start?: number; end?: number } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const editContainerRef = useRef<HTMLDivElement>(null);
  const endCheckIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // Reset pending changes when opening edit mode
  useEffect(() => {
    if (editingSegmentId) {
      const segment = segments.find(s => s.id === editingSegmentId);
      if (segment) {
        setPendingChanges(null); // Reset when opening
      }
    } else {
      setPendingChanges(null); // Clear when closing
    }
  }, [editingSegmentId, segments]);

  // Smooth time updates for segment playback
  useEffect(() => {
    if (!playingSegmentId || !playingAudio) {
      return;
    }
    
    const audio = playingAudio;
    const currentSegmentId = playingSegmentId;
    let rafId: number | null = null;
    
    const updateTime = () => {
      if (audio && !audio.paused && playingSegmentId === currentSegmentId) {
        const currentTime = audio.currentTime;
        setPlayingSegmentTime(currentTime);
        rafId = requestAnimationFrame(updateTime);
      } else {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };
    
    const handlePlay = () => {
      if (playingSegmentId === currentSegmentId && audio && !audio.paused) {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        setPlayingSegmentTime(audio.currentTime);
        rafId = requestAnimationFrame(updateTime);
      }
    };
    
    const handlePause = () => {
      // Capture exact time when pausing for perfect sync
      if (playingSegmentId === currentSegmentId) {
        setPlayingSegmentTime(audio.currentTime);
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    
    // Initial sync
    setPlayingSegmentTime(audio.currentTime);
    
    if (!audio.paused && playingSegmentId === currentSegmentId) {
      rafId = requestAnimationFrame(updateTime);
    }
    
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [playingSegmentId, playingAudio]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (playingAudio) {
        playingAudio.pause();
        if (playingAudio.src.startsWith('blob:')) {
          URL.revokeObjectURL(playingAudio.src);
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      endCheckIntervalsRef.current.forEach((interval) => {
        clearInterval(interval);
      });
      endCheckIntervalsRef.current.clear();
    };
  }, [playingAudio]);

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  function parseTimeInput(input: string): number {
    // Parse format like "0:05.30" or "5.30"
    const parts = input.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10) || 0;
      const secsParts = parts[1].split('.');
      const secs = parseInt(secsParts[0], 10) || 0;
      const ms = parseInt(secsParts[1] || '0', 10) || 0;
      return mins * 60 + secs + ms / 100;
    } else {
      const secsParts = input.split('.');
      const secs = parseInt(secsParts[0], 10) || 0;
      const ms = parseInt(secsParts[1] || '0', 10) || 0;
      return secs + ms / 100;
    }
  }

  function handleTimeChange(segmentId: string, field: 'start' | 'end', value: string) {
    const segment = segments.find(s => s.id === segmentId);
    if (!segment) return;

    const newTime = parseTimeInput(value);
    
    // Store pending changes locally instead of saving immediately
    setPendingChanges(prev => {
      const currentStart = prev?.start ?? segment.start;
      const currentEnd = prev?.end ?? segment.end;
      
      if (field === 'start') {
        const validStart = Math.max(0, Math.min(newTime, currentEnd - 0.1));
        return { ...prev, start: validStart, end: currentEnd };
      } else {
        const validEnd = Math.max(currentStart + 0.1, newTime);
        return { ...prev, start: currentStart, end: validEnd };
      }
    });
  }

  async function handleSaveChanges(segmentId: string) {
    console.log('💾 handleSaveChanges called for segment:', segmentId, 'pendingChanges:', pendingChanges);
    
    if (!pendingChanges) {
      console.log('⚠️ No pending changes, closing edit mode');
      setEditingSegmentId(null);
      return;
    }

    // Find the current segment index
    const currentIndex = segments.findIndex(s => s.id === segmentId);
    if (currentIndex === -1) {
      console.error('❌ Segment not found:', segmentId);
      setEditingSegmentId(null);
      return;
    }

    const segment = segments[currentIndex];
    const updates: Partial<WhisperSegment> = { ...pendingChanges };
    
    console.log('📝 Preparing to save:', {
      segmentId,
      currentSegment: { start: segment.start, end: segment.end },
      pendingChanges,
      updates
    });

    // Always update next segment's start if end time is in pending changes
    // This ensures continuity even if the end time didn't change much
    const finalEnd = pendingChanges.end ?? segment.end;
    const hasEndUpdate = pendingChanges.end !== undefined;
    
    try {
      // If end time was provided in pending changes, find and update the next segment
      if (hasEndUpdate) {
        // Use array index to find the next segment (the one immediately after in the list)
        // This is the correct approach because segments are displayed in array order
        const nextSegment = currentIndex < segments.length - 1 ? segments[currentIndex + 1] : null;
        
        console.log('🔗 Next segment lookup:', {
          finalEnd,
          currentIndex,
          currentSegment: { id: segment.id, start: segment.start, end: segment.end },
          nextSegment: nextSegment ? { id: nextSegment.id, start: nextSegment.start, end: nextSegment.end } : null,
        });
        
        if (nextSegment) {
          const nextStart = finalEnd; // Next segment should start right after this one ends
          
          console.log('✅ Updating multiple segments:', {
            current: { id: segmentId, updates },
            next: { id: nextSegment.id, newStart: nextStart, oldStart: nextSegment.start }
          });
          
          if (onUpdateMultipleSegments) {
            // Use batch update if available
            await onUpdateMultipleSegments([
              { segmentId, updates },
              { segmentId: nextSegment.id, updates: { start: nextStart } }
            ]);
            console.log('✅ Batch update completed');
          } else {
            // Fallback to individual updates
            console.log('⚠️ Using individual updates (no batch function)');
            await onUpdateSegment(nextSegment.id, { start: nextStart });
            await onUpdateSegment(segmentId, updates);
          }
        } else {
          // No next segment (this is the last one), just update current
          console.log('ℹ️ No next segment (last in list), updating current only');
          await onUpdateSegment(segmentId, updates);
        }
      } else {
        // Apply the pending changes to current segment only
        console.log('ℹ️ No end update, updating current segment only');
        await onUpdateSegment(segmentId, updates);
      }
      
      // Clear pending changes and close edit mode
      setPendingChanges(null);
      setEditingSegmentId(null);
      
      // Show success message
      const message = hasEndUpdate && currentIndex < segments.length - 1
        ? 'Timestamps saved successfully. Next segment start time updated automatically.'
        : 'Timestamps saved successfully';
      setSaveMessage(message);
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
      
      console.log('✅ Save completed successfully');
    } catch (error) {
      console.error('❌ Error saving timestamp changes:', error);
      setSaveMessage('Error saving timestamps. Please try again.');
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    }
  }

  function handleCancelEdit() {
    // Discard pending changes and close edit mode
    setPendingChanges(null);
    setEditingSegmentId(null);
  }

  function handleSegmentClick(segmentId: string, event: React.MouseEvent) {
    // Don't seek if clicking on checkbox or edit controls
    if ((event.target as HTMLElement).closest('input[type="checkbox"]') ||
        (event.target as HTMLElement).closest('button') ||
        (event.target as HTMLElement).closest('input[type="text"]') ||
        (event.target as HTMLElement).closest('input[type="range"]')) {
      return;
    }

    // Toggle clicked state and seek
    if (clickedSegmentId === segmentId) {
      setClickedSegmentId(null);
    } else {
      setClickedSegmentId(segmentId);
      onSeekToSegment(segmentId);
    }
  }

  function handlePlayPause(segment: WhisperSegment) {
    if (playingSegmentId === segment.id && playingAudio) {
      // Simple play/pause toggle - no automatic restart logic
      if (!playingAudio.paused) {
        // Pause - update time immediately for sync
        const pausedTime = playingAudio.currentTime;
        playingAudio.pause();
        setPlayingSegmentTime(pausedTime);
      } else {
        // Resume from current position
        playingAudio.play().catch(error => {
          console.error('Error resuming audio:', error);
        });
      }
    } else {
      // Start new playback
      if (!fullAudioBlob) return;
      
      // Stop any existing playback
      if (playingAudio) {
        playingAudio.pause();
        if (playingAudio.src.startsWith('blob:')) {
          URL.revokeObjectURL(playingAudio.src);
        }
      }
      
      const audio = new Audio(URL.createObjectURL(fullAudioBlob));
      audio.currentTime = segment.start;
      setPlayingSegmentId(segment.id);
      setPlayingSegmentTime(segment.start);
      
      // Don't automatically stop at segment end - let user manually pause
      // This allows them to find where the sentence actually ends
      
      audio.addEventListener('ended', () => {
        // If audio naturally ends, just update time
        const interval = endCheckIntervalsRef.current.get(segment.id);
        if (interval) {
          clearInterval(interval);
          endCheckIntervalsRef.current.delete(segment.id);
        }
        setPlayingSegmentTime(audio.duration);
      });
      
      setPlayingAudio(audio);
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
        const interval = endCheckIntervalsRef.current.get(segment.id);
        if (interval) {
          clearInterval(interval);
          endCheckIntervalsRef.current.delete(segment.id);
        }
        setPlayingSegmentId(null);
        setPlayingAudio(null);
      });
    }
  }

  function handleRestartSegment(segment: WhisperSegment) {
    if (playingSegmentId === segment.id && playingAudio) {
      // Always restart from beginning
      playingAudio.currentTime = segment.start;
      setPlayingSegmentTime(segment.start);
      
      // Clear any existing intervals
      const existingInterval = endCheckIntervalsRef.current.get(segment.id);
      if (existingInterval) {
        clearInterval(existingInterval);
        endCheckIntervalsRef.current.delete(segment.id);
      }
      
      // Play immediately
      playingAudio.play().catch(error => {
        console.error('Error restarting audio:', error);
      });
    } else if (fullAudioBlob) {
      // If not currently playing this segment, start it
      handlePlayPause(segment);
    }
  }

  function handleSetTime(segmentId: string, field: 'start' | 'end') {
    const segment = segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Get current playback time
    const currentTime = playingSegmentId === segmentId ? playingSegmentTime : segment.start;
    
    console.log('🎯 Set as', field, 'button clicked:', { segmentId, currentTime });
    
    // Update pendingChanges instead of saving immediately
    // This allows handleSaveChanges to process both the current segment AND the next segment's start time
    setPendingChanges(prev => ({
      ...prev,
      [field]: currentTime,
    }));
  }

  return (
    <div className="space-y-1">
      {segments.map((segment) => {
        const isSelected = selectedSegmentIds.has(segment.id);
        const isActive = activeSegmentId === segment.id;
        const duplicates = duplicateMatches.get(segment.id) || [];
        const isEditing = editingSegmentId === segment.id;
        const isHovered = hoveredSegmentId === segment.id;
        const isClicked = clickedSegmentId === segment.id;
        const showDetails = isHovered || isClicked || isEditing; // Show English when editing too
        const isSegmentPlaying = playingSegmentId === segment.id;
        const segmentCurrentTime = isSegmentPlaying ? playingSegmentTime : segment.start;
        const segmentDuration = segment.end - segment.start;
        // Calculate progress: up to 100% at segment end, but allow showing beyond
        const segmentProgress = segmentDuration > 0 
          ? Math.max(0, Math.min(100, ((segmentCurrentTime - segment.start) / segmentDuration) * 100))
          : 0;
        // For display: show relative time within segment, or absolute if beyond
        const displayDuration = segmentCurrentTime <= segment.end 
          ? segmentDuration 
          : segmentCurrentTime - segment.start;

        return (
          <div
            key={segment.id}
            onMouseEnter={() => setHoveredSegmentId(segment.id)}
            onMouseLeave={() => {
              // Keep clicked/editing state when mouse leaves
              if (!isClicked && !isEditing) {
                setHoveredSegmentId(null);
              }
            }}
            onClick={(e) => handleSegmentClick(segment.id, e)}
            className={`
              px-4 py-2 rounded transition-all cursor-pointer
              ${isActive 
                ? 'bg-blue-50' 
                : isSelected
                ? 'bg-green-50'
                : 'hover:bg-gray-50'
              }
            `}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(segment.id);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 cursor-pointer flex-shrink-0 mt-0.5"
              />
              
              <div className="flex-1 min-w-0">
                {/* Duplicate Warning */}
                {duplicates.length > 0 && (
                  <div className="mb-2">
                    <DuplicateWarning
                      matches={duplicates}
                      onIgnore={() => {
                        // Parent should handle this
                      }}
                      onEditExisting={onEditExisting}
                    />
                  </div>
                )}

                {/* Original Text - Underlined when active */}
                <div className={`
                  text-base transition-all
                  ${isActive 
                    ? 'underline decoration-blue-500 decoration-2 font-medium text-blue-900' 
                    : 'text-gray-900'
                  }
                `}>
                  {segment.originalText}
                </div>

                {/* English Translation - Show on hover/click, or locked when editing */}
                {(showDetails && segment.englishText) && (
                  <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                    <span>{segment.englishText}</span>
                    {isEditing && (
                      <span className="text-xs text-blue-600 font-medium">(locked)</span>
                    )}
                  </div>
                )}

                {/* Segment Player and Edit Controls - Show when editing */}
                {isEditing && (
                  <div 
                    ref={editContainerRef}
                    className="mt-4 pt-4 border-t border-gray-200 space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Segment Player with Slider */}
                    {fullAudioBlob && (
                      <div className="bg-blue-50 rounded border border-blue-200 p-3">
                        <div className="flex items-center gap-3 mb-2">
                          <button
                            onClick={() => handlePlayPause(segment)}
                            disabled={!fullAudioBlob}
                            className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors flex items-center gap-1"
                          >
                            {isSegmentPlaying && playingAudio && !playingAudio.paused
                              ? '⏸ Pause'
                              : '▶ Play'}
                          </button>
                          <button
                            onClick={() => handleRestartSegment(segment)}
                            disabled={!fullAudioBlob}
                            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors flex items-center gap-1"
                            title="Restart from beginning"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                              <path d="M21 3v5h-5" />
                              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                              <path d="M3 21v-5h5" />
                            </svg>
                          </button>
                          <div className="flex-1">
                            <input
                              type="range"
                              min={segment.start}
                              max={Math.max(segment.end, segmentCurrentTime + 5)} // Allow scrubbing beyond current end
                              step={0.01}
                              value={segmentCurrentTime}
                              onChange={(e) => {
                                const newTime = parseFloat(e.target.value);
                                if (isSegmentPlaying && playingAudio) {
                                  playingAudio.currentTime = newTime;
                                  setPlayingSegmentTime(newTime);
                                } else {
                                  setPlayingSegmentTime(newTime);
                                }
                              }}
                              className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer segment-slider"
                              style={{
                                // Calculate progress percentage based on slider max
                                background: (() => {
                                  const sliderMax = Math.max(segment.end, segmentCurrentTime + 5);
                                  const sliderRange = sliderMax - segment.start;
                                  const progressPercent = sliderRange > 0 
                                    ? ((segmentCurrentTime - segment.start) / sliderRange) * 100
                                    : 0;
                                  return `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #bfdbfe ${progressPercent}%, #bfdbfe 100%)`;
                                })()
                              }}
                            />
                          </div>
                          <span className="text-xs text-blue-700 font-mono">
                            {formatTime(segmentCurrentTime - segment.start)} / {formatTime(displayDuration)}
                            {segmentCurrentTime > segment.end && (
                              <span className="text-orange-600 ml-1">(+{formatTime(segmentCurrentTime - segment.end)})</span>
                            )}
                          </span>
                        </div>
                        {/* Set time buttons when paused */}
                        {isSegmentPlaying && playingAudio && playingAudio.paused && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-blue-300">
                            <button
                              onClick={() => handleSetTime(segment.id, 'start')}
                              className="text-xs px-2 py-1 bg-white text-blue-600 border border-blue-300 rounded hover:bg-blue-100 transition-colors"
                            >
                              Set as beginning
                            </button>
                            <button
                              onClick={() => handleSetTime(segment.id, 'end')}
                              className="text-xs px-2 py-1 bg-white text-blue-600 border border-blue-300 rounded hover:bg-blue-100 transition-colors"
                            >
                              Set as end
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Time Input Fields */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600">Start:</label>
                          <input
                            type="text"
                            value={formatTime(pendingChanges?.start ?? segment.start)}
                            onChange={(e) => handleTimeChange(segment.id, 'start', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveChanges(segment.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            autoFocus
                            placeholder="0:00.00"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600">End:</label>
                          <input
                            type="text"
                            value={formatTime(pendingChanges?.end ?? segment.end)}
                            onChange={(e) => handleTimeChange(segment.id, 'end', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveChanges(segment.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0:00.00"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {saveMessage && (
                          <span className="text-xs text-green-600 font-medium">
                            {saveMessage}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            console.log('💾 Save button clicked for segment:', segment.id);
                            await handleSaveChanges(segment.id);
                          }}
                          className="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-xs px-3 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamp info - Show on hover/click when not editing */}
                {showDetails && !isEditing && (
                  <div className="mt-2 flex items-center gap-4">
                    <div className="text-xs text-gray-500">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSegmentId(segment.id);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Edit timestamps
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <style jsx global>{`
        .segment-slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .segment-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
