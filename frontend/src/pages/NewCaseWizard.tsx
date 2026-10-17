import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sprout,
  UploadCloud,
  FileText,
  Camera,
  Mic,
  Send,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Leaf,
  Globe,
  X,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { farmsApi } from '@/api/farmsApi';
import { casesApi } from '@/api/casesApi';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { type Farm } from '@/mocks/data';

export const NewCaseWizard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, language: appLang, currentFarm, setCurrentFarm } = useAppStore();

  // Farm Setup State (if farmer has no farm yet)
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [showFarmSetup, setShowFarmSetup] = useState(false);
  const [setupFarmName, setSetupFarmName] = useState('');
  const [setupTown, setSetupTown] = useState('');
  const [setupCrop, setSetupCrop] = useState('Corn');
  const [setupIsOrganic, setSetupIsOrganic] = useState(false);
  const [savingFarm, setSavingFarm] = useState(false);

  // New Case State
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<string>(user?.language || appLang || 'en');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [soilPdfFile, setSoilPdfFile] = useState<File | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceNotePreview, setVoiceNotePreview] = useState<string | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  // Form Submission
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Check existing farms on mount
  useEffect(() => {
    let active = true;

    async function checkFarms() {
      setLoadingFarms(true);
      try {
        const farmList = await farmsApi.getFarms();
        if (active) {
          setFarms(farmList);
          if (farmList.length === 0) {
            setShowFarmSetup(true);
          } else {
            setShowFarmSetup(false);
            if (!currentFarm || !farmList.find((f) => f.id === currentFarm.id)) {
              setCurrentFarm(farmList[0]);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load farms:', err);
      } finally {
        if (active) setLoadingFarms(false);
      }
    }

    checkFarms();

    return () => {
      active = false;
    };
  }, []);

  // Handle Quick Farm Setup
  const handleSaveFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupFarmName.trim() || !setupTown.trim()) {
      setErrorMessage(t('farmer.farmSetupError', 'Please provide farm name and town/village.'));
      return;
    }

    setSavingFarm(true);
    setErrorMessage(null);

    let lat = 42.0308;
    let lon = -93.6319;

    // Resolve lat/lng from free Open-Meteo Geocoding API
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          setupTown.trim()
        )}&count=1&language=en&format=json`
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
        }
      }
    } catch (geoErr) {
      console.warn('Geocoding fallback used:', geoErr);
    }

    try {
      const newFarm = await farmsApi.createFarm({
        name: setupFarmName.trim(),
        operator_name: user?.displayName || user?.username || 'Farmer',
        location: setupTown.trim(),
        total_acreage: 100,
        latitude: lat,
        longitude: lon,
        primary_crops: [setupCrop],
        is_organic: setupIsOrganic,
      });

      // Also create default field
      await farmsApi.createField(newFarm.id, {
        name: 'Main Field',
        acreage: 50,
        current_crop: setupCrop,
      });

      setFarms([newFarm]);
      setCurrentFarm(newFarm);
      setShowFarmSetup(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create farm profile.');
    } finally {
      setSavingFarm(false);
    }
  };

  // Image Upload handler
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const removeImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  // Soil PDF handler
  const handleSoilPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSoilPdfFile(file);
    }
  };

  // Voice note recorded
  const handleVoiceSend = (blob: Blob, voiceLang: string) => {
    setVoiceBlob(blob);
    setLanguage(voiceLang);
    const audioUrl = URL.createObjectURL(blob);
    setVoiceNotePreview(audioUrl);
    setIsVoiceActive(false);

    if (!description.trim()) {
      setDescription(t('farmer.voiceNoteAttached', '[Voice note attached. Farmer described crop symptoms via audio]'));
    }
  };

  // Submit Farmer Case
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const effectiveDesc = description.trim();
    if (effectiveDesc.length < 10 && !voiceBlob) {
      setErrorMessage(t('farmer.minDescLength', 'Please describe the problem in at least 10 characters or record a voice note.'));
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create case container
      const activeFarmId = currentFarm?.id || (farms[0]?.id ? String(farms[0].id) : '1');
      const activeFieldId = currentFarm?.fields?.[0]?.id || (farms[0]?.fields?.[0]?.id ? String(farms[0].fields[0].id) : '1');
      const activeCrop = currentFarm?.fields?.[0]?.currentCrop || 'Corn';

      const created = await casesApi.createCase({
        farmId: activeFarmId,
        fieldId: activeFieldId,
        crop: activeCrop,
        growthStage: 'Active Growth',
        notes: effectiveDesc || 'Field inspection request',
      });

      // 2. Submit farmer case (moves to PENDING_REVIEW and triggers assignment)
      await casesApi.submitFarmerCase(created.id, {
        description: effectiveDesc || 'Voice inquiry regarding crop health and damage.',
        language,
        image: imageFile,
        soilPdf: soilPdfFile,
      });

      // 3. If there was a voice note recorded, also upload as initial voice message
      if (voiceBlob) {
        try {
          await casesApi.sendMessage(created.id, {
            audio: voiceBlob,
            language,
          });
        } catch (voiceErr) {
          console.warn('Voice message attachment non-fatal error:', voiceErr);
        }
      }

      // Navigate straight to the case detail page
      navigate(`/cases/${created.id}`);
    } catch (err: any) {
      console.error('Case submission error:', err);
      setErrorMessage(err.message || 'Failed to submit case. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingFarms) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-500">Preparing inquiry form...</span>
      </div>
    );
  }

  // ==========================================
  // ONE-TIME QUICK FARM SETUP
  // ==========================================
  if (showFarmSetup) {
    return (
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mb-4 shadow">
            <Sprout className="w-6 h-6 text-emerald-300" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('farmer.quickSetupTitle', 'Quick Farm Profile Setup')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('farmer.quickSetupDesc', 'Set up your farm once so our agronomists can assess weather and local soil conditions.')}
          </p>

          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 border border-rose-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSaveFarm} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Farm Name *
              </label>
              <input
                type="text"
                value={setupFarmName}
                onChange={(e) => setSetupFarmName(e.target.value)}
                placeholder="e.g. Green Valley Farm"
                required
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Village or Town *
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={setupTown}
                  onChange={(e) => setSetupTown(e.target.value)}
                  placeholder="e.g. Mandya, Karnataka"
                  required
                  className="w-full text-xs pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Primary Crop
                </label>
                <select
                  value={setupCrop}
                  onChange={(e) => setSetupCrop(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="Corn">Corn / Maize</option>
                  <option value="Soybean">Soybean</option>
                  <option value="Wheat">Wheat</option>
                  <option value="Rice">Rice / Paddy</option>
                  <option value="Cotton">Cotton</option>
                  <option value="Tomato">Tomato</option>
                  <option value="Sugarcane">Sugarcane</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Organic Practice?
                </label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="organic"
                      checked={setupIsOrganic}
                      onChange={() => setSetupIsOrganic(true)}
                      className="accent-emerald-700"
                    />
                    <span>Yes</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="organic"
                      checked={!setupIsOrganic}
                      onChange={() => setSetupIsOrganic(false)}
                      className="accent-emerald-700"
                    />
                    <span>No</span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingFarm}
              className="w-full mt-4 py-3 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {savingFarm ? 'Saving Farm Profile...' : 'Save & Continue to Inquiry'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // ONE SIMPLE FARMER NEW CASE PAGE
  // ==========================================
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 pb-16 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {t('farmer.newCaseHeader', 'New Crop Inquiry')}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('farmer.newCaseSubtitle', 'Describe the problem in your own words. An expert agronomist will examine your crop.')}
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Problem Description (REQUIRED) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{t('farmer.describeProblem', 'Describe the problem in your own words')}</span>
              <span className="text-rose-500">*</span>
            </label>

            {/* Language Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border-none text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
              </select>
            </div>
          </div>

          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(
              'farmer.descPlaceholder',
              'Example: Leaves are turning yellow at the tips, lower foliage has brown spots, and growth seems stunted after recent rain.'
            )}
            className="w-full text-sm p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{description.trim().length} / min 10 characters</span>
            <button
              type="button"
              onClick={() => setIsVoiceActive(!isVoiceActive)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{isVoiceActive ? 'Close Voice Recorder' : 'Record voice note instead'}</span>
            </button>
          </div>

          {/* Voice Recorder Embedded */}
          {isVoiceActive && (
            <div className="mt-3">
              <VoiceRecorder
                defaultLang={language}
                onSend={handleVoiceSend}
                onCancel={() => setIsVoiceActive(false)}
              />
            </div>
          )}

          {voiceNotePreview && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  Voice Note Attached
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVoiceBlob(null);
                  setVoiceNotePreview(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Optional Photo Upload */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>{t('farmer.uploadPhoto', 'Crop Photo (Optional)')}</span>
            </label>
            <span className="text-[11px] text-slate-400">JPG, PNG</span>
          </div>

          {imagePreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 w-full max-h-60 bg-black flex items-center justify-center">
              <img src={imagePreview} alt="Crop sample" className="object-contain max-h-60 w-auto" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
              <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tap to upload crop leaf or field photo
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">Helps agronomist identify visual symptoms</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Optional Soil Report */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>{t('farmer.uploadSoilPdf', 'Soil Test Report (Optional)')}</span>
            </label>
            <span className="text-[11px] text-slate-400">PDF document</span>
          </div>

          {soilPdfFile ? (
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 truncate">
                  {soilPdfFile.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSoilPdfFile(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Attach soil lab PDF (if available)
              </span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleSoilPdfChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Large Prominent Submit Button */}
        <button
          type="submit"
          disabled={submitting || (description.trim().length < 10 && !voiceBlob)}
          className="w-full py-4 px-6 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-base shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 flex items-center justify-center gap-2.5"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Submitting to Agricultural Expert...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5 text-emerald-200" />
              <span>{t('farmer.submitCaseBtn', 'Submit Inquiry to Agronomist')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
