import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, AlertCircle } from 'lucide-react';
import { getIdToken } from '@/lib/firebase';

interface AudioPlayerProps {
  src: string;
  className?: string;
  title?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, className = '', title }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadAudio() {
      if (!src) return;

      // If it's already a blob or data url, use directly
      if (src.startsWith('blob:') || src.startsWith('data:')) {
        setBlobUrl(src);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const token = await getIdToken();
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';
        const fullUrl = src.startsWith('http') ? src : `${BASE_URL.replace(/\/v1$/, '')}${src.startsWith('/') ? '' : '/'}${src}`;

        const res = await fetch(fullUrl, { headers });
        if (!res.ok) {
          throw new Error(`Audio load error (${res.status})`);
        }
        const blob = await res.blob();
        if (active) {
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to play audio');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadAudio();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current || !blobUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Audio play error:', err);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg ${className}`}>
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Audio unavailable</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 bg-slate-100 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700/60 max-w-md ${className}`}>
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading || !blobUrl}
        className="w-8 h-8 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white flex items-center justify-center flex-shrink-0 shadow transition disabled:opacity-50"
      >
        {isLoading ? (
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-white" />
        ) : (
          <Play className="w-4 h-4 fill-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center gap-1">
        {title && <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">{title}</span>}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!blobUrl || duration === 0}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-700"
          />
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      <Volume2 className="w-4 h-4 text-slate-400 flex-shrink-0 hidden sm:block" />
    </div>
  );
};
