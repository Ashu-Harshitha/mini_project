import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, RotateCcw, Send, Play, Pause, AlertCircle, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob, language: string) => void;
  onCancel?: () => void;
  className?: string;
  defaultLang?: string;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSend,
  onCancel,
  className = '',
  defaultLang,
}) => {
  const { t } = useTranslation();
  const { user, language: appLang } = useAppStore();

  const [selectedLang, setSelectedLang] = useState<string>(
    defaultLang || user?.language || appLang || 'en'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop recording if max 60s reached
  useEffect(() => {
    if (recordSeconds >= 60 && isRecording) {
      stopRecording();
    }
  }, [recordSeconds, isRecording]);

  // Cleanup timer and preview url on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [previewUrl]);

  const startRecording = async () => {
    setErrorMessage(null);
    setAudioBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setPreviewUrl(url);

        // Stop all microphone tracks to release the mic
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200); // 200ms slice
      setIsRecording(true);
      setRecordSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage(t('voice.permissionDenied', 'Microphone access denied. Please allow microphone permissions in your browser.'));
      } else {
        setErrorMessage(t('voice.deviceError', 'Could not access microphone hardware.'));
      }
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const resetRecording = () => {
    stopRecording();
    setRecordSeconds(0);
    setAudioBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setIsPlayingPreview(false);
  };

  const handleSend = () => {
    if (!audioBlob) return;
    onSend(audioBlob, selectedLang);
    resetRecording();
  };

  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play().catch(console.error);
      setIsPlayingPreview(true);
    }
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={`p-4 bg-slate-50 dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
      {/* Error alert */}
      {errorMessage && (
        <div className="mb-3 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="flex-1 leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {/* Language Selector */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Globe className="w-4 h-4 text-emerald-600" />
          <span>{t('voice.spokenLanguage', 'Voice Language')}</span>
        </div>
        <select
          value={selectedLang}
          onChange={(e) => setSelectedLang(e.target.value)}
          disabled={isRecording}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          <option value="en">English (English)</option>
          <option value="hi">हिंदी (Hindi)</option>
          <option value="kn">ಕನ್ನಡ (Kannada)</option>
        </select>
      </div>

      {/* Recording State */}
      {!audioBlob ? (
        <div className="flex flex-col items-center justify-center py-4 gap-3">
          {isRecording ? (
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <button
                  type="button"
                  onClick={stopRecording}
                  className="relative w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition"
                >
                  <Square className="w-6 h-6 fill-white" />
                </button>
              </div>
              <div className="flex items-center gap-2 font-mono text-base font-bold text-rose-600 dark:text-rose-400">
                <span>{formatTimer(recordSeconds)}</span>
                <span className="text-xs text-slate-400">/ 1:00</span>
              </div>
              <span className="text-xs text-slate-500">{t('voice.tapToStop', 'Tap button to stop recording')}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startRecording}
                className="w-14 h-14 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white flex items-center justify-center shadow-md transition"
              >
                <Mic className="w-7 h-7" />
              </button>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('voice.tapToRecord', 'Tap microphone to speak (max 60s)')}
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Preview and Send State */
        <div className="flex flex-col gap-3 py-2">
          {previewUrl && (
            <audio
              ref={previewAudioRef}
              src={previewUrl}
              onEnded={() => setIsPlayingPreview(false)}
            />
          )}

          <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={togglePreviewPlay}
              className="w-10 h-10 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white flex items-center justify-center shadow transition"
            >
              {isPlayingPreview ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white ml-0.5" />
              )}
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t('voice.previewNote', 'Recorded voice note')}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {formatTimer(recordSeconds)} · {selectedLang.toUpperCase()}
              </span>
            </div>
            <button
              type="button"
              onClick={resetRecording}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Re-record"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">{t('voice.reRecord', 'Re-record')}</span>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 mt-1">
            {onCancel && (
              <button
                type="button"
                onClick={() => {
                  resetRecording();
                  onCancel();
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSend}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t('voice.sendAudio', 'Send Voice Note')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
