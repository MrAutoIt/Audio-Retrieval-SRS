'use client';

import { useRef, useEffect, useState } from 'react';
import { WhisperSegment, AudioPlayerState } from '@/types/whisper';

interface FullAudioPlayerProps {
  audioBlob: Blob | null;
  segments: WhisperSegment[];
  onTimeUpdate: (currentTime: number, activeSegmentId: string | null) => void;
  onSeekToSegment: (segmentId: string) => void;
  onSeekToTimeRef?: React.MutableRefObject<((time: number) => void) | null>;
}

export default function FullAudioPlayer({
  audioBlob,
  segments,
  onTimeUpdate,
  onSeekToSegment,
  onSeekToTimeRef,
}: FullAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [audioBlob]);

  // Expose seek method to parent via ref
  useEffect(() => {
    if (onSeekToTimeRef) {
      onSeekToTimeRef.current = (time: number) => {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = time;
          setCurrentTime(time);
        }
      };
    }
    return () => {
      if (onSeekToTimeRef) {
        onSeekToTimeRef.current = null;
      }
    };
  }, [onSeekToTimeRef]);


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      
      // Find active segment using ORIGINAL ARRAY ORDER (not sorted by timestamps)
      // This ensures highlighting follows the intended sequence even if timestamps overlap
      let activeSegment = null;
      
      // First, try to find a segment where time is within bounds (inclusive start, exclusive end)
      // Use original array order - first match wins
      activeSegment = segments.find(seg => time >= seg.start && time < seg.end);
      
      // If not found, check if we're exactly at a segment's end boundary
      if (!activeSegment) {
        activeSegment = segments.find(seg => Math.abs(time - seg.end) < 0.05);
      }
      
      // If still not found, check if we're at a segment's start boundary
      if (!activeSegment) {
        activeSegment = segments.find(seg => Math.abs(time - seg.start) < 0.05);
      }
      
      // If still not found, find the segment whose range we're closest to
      // Prefer segments in array order (earlier segments win ties)
      if (!activeSegment && segments.length > 0) {
        let bestMatch = segments[0];
        let bestScore = Infinity;
        
        for (const seg of segments) {
          // Calculate how "close" we are to this segment's time range
          let score;
          if (time < seg.start) {
            score = seg.start - time; // Before segment starts
          } else if (time > seg.end) {
            score = time - seg.end; // After segment ends
          } else {
            score = 0; // Within segment (shouldn't reach here)
          }
          
          // Use this segment if it's closer (strict less than to prefer earlier segments)
          if (score < bestScore) {
            bestScore = score;
            bestMatch = seg;
          }
        }
        
        activeSegment = bestMatch;
      }
      
      onTimeUpdate(time, activeSegment?.id || null);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleCanPlay = () => {
      // Fallback to get duration if loadedmetadata didn't fire
      if (audio.duration && isFinite(audio.duration) && duration === 0) {
        setDuration(audio.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [segments, onTimeUpdate, duration, audioUrl]);

  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (!audioUrl) {
    return (
      <div className="bg-gray-100 p-4 rounded text-center text-gray-500">
        No audio file loaded
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 shadow-lg z-50">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={handlePlayPause}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
          >
            {isPlaying ? (
              <>
                <span>⏸</span>
                <span>Pause</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Play</span>
              </>
            )}
          </button>
          <div className="flex-1 relative">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              step="0.01"
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer audio-slider"
              style={{
                background: `linear-gradient(to right, #2563eb 0%, #2563eb ${duration ? (currentTime / duration) * 100 : 0}%, #374151 ${duration ? (currentTime / duration) * 100 : 0}%, #374151 100%)`
              }}
            />
          </div>
          <div className="text-sm text-gray-300 min-w-[120px] text-right font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" preload="metadata" />}
      <style jsx global>{`
        .audio-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .audio-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </>
  );
}
