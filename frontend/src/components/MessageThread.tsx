import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, RefreshCw, AlertCircle, Sparkles, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { casesApi, type MessageItem } from '@/api/casesApi';
import { AudioPlayer } from '@/components/AudioPlayer';
import { VoiceRecorder } from '@/components/VoiceRecorder';

interface MessageThreadProps {
  caseId: string | number;
  className?: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  kn: 'Kannada',
};

export const MessageThread: React.FC<MessageThreadProps> = ({ caseId, className = '' }) => {
  const { t } = useTranslation();
  const { user, language: appLang } = useAppStore();

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [inputLang, setInputLang] = useState<string>(user?.language || appLang || 'en');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showOriginalMap, setShowOriginalMap] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<any>(null);

  const loadMessages = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await casesApi.getMessages(caseId);
      setMessages(data);
    } catch (err: any) {
      console.warn('Failed to load messages:', err);
      if (!quiet) setError(err.message || 'Failed to load conversation');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [caseId]);

  // Polling logic: if any message has transcript_status === 'pending', poll every 3 seconds
  useEffect(() => {
    const hasPending = messages.some((m) => m.transcript_status === 'pending');

    if (hasPending) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          loadMessages(true);
        }, 3000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      await casesApi.sendMessage(caseId, {
        text: trimmed,
        language: inputLang,
      });
      setInputText('');
      await loadMessages(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSendVoice = async (audioBlob: Blob, language: string) => {
    setSending(true);
    setError(null);
    setShowVoiceRecorder(false);
    try {
      await casesApi.sendMessage(caseId, {
        audio: audioBlob,
        language,
      });
      await loadMessages(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send voice note');
    } finally {
      setSending(false);
    }
  };

  const toggleOriginal = (msgId: number) => {
    setShowOriginalMap((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const getSenderRoleBadge = (role: string) => {
    if (role === 'agronomist') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
          Agronomist
        </span>
      );
    }
    if (role === 'admin') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
          Admin
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
        Farmer
      </span>
    );
  };

  return (
    <div className={`flex flex-col h-[520px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            {t('chat.title', 'Case Conversation & Voice Notes')}
          </h4>
        </div>
        <button
          type="button"
          onClick={() => loadMessages(false)}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Refresh messages"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">{t('common.loading', 'Loading messages...')}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center px-4">
            <span className="text-xs">No messages yet. Send a note or voice memo to start.</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = user?.id ? msg.sender_id === user.id : false;
            const showingOriginal = showOriginalMap[msg.id];
            const displayContent = showingOriginal ? msg.original_text : msg.text;
            const langName = LANGUAGE_NAMES[msg.original_lang] || msg.original_lang.toUpperCase();

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${
                  isMe ? 'ml-auto' : 'mr-auto'
                }`}
              >
                {/* Sender & timestamp header */}
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {msg.sender_name || (isMe ? 'You' : msg.sender_role)}
                  </span>
                  {getSenderRoleBadge(msg.sender_role)}
                  <span className="text-[10px] text-slate-400">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Bubble */}
                <div
                  className={`p-3 rounded-2xl shadow-sm text-xs leading-relaxed ${
                    isMe
                      ? 'bg-emerald-800 text-white rounded-tr-none'
                      : msg.kind === 'decision'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 rounded-tl-none'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-none border border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  {/* Decision note highlight */}
                  {msg.kind === 'decision' && (
                    <div className="flex items-center gap-1.5 mb-1.5 font-bold text-[11px] text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t('chat.expertDecisionNote', 'Agronomist Decision Note')}</span>
                    </div>
                  )}

                  {/* Audio player if audio note */}
                  {msg.audio_url && (
                    <div className="mb-2">
                      <AudioPlayer src={msg.audio_url} />
                    </div>
                  )}

                  {/* Pending transcription badge */}
                  {msg.transcript_status === 'pending' && (
                    <div className="flex items-center gap-2 py-1 px-2.5 rounded-lg bg-emerald-700/40 dark:bg-emerald-950/60 text-white text-[11px] animate-pulse my-1">
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Transcribing audio...</span>
                    </div>
                  )}

                  {/* Text content */}
                  {displayContent && (
                    <p className="whitespace-pre-wrap">{displayContent}</p>
                  )}

                  {/* Translation toggle */}
                  {msg.translated && (
                    <div className="mt-2 pt-1.5 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[10px]">
                      <span className="opacity-80 flex items-center gap-1">
                        <Languages className="w-3 h-3" />
                        <span>Translated from {langName}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleOriginal(msg.id)}
                        className="underline hover:opacity-100 font-medium ml-2"
                      >
                        {showingOriginal ? 'Show translated' : 'Show original'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error notification */}
      {error && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/60 text-xs text-rose-700 dark:text-rose-300 border-t border-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Voice Recorder Overlay or Drawer */}
      {showVoiceRecorder && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <VoiceRecorder
            defaultLang={inputLang}
            onSend={handleSendVoice}
            onCancel={() => setShowVoiceRecorder(false)}
          />
        </div>
      )}

      {/* Input box */}
      {!showVoiceRecorder && (
        <form
          onSubmit={handleSendText}
          className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
        >
          {/* Language selector */}
          <select
            value={inputLang}
            onChange={(e) => setInputLang(e.target.value)}
            className="text-[11px] font-medium px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-none text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            title="Message Language"
          >
            <option value="en">EN</option>
            <option value="hi">HI (हिंदी)</option>
            <option value="kn">KN (ಕನ್ನಡ)</option>
          </select>

          {/* Text input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t('chat.placeholder', 'Type a message in your language...')}
            disabled={sending}
            className="flex-1 text-xs px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 border border-transparent"
          />

          {/* Voice button */}
          <button
            type="button"
            onClick={() => setShowVoiceRecorder(true)}
            disabled={sending}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            title="Record Voice Note"
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Send text button */}
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="p-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white disabled:opacity-40 transition shadow-sm"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
};
