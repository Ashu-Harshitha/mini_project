import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AudioPlayerButtonProps {
  audioUrl?: string;
  speechText?: string;
  className?: string;
}

export const AudioPlayerButton: React.FC<AudioPlayerButtonProps> = ({
  audioUrl,
  speechText,
  className = '',
}) => {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggle = () => {
    if (!audioUrl && !speechText) return;

    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    setLoading(true);

    if (audioUrl) {
      if (!audioRef.current) {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          console.warn('Audio URL playback fallback to speech synthesis');
          fallbackToSpeech();
        };
      }
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setLoading(false);
        })
        .catch(() => {
          fallbackToSpeech();
        });
    } else {
      fallbackToSpeech();
    }
  };

  const fallbackToSpeech = () => {
    if ('speechSynthesis' in window && speechText) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      setLoading(false);
    } else {
      setIsPlaying(false);
      setLoading(false);
    }
  };

  const hasAudio = Boolean(audioUrl || speechText);

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!hasAudio}
      title={hasAudio ? 'Listen to agronomic report audio' : 'Audio recording not available'}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
        !hasAudio
          ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700 cursor-not-allowed opacity-60'
          : isPlaying
          ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
          : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:bg-slate-800 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-slate-750'
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : isPlaying ? (
        <Square className="w-3.5 h-3.5 fill-current" />
      ) : (
        <Volume2 className="w-4 h-4" />
      )}

      <span>
        {loading
          ? t('common.loading', 'Loading...')
          : isPlaying
          ? t('wizard.stop', 'Stop Audio')
          : t('wizard.listen', 'Listen')}
      </span>

      {isPlaying && (
        <span className="flex items-center gap-0.5 ml-1">
          <span className="w-1 h-2.5 bg-white rounded-full animate-pulse" />
          <span className="w-1 h-3.5 bg-white rounded-full animate-pulse delay-75" />
          <span className="w-1 h-1.5 bg-white rounded-full animate-pulse delay-150" />
        </span>
      )}
    </button>
  );
};
