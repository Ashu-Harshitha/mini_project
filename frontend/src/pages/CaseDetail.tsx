import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Star,
  Send,
  Mic,
  MessageSquare,
  ShieldCheck,
  User,
  ExternalLink,
  ChevronRight,
  Info,
  Sparkles,
  Layers,
  Languages,
  Activity,
  Droplets,
  BookOpen,
  Download,
  ThumbsUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  X,
  Volume2,
  Sprout,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { casesApi } from '@/api/casesApi';
import { ragApi, type RagChunkDetail } from '@/api/ragApi';
import { alertsApi, type WeatherAlertItem } from '@/api/alertsApi';
import { StatusBadge } from '@/components/StatusBadge';
import { MessageThread } from '@/components/MessageThread';
import { AudioPlayer } from '@/components/AudioPlayer';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { AgronomistSensorPanel } from '@/components/AgronomistSensorPanel';
import { getIdToken } from '@/lib/firebase';
import { type CaseItem } from '@/mocks/data';


export const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, language: appLang } = useAppStore();

  const [caseItem, setCaseItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Translation toggle for agronomist view
  const [showOriginalDesc, setShowOriginalDesc] = useState(false);

  const [decisionType, setDecisionType] = useState<'approve' | 'approve_with_edits' | 'reject'>('approve');
  const [decisionNote, setDecisionNote] = useState('');
  const [finalSuggestion, setFinalSuggestion] = useState('');
  const [editedRecommendations, setEditedRecommendations] = useState<Array<{ id: number; action: string }>>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Citation Popover State for Agronomist Review
  const [selectedChunk, setSelectedChunk] = useState<RagChunkDetail | null>(null);
  const [loadingChunk, setLoadingChunk] = useState(false);

  const handleOpenCitation = async (chunkId: string) => {
    setLoadingChunk(true);
    try {
      const chunk = await ragApi.getChunk(chunkId);
      setSelectedChunk(chunk);
    } catch (e) {
      console.error('Error fetching citation chunk:', e);
    } finally {
      setLoadingChunk(false);
    }
  };

  // Farmer Feedback Form State
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackAudio, setFeedbackAudio] = useState<Blob | null>(null);
  const [showFeedbackVoice, setShowFeedbackVoice] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Farmer Outcome ("How did it go?") State
  const [outcomeVal, setOutcomeVal] = useState<'improved' | 'same' | 'worse' | null>(null);
  const [followedAdvice, setFollowedAdvice] = useState<boolean | null>(null);
  const [outcomeComment, setOutcomeComment] = useState('');
  const [submittingOutcome, setSubmittingOutcome] = useState(false);
  const [outcomeSubmitted, setOutcomeSubmitted] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  // Field sensor state for farmer view
  const [farmerSensors, setFarmerSensors] = useState<any>(null);
  const [farmAlerts, setFarmAlerts] = useState<WeatherAlertItem[]>([]);

  const role = user?.role || 'farmer';

  useEffect(() => {
    const farmId = caseItem?.farm_id || caseItem?.farmId || caseItem?.farm?.id;
    if (farmId) {
      alertsApi.getAlerts({ farm: Number(farmId), limit: 10 })
        .then((res) => setFarmAlerts(res.items))
        .catch((err) => console.warn('Failed to load farm alerts for case:', err));
    }
  }, [caseItem?.farm_id, caseItem?.farmId, caseItem?.farm?.id]);

  // Guidance Report State
  const [reportLang, setReportLang] = useState<'en' | 'hi' | 'kn'>(
    (user?.language as 'en' | 'hi' | 'kn') || (appLang as 'en' | 'hi' | 'kn') || 'en'
  );
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [downloadingFarmerPdf, setDownloadingFarmerPdf] = useState(false);
  const [downloadingExpertPdf, setDownloadingExpertPdf] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchReport = async (lang: 'en' | 'hi' | 'kn') => {
    if (!id) return;
    setLoadingReport(true);
    try {
      const data = await casesApi.getCaseReport(id, lang);
      setReportData(data);
    } catch (err) {
      console.error('Failed to load farmer guidance report:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (caseItem && id) {
      const s = (caseItem.rawStatus || caseItem.status || '').toUpperCase();
      const decided = ['APPROVED', 'APPROVED_WITH_EDITS', 'DELIVERED', 'RESOLVED', 'OUTCOME_REPORTED'].includes(s);
      if (decided) {
        fetchReport(reportLang);
      }
    }
  }, [id, caseItem?.status, caseItem?.rawStatus, reportLang]);

  const handleListenClick = async () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }

    setIsPlayingAudio(true);
    try {
      const token = await getIdToken();
      const audioUrl = casesApi.getCaseReportAudioUrl(id!, reportLang);
      const res = await fetch(audioUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 503 || !res.ok) {
        triggerBrowserSpeech();
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (!audioRef.current) {
        audioRef.current = new Audio(blobUrl);
      } else {
        audioRef.current.src = blobUrl;
      }

      audioRef.current.onended = () => {
        setIsPlayingAudio(false);
      };
      audioRef.current.onerror = () => {
        triggerBrowserSpeech();
      };

      await audioRef.current.play();
    } catch (e) {
      console.warn('Audio stream error, falling back to browser speech:', e);
      triggerBrowserSpeech();
    }
  };

  const triggerBrowserSpeech = () => {
    if (!('speechSynthesis' in window)) {
      alert(t('report.speechUnsupported', 'Browser speech synthesis is not supported.'));
      setIsPlayingAudio(false);
      return;
    }

    window.speechSynthesis.cancel();

    const body = reportData?.body_json;
    const what = body?.what_is_happening || caseItem?.farmer_summary || '';
    const steps = (body?.next_steps || []).map((s: any, idx: number) => `${idx + 1}. ${s.title}. ${s.detail}`).join('. ');
    const warnings = (body?.warnings || []).join('. ');
    const textToSpeak = `${what}. ${steps}. ${warnings}`.trim();

    const utterance = new SpeechSynthesisUtterance(textToSpeak || 'Guidance report');
    const langCodeMap: Record<string, string> = {
      en: 'en-IN',
      hi: 'hi-IN',
      kn: 'kn-IN',
    };
    utterance.lang = langCodeMap[reportLang] || 'en-IN';
    utterance.rate = 0.95;

    utterance.onend = () => {
      setIsPlayingAudio(false);
    };
    utterance.onerror = () => {
      setIsPlayingAudio(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlayingAudio(true);
  };

  const handleDownloadFarmerPdf = async () => {
    if (!id || downloadingFarmerPdf) return;
    setDownloadingFarmerPdf(true);
    try {
      await casesApi.downloadFarmerPdf(id, reportLang);
    } catch (e: any) {
      alert(e.message || 'Failed to download PDF report');
    } finally {
      setDownloadingFarmerPdf(false);
    }
  };

  const handleDownloadExpertPdf = async () => {
    if (!id || downloadingExpertPdf) return;
    setDownloadingExpertPdf(true);
    try {
      await casesApi.downloadExpertPdf(id);
    } catch (e: any) {
      alert(e.message || 'Failed to download expert PDF report');
    } finally {
      setDownloadingExpertPdf(false);
    }
  };

  const loadCase = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await casesApi.getCaseById(id);
      setCaseItem(data);

      // Fetch sensor telemetry for farmer if applicable
      if (role === 'farmer') {
        casesApi.getCaseSensors(id).then((res) => setFarmerSensors(res)).catch(() => {});
      }

      // Initialize recommendation edits if any
      if (data.rawRecommendations && Array.isArray(data.rawRecommendations)) {
        setEditedRecommendations(
          data.rawRecommendations.map((r: any, idx: number) => ({
            id: r.id || idx,
            action: r.action || r.title || (typeof r === 'string' ? r : ''),
          }))
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load case');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadCase();
  }, [id]);

  useEffect(() => {
    const rawStatus = (caseItem?.rawStatus || caseItem?.status || '').toUpperCase();
    if (rawStatus === 'ANALYZING') {
      const timer = setInterval(() => {
        loadCase();
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [id, caseItem?.status, caseItem?.rawStatus]);

  // Handle Review Submission (Agronomist)
  const handleSubmitReview = async () => {
    if (!id || submittingReview) return;

    if (decisionType === 'reject' && decisionNote.trim().length < 10) {
      alert(t('review.rejectNoteReq', 'Rejection explanation must be at least 10 characters long.'));
      return;
    }

    setSubmittingReview(true);
    try {
      await casesApi.submitReview(id, {
        decision: decisionType,
        note: decisionNote,
        edits:
          decisionType === 'approve_with_edits'
            ? {
                recommendations: editedRecommendations,
                final_suggestion: finalSuggestion,
              }
            : finalSuggestion
            ? { final_suggestion: finalSuggestion }
            : undefined,
      });
      setShowConfirmModal(false);
      await loadCase();
    } catch (err: any) {
      alert(err.message || 'Failed to submit review decision');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Handle Farmer Feedback Submission
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || submittingFeedback) return;

    setSubmittingFeedback(true);
    try {
      await casesApi.submitFeedback(id, {
        rating: feedbackRating,
        comment: feedbackComment,
        language: user?.language || appLang || 'en',
        audio: feedbackAudio || undefined,
      });
      setFeedbackSubmitted(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Handle Farmer Outcome Submission ("How did it go?")
  const handleOutcomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || submittingOutcome || outcomeVal === null || followedAdvice === null) return;

    setSubmittingOutcome(true);
    setOutcomeError(null);
    try {
      await casesApi.submitCaseOutcome(id, {
        followed_advice: followedAdvice,
        outcome: outcomeVal,
        comment: outcomeComment || undefined,
      });
      setOutcomeSubmitted(true);
      await loadCase();
    } catch (err: any) {
      setOutcomeError(err.message || 'Failed to submit outcome');
    } finally {
      setSubmittingOutcome(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-500">Loading case file...</span>
      </div>
    );
  }

  if (error || !caseItem) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Case Unavailable</h3>
        <p className="text-xs text-slate-500 mt-1">{error || 'This case could not be retrieved.'}</p>
        <button
          type="button"
          onClick={() => navigate('/cases')}
          className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold hover:bg-slate-200"
        >
          Back to Cases
        </button>
      </div>
    );
  }

  const rawStatus = (caseItem.rawStatus || caseItem.status || '').toUpperCase();
  const isDecided = ['APPROVED', 'APPROVED_WITH_EDITS', 'DELIVERED', 'RESOLVED', 'REJECTED', 'OUTCOME_REPORTED'].includes(
    rawStatus
  );
  const isRejected = rawStatus === 'REJECTED';

  // ==========================================
  // FARMER EXPERIENCE
  // ==========================================
  if (role === 'farmer') {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        {/* Navigation & Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/cases')}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {caseItem.crop} Inquiry
              </h1>
              <span className="text-xs font-mono font-bold text-slate-400">
                {caseItem.caseNumber}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Submitted on {new Date(caseItem.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Analyzing Banner */}
        {rawStatus === 'ANALYZING' && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-3 shadow-sm">
            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="font-semibold text-sm">We are analysing your case...</span>
          </div>
        )}

        {/* 3-Step Status Timeline */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="grid grid-cols-3 gap-2 text-center relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xs font-bold shadow">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-1.5">
                1. Submitted
              </span>
              <span className="text-[10px] text-slate-400">Inquiry received</span>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow ${
                  isDecided
                    ? 'bg-emerald-800 text-white'
                    : 'bg-indigo-600 text-white animate-pulse'
                }`}
              >
                {isDecided ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-1.5">
                2. With Expert
              </span>
              <span className="text-[10px] text-slate-400">
                {caseItem.assignedAgronomist || caseItem.assigned_agronomist_name || 'Agronomist review'}
              </span>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow ${
                  isDecided
                    ? isRejected
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-800 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                }`}
              >
                {isDecided ? (
                  isRejected ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )
                ) : (
                  <span>3</span>
                )}
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-1.5">
                3. Expert Decision
              </span>
              <span className="text-[10px] text-slate-400">
                {isDecided ? (isRejected ? 'Rejected' : 'Guidance Ready') : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Farmer's Own Description Card */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Your Problem Description
          </span>
          <p className="mt-2 text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {caseItem.description || caseItem.summary || caseItem.issue}
          </p>
        </div>

        {/* Farmer Sensor Telemetry Card */}
        {farmerSensors && farmerSensors.items && farmerSensors.items.length > 0 && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Field Sensor Telemetry
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Simulated data
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {farmerSensors.items.map((item: any, idx: number) => (
                <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{t(item.label_key as any, { defaultValue: item.key.replace('_', ' ') }) as string}</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{item.status}</span>
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                    {item.value || '--'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BEFORE DECISION: Holding State */}

        {!isDecided && (
          <div className="p-8 rounded-3xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/60 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
              <Clock className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-base font-bold text-indigo-950 dark:text-indigo-200">
              An expert is reviewing your case
            </h3>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-300 max-w-md mx-auto leading-relaxed">
              {caseItem.assignedAgronomist || caseItem.assigned_agronomist_name ? (
                <>
                  Assigned agronomist{' '}
                  <strong className="font-semibold text-indigo-950 dark:text-indigo-100">
                    {caseItem.assignedAgronomist || caseItem.assigned_agronomist_name}
                  </strong>{' '}
                  is verifying field symptoms, weather and soil data. You will be notified as soon as decision is posted.
                </>
              ) : (
                'Your case is assigned to our agronomy review team. A specialist will examine it shortly.'
              )}
            </p>
          </div>
        )}

        {/* AFTER DECISION: Guidance and Plain Recommendations */}
        {isDecided && (
          <div className="space-y-5">
            {isRejected ? (
              /* Rejection Explanation */
              <div className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 shadow-sm space-y-2">
                <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-sm">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  <span>Case Cannot Be Approved</span>
                </div>
                <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                  {caseItem.decision_note || caseItem.agronomistReview?.notes || 'Inconclusive symptoms or invalid protocol.'}
                </p>
                {caseItem.final_suggestion && (
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-900/60 shadow-xs space-y-1 mt-2">
                    <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
                      Agronomist Alternative Suggestion
                    </span>
                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                      {caseItem.final_suggestion}
                    </p>
                  </div>
                )}
                <div className="text-[11px] text-rose-700/80 mt-2">
                  Verified by: {caseItem.assignedAgronomist || caseItem.assigned_agronomist_name || 'Extension Agronomist'}
                </div>
              </div>
            ) : (
              /* Approved Advice - Large Text Guidance Card */
              <div className="p-6 md:p-8 rounded-3xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-6">
                {/* Header with Badges & Language Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-emerald-200/60 dark:border-emerald-800/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-800 text-white shadow-sm">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('report.verifiedExpertAdvice', 'Verified Expert Advice')}
                    </span>
                    {reportData?.machine_translated && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                        <Languages className="w-3 h-3" />
                        {t('report.machineTranslated', 'Machine-translated advice')}
                      </span>
                    )}
                  </div>

                  {/* en / hi / kn Language Selector */}
                  <div className="flex items-center bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 rounded-2xl p-1 shadow-xs">
                    {(['en', 'hi', 'kn'] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setReportLang(l)}
                        className={`px-3 py-1 text-xs font-bold rounded-xl transition ${
                          reportLang === l
                            ? 'bg-emerald-800 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-400'
                        }`}
                      >
                        {l === 'en' ? 'English' : l === 'hi' ? 'हिन्दी' : 'ಕನ್ನಡ'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* What is happening (Large Text) */}
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-emerald-950 dark:text-emerald-100 tracking-tight leading-snug">
                    {reportData?.body_json?.what_is_happening || caseItem.farmer_summary || t('report.title', 'Action Plan for Your Field')}
                  </h3>
                </div>

                {/* Numbered Next Steps */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                    {t('report.recommendedActions', 'Recommended Next Steps')}
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {reportData?.body_json?.next_steps && reportData.body_json.next_steps.length > 0 ? (
                      reportData.body_json.next_steps.map((step: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 shadow-xs"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center font-black text-sm flex-shrink-0 mt-0.5 shadow-sm">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <h5 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                              {step.title}
                            </h5>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      Array.isArray(caseItem.recommendations) &&
                      caseItem.recommendations.map((rec: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-800"
                        >
                          <div className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {idx + 1}
                          </div>
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            {typeof rec === 'string' ? rec : rec.title || rec.action}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Warnings Box */}
                {reportData?.body_json?.warnings && reportData.body_json.warnings.length > 0 && (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>{t('report.warnings', 'Safety & Risk Precautions')}</span>
                    </div>
                    <ul className="space-y-1.5 pl-5 list-disc text-xs text-amber-950 dark:text-amber-100 leading-relaxed font-medium">
                      {reportData.body_json.warnings.map((w: string, idx: number) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Final Suggestion if present */}
                {(caseItem.final_suggestion || caseItem.decision_note) && (
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                    <strong className="block font-bold text-emerald-800 dark:text-emerald-400 mb-1">
                      Agronomist Note:
                    </strong>
                    <span>{caseItem.final_suggestion || caseItem.decision_note}</span>
                  </div>
                )}

                {/* Verification Footer & Action Buttons (Big Listen Button + Download PDF) */}
                <div className="pt-4 border-t border-emerald-200/60 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-xs text-emerald-900 dark:text-emerald-300 font-medium">
                    {t('report.verifiedBy', 'Verified by')}:{' '}
                    <strong className="font-bold text-emerald-950 dark:text-white">
                      {reportData?.body_json?.reviewed_by || caseItem.assignedAgronomist || caseItem.assigned_agronomist_name || 'Certified Agronomist'}
                    </strong>
                    {reportData?.body_json?.reviewed_at && (
                      <span className="text-slate-500 dark:text-slate-400 ml-2">
                        &middot; {reportData.body_json.reviewed_at.slice(0, 10)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Big "Listen" Button */}
                    <button
                      type="button"
                      onClick={handleListenClick}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md transition hover:scale-105 active:scale-95"
                    >
                      <Volume2 className={`w-4 h-4 ${isPlayingAudio ? 'animate-pulse text-amber-300' : ''}`} />
                      <span>{isPlayingAudio ? t('report.stop', 'Stop') : t('report.listen', 'Listen')}</span>
                    </button>

                    {/* "Download PDF" Button */}
                    <button
                      type="button"
                      onClick={handleDownloadFarmerPdf}
                      disabled={downloadingFarmerPdf}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs shadow-xs transition"
                    >
                      <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      <span>
                        {downloadingFarmerPdf ? t('report.downloadingPdf', 'Downloading...') : t('report.downloadPdf', 'Download PDF')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* "How did it go?" Follow-up Outcome Card */}
            <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <Sprout className="w-6 h-6 text-emerald-600" />
                  <span>{t('outcome.title', 'How did it go?')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('outcome.subtitle', 'Let your agronomist know how your crop responded to the advice.')}
                </p>
              </div>

              {caseItem.outcome_feedback?.outcome || outcomeSubmitted ? (
                <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>{t('outcome.recordedTitle', 'Outcome recorded')}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 font-medium">
                    {t('outcome.condition', 'Condition')}: <strong className="capitalize text-emerald-900 dark:text-emerald-200">{caseItem.outcome_feedback?.outcome || outcomeVal}</strong>
                    {' · '}
                    {t('outcome.followedAdvice', 'Followed advice')}: <strong>{(caseItem.outcome_feedback?.followed_advice ?? followedAdvice) ? t('outcome.yes', 'Yes') : t('outcome.no', 'No')}</strong>
                  </p>
                  {(caseItem.outcome_feedback?.outcome_comment || outcomeComment) && (
                    <p className="text-slate-600 dark:text-slate-400 italic">
                      "{caseItem.outcome_feedback?.outcome_comment || outcomeComment}"
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleOutcomeSubmit} className="space-y-6">
                  {outcomeError && (
                    <div className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs font-medium">
                      {outcomeError}
                    </div>
                  )}

                  {/* Question 1: Did you follow the advice? */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                      {t('outcome.didYouFollowAdvice', 'Did you follow the advice?')}
                    </label>
                    <div className="grid grid-cols-2 gap-3 max-w-sm">
                      <button
                        type="button"
                        onClick={() => setFollowedAdvice(true)}
                        className={`py-3 px-4 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition ${
                          followedAdvice === true
                            ? 'bg-emerald-800 text-white border-emerald-800 shadow-md scale-[1.02]'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>{t('outcome.yes', 'Yes')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFollowedAdvice(false)}
                        className={`py-3 px-4 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition ${
                          followedAdvice === false
                            ? 'bg-slate-800 text-white border-slate-800 shadow-md scale-[1.02]'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <X className="w-4 h-4" />
                        <span>{t('outcome.no', 'No')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Question 2: Crop Outcome (3 Big Buttons: Improved / Same / Worse) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                      {t('outcome.cropResult', 'How is your crop doing?')}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Improved */}
                      <button
                        type="button"
                        onClick={() => setOutcomeVal('improved')}
                        className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-2 ${
                          outcomeVal === 'improved'
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-lg scale-105'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <TrendingUp className="w-6 h-6" />
                        <span className="font-black text-sm">{t('outcome.improved', 'Improved')}</span>
                        <span className="text-[11px] opacity-80">{t('outcome.improvedDesc', 'Signs of recovery & healthy growth')}</span>
                      </button>

                      {/* Same */}
                      <button
                        type="button"
                        onClick={() => setOutcomeVal('same')}
                        className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-2 ${
                          outcomeVal === 'same'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-lg scale-105'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-amber-500 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <Minus className="w-6 h-6" />
                        <span className="font-black text-sm">{t('outcome.same', 'Same')}</span>
                        <span className="text-[11px] opacity-80">{t('outcome.sameDesc', 'No noticeable change yet')}</span>
                      </button>

                      {/* Worse */}
                      <button
                        type="button"
                        onClick={() => setOutcomeVal('worse')}
                        className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-2 ${
                          outcomeVal === 'worse'
                            ? 'bg-rose-700 text-white border-rose-700 shadow-lg scale-105'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-rose-500 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <TrendingDown className="w-6 h-6" />
                        <span className="font-black text-sm">{t('outcome.worse', 'Worse')}</span>
                        <span className="text-[11px] opacity-80">{t('outcome.worseDesc', 'Symptoms spread or intensified')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Comment */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                      {t('outcome.commentLabel', 'Comments / Observations (Optional)')}
                    </label>
                    <textarea
                      rows={2}
                      value={outcomeComment}
                      onChange={(e) => setOutcomeComment(e.target.value)}
                      placeholder={t('outcome.commentPlaceholder', 'e.g. Applied fertilizer 3 days ago, leaves greener now...')}
                      className="w-full text-xs p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700 resize-none"
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={submittingOutcome || outcomeVal === null || followedAdvice === null}
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-black text-xs shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submittingOutcome ? t('outcome.submitting', 'Submitting...') : t('outcome.submitBtn', 'Submit Field Outcome')}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Farmer Outcome Feedback Form */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  How helpful was this advice?
                </h3>
              </div>

              {feedbackSubmitted ? (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Thank you! Your feedback has been sent to the agronomist.</span>
                </div>
              ) : (
                <form onSubmit={handleFeedbackSubmit} className="space-y-3">
                  {/* Rating 1-5 Stars */}
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setFeedbackRating(star)}
                        className="p-1 text-amber-400 hover:scale-110 transition"
                      >
                        <Star
                          className={`w-7 h-7 ${
                            star <= feedbackRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-2">
                      {feedbackRating} / 5 Stars
                    </span>
                  </div>

                  {/* Comment */}
                  <textarea
                    rows={2}
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Tell us how your crop responded (optional)..."
                    className="w-full text-xs p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700 resize-none"
                  />

                  {/* Voice Feedback Option */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowFeedbackVoice(!showFeedbackVoice)}
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:underline"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{showFeedbackVoice ? 'Cancel Voice' : 'Add Voice Comment'}</span>
                    </button>

                    <button
                      type="submit"
                      disabled={submittingFeedback}
                      className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow transition disabled:opacity-50"
                    >
                      {submittingFeedback ? 'Submitting...' : 'Send Feedback'}
                    </button>
                  </div>

                  {showFeedbackVoice && (
                    <div className="mt-2">
                      <VoiceRecorder
                        onSend={(blob) => {
                          setFeedbackAudio(blob);
                          setShowFeedbackVoice(false);
                        }}
                      />
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        )}

        {/* Message Thread Component */}
        <MessageThread caseId={caseItem.id} />
      </div>
    );
  }

  // ==========================================
  // AGRONOMIST & ADMIN EXPERIENCE
  // ==========================================
  const isAssignedToMe = !caseItem.assigned_agronomist_id || caseItem.assigned_agronomist_id === user?.id || role === 'admin';
  const canReview = role === 'agronomist' && rawStatus === 'PENDING_REVIEW';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                Case {caseItem.caseNumber}
              </h1>
              <StatusBadge status={caseItem.rawStatus || caseItem.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {caseItem.crop} · Operator: {caseItem.operator} · Assigned: {caseItem.assignedAgronomist || caseItem.assigned_agronomist_name || 'Unassigned'}
            </p>
          </div>
        </div>

        {/* Download Expert PDF Button */}
        {(role === 'agronomist' || role === 'admin') && (
          <button
            type="button"
            onClick={handleDownloadExpertPdf}
            disabled={downloadingExpertPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-bold text-xs shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>
              {downloadingExpertPdf ? t('report.downloadingPdf', 'Downloading...') : t('report.downloadExpertPdf', 'Download Expert PDF')}
            </span>
          </button>
        )}
      </div>

      {/* AI Unavailable Banner */}
      {caseItem.ai_degraded && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 flex items-center gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <div className="font-bold text-sm">AI unavailable</div>
            <div className="text-xs text-amber-700 dark:text-amber-300">
              Automated AI diagnostic pipeline was degraded or unavailable. Manual expert evaluation required.
            </div>
          </div>
        </div>
      )}

      {/* Farm Weather & Sensor Alerts Banner */}
      {farmAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                {t('caseDetail.activeFarmAlerts', 'Active Alerts for this Farm')} ({farmAlerts.length})
              </span>
            </div>
            <Link
              to={`/alerts?farm=${caseItem.farm_id || caseItem.farmId}`}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {t('common.viewAll', 'View All')} →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {farmAlerts.slice(0, 4).map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  alert.severity === 'high'
                    ? 'bg-rose-50/80 dark:bg-rose-950/50 border-rose-200 text-rose-900 dark:text-rose-200'
                    : 'bg-white/80 dark:bg-slate-800/80 border-amber-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${alert.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold">{alert.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${alert.severity === 'high' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90">{alert.message}</p>
                  <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    ⚡ {alert.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Diagnostics, Observations, Recommendations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Farmer Description with translation toggle */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Farmer Symptom Description
              </span>
              {caseItem.description_lang && caseItem.description_lang !== (user?.language || 'en') && (
                <button
                  type="button"
                  onClick={() => setShowOriginalDesc(!showOriginalDesc)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>{showOriginalDesc ? 'Show translated' : `Show original (${caseItem.description_lang.toUpperCase()})`}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
              {showOriginalDesc
                ? caseItem.description || caseItem.issue
                : caseItem.summary || caseItem.description || caseItem.issue}
            </p>

            {caseItem.audioUrl && (
              <div className="mt-2">
                <AudioPlayer src={caseItem.audioUrl} title="Farmer voice inquiry" />
              </div>
            )}
          </div>

          {/* AI Analysis & Observations */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Diagnostic Observations & Visual Symptoms
            </h3>
            <div className="space-y-2">
              {caseItem.observations &&
                caseItem.observations.map((obs: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {obs.description}
                      </span>
                      {obs.note && <p className="text-[11px] text-slate-400 mt-0.5">{obs.note}</p>}
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {obs.confidence}%
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Field Sensors Telemetry Panel for Agronomist & Admin */}
          <AgronomistSensorPanel
            caseId={caseItem.id}
            fieldId={caseItem.field_id || caseItem.fieldId || caseItem.farm?.fields?.[0]?.id}
          />

          {/* Ranked Recommendations with Citations & Confidence */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">

            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Synthesized Recommendations & Extension Citations
            </h3>
            <div className="space-y-3">
              {caseItem.recommendations &&
                caseItem.recommendations.map((rec: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {idx + 1}. {rec.title}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {rec.confidence}% Conf.
                      </span>
                    </div>
                    {/* Extension Citation Chips with Popover */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {rec.chunk_ids && rec.chunk_ids.length > 0 ? (
                        rec.chunk_ids.map((cid: string, cIdx: number) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => handleOpenCitation(cid)}
                            disabled={loadingChunk}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:text-emerald-300 transition shadow-xs cursor-pointer"
                            title="Inspect grounded extension citation chunk"
                          >
                            <BookOpen className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                            <span>{rec.citation || `[Citation ${cid.slice(0, 8)}]`}</span>
                          </button>
                        ))
                      ) : rec.citation ? (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                          Citation: {rec.citation}
                        </span>
                      ) : rec.evidence ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                          Citation: {rec.evidence}
                        </p>
                      ) : null}
                    </div>
                    {rec.assumptions && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Rationale: {rec.assumptions}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* AGRONOMIST DECISION PANEL (if reviewable) */}
          {canReview && (
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-700 shadow-lg space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Expert Review Decision
                </h3>
              </div>

              {/* 3 Decision Choices */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionType('approve')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                    decisionType === 'approve'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionType('approve_with_edits')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                    decisionType === 'approve_with_edits'
                      ? 'bg-amber-600 text-white border-amber-600 shadow'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Approve with Edits
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionType('reject')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                    decisionType === 'reject'
                      ? 'bg-rose-600 text-white border-rose-600 shadow'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Reject
                </button>
              </div>

              {/* Edits Form */}
              {decisionType === 'approve_with_edits' && (
                <div className="space-y-3 pt-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Edit Recommendations
                  </span>
                  {editedRecommendations.map((recEdit, idx) => (
                    <div key={recEdit.id || idx}>
                      <label className="text-[11px] font-medium text-slate-500">
                        Action #{idx + 1}
                      </label>
                      <input
                        type="text"
                        value={recEdit.action}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditedRecommendations((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, action: val } : r))
                          );
                        }}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="text-[11px] font-medium text-slate-500">
                      Final Agronomic Suggestion
                    </label>
                    <input
                      type="text"
                      value={finalSuggestion}
                      onChange={(e) => setFinalSuggestion(e.target.value)}
                      placeholder="e.g. Ensure spray rig is cleaned; apply during morning hours"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Decision Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {decisionType === 'reject'
                    ? 'Rejection Explanation * (min 10 chars, translated for farmer)'
                    : 'Decision Note / Guidance'}
                </label>
                <textarea
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder={
                    decisionType === 'reject'
                      ? 'Explain why automated advice is rejected (e.g. fertilizer burn mistaken for leaf blight)...'
                      : 'Add verification notes or instructions...'
                  }
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
                />
              </div>

              {/* Agronomist own suggestion if rejecting */}
              {decisionType === 'reject' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Your Own Alternative Suggestion for the Farmer *
                  </label>
                  <textarea
                    rows={2}
                    value={finalSuggestion}
                    onChange={(e) => setFinalSuggestion(e.target.value)}
                    placeholder="Enter your expert advice (e.g. Flush soil with fresh irrigation; hold off on fungicide application)..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={decisionType === 'reject' && decisionNote.trim().length < 10}
                className="w-full py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow transition disabled:opacity-40"
              >
                {decisionType === 'reject' ? 'Reject & Give Your Suggestion' : decisionType === 'approve_with_edits' ? 'Approve with Edits' : 'Approve Recommendations'}
              </button>
            </div>
          )}

          {/* Confirm Dialog Modal */}
          {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="max-w-md w-full p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirm Decision: {decisionType.toUpperCase()}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to finalize this review? A plain-language summary will be generated and sent directly to the farmer.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitReview}
                    disabled={submittingReview}
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow"
                  >
                    {submittingReview ? 'Submitting...' : 'Confirm & Finalize'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Soil, Weather, Conversation */}
        <div className="space-y-6">
          {/* Soil & Weather mini cards */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 text-xs">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Environmental Conditions
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span className="text-[10px] text-slate-400">Soil pH</span>
                <div className="font-bold text-slate-800 dark:text-slate-200">{caseItem.soil?.ph?.value || '6.4'}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span className="text-[10px] text-slate-400">Nitrogen</span>
                <div className="font-bold text-slate-800 dark:text-slate-200">{caseItem.soil?.nitrogen?.value || '18 ppm'}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span className="text-[10px] text-slate-400">Max Temp</span>
                <div className="font-bold text-slate-800 dark:text-slate-200">{caseItem.weather?.tempMaxC ?? 28}°C</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span className="text-[10px] text-slate-400">7-Day Rain</span>
                <div className="font-bold text-slate-800 dark:text-slate-200">{caseItem.weather?.rainfall7dMm ?? 14} mm</div>
              </div>
            </div>
          </div>

          {/* Conversation Thread */}
          <MessageThread caseId={caseItem.id} />
        </div>
      </div>

      {/* Citation Detail Popover / Modal */}
      {selectedChunk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  {selectedChunk.source_type || 'Extension Document'}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                  {selectedChunk.title}
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                  {selectedChunk.citation || selectedChunk.source} {selectedChunk.page ? `• Page ${selectedChunk.page}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedChunk(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 border-y border-slate-100 dark:border-slate-800 py-2.5">
              {selectedChunk.authors && <div><span className="font-semibold text-slate-700 dark:text-slate-300">Authors:</span> {selectedChunk.authors}</div>}
              {selectedChunk.year && <div><span className="font-semibold text-slate-700 dark:text-slate-300">Year:</span> {selectedChunk.year}</div>}
              {selectedChunk.publisher && <div><span className="font-semibold text-slate-700 dark:text-slate-300">Publisher:</span> {selectedChunk.publisher}</div>}
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Retrieved Extension Knowledge Chunk
              </span>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                {selectedChunk.text}
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedChunk(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
