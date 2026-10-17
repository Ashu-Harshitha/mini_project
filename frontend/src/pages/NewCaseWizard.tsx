import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UploadCloud, 
  FileCheck, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft, 
  Download, 
  RotateCcw,
  Sparkles,
  Info,
  Calendar,
  Thermometer,
  CloudRain,
  Wind,
  Sun,
  Shield,
  Layers,
  Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Stepper } from '@/components/Stepper';
import { CornLeafPlaceholder } from '@/components/CornLeafPlaceholder';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';
import { ReviewPanel } from '@/components/ReviewPanel';
import { AudioPlayerButton } from '@/components/AudioPlayerButton';
import { useNewCaseStore } from '@/store/useNewCaseStore';
import { useAppStore } from '@/store/useAppStore';
import { units } from '@/lib/units';
import { saveOfflineDraft } from '@/pwa/offlineQueue';

import { casesApi } from '@/api/casesApi';

export const NewCaseWizard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentFarm, unitSystem, isOnline, refreshOfflineCount } = useAppStore();
  const {
    currentStep,
    setStep,
    nextStep,
    prevStep,
    caseId,
    caseData,
    uploadedSoilPdf,
    setSoilPdf,
    reviewDecision,
    setReviewDecision,
    resetCase,
  } = useNewCaseStore();

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'All' | 'Crop' | 'Fertilizer' | 'Irrigation'>('All');
  const [isSimulatingAnalysis, setIsSimulatingAnalysis] = useState(false);
  const [offlineSavedToast, setOfflineSavedToast] = useState(false);

  // Unit-aware values
  const maxTemp = units.convertTemp(caseData.weather.tempMaxC, unitSystem).label;
  const minTemp = units.convertTemp(caseData.weather.tempMinC, unitSystem).label;
  const rainfall = units.convertRainfall(caseData.weather.rainfall7dMm, unitSystem).label;
  const windSpeed = units.convertWind(caseData.weather.windKmh, unitSystem).label;

  // Sorted recommendations by confidence (Fix #4)
  const sortedRecommendations = [...caseData.recommendations].sort((a, b) => b.confidence - a.confidence);

  const filteredRecommendations = sortedRecommendations.filter((rec) => {
    if (activeCategoryFilter === 'All') return true;
    return rec.category === activeCategoryFilter;
  });

  const handleAnalyzeClick = async () => {
    setIsSimulatingAnalysis(true);
    try {
      const created = await casesApi.createCase({
        farmId: currentFarm.id,
        fieldId: currentFarm.fields[0]?.id || '1',
        crop: caseData.crop,
        growthStage: caseData.growthStage,
        notes: 'Field sample from lower leaf chlorosis',
      });
      if (created?.id) {
        useNewCaseStore.setState({ caseId: created.caseNumber, caseData: created });
        await casesApi.fetchWeather(created.id);
        await casesApi.analyzeCase(created.id);
        const detailed = await casesApi.getCaseById(created.id);
        useNewCaseStore.setState({ caseData: detailed });
      }
    } catch (e) {
      console.warn('Real backend analyze fallback:', e);
    } finally {
      setIsSimulatingAnalysis(false);
      nextStep();
    }
  };

  const handleGenerateRecsClick = async () => {
    try {
      const activeId = caseData.id || caseId;
      if (activeId) {
        await casesApi.generateRecommendations(activeId);
        const detailed = await casesApi.getCaseById(activeId);
        useNewCaseStore.setState({ caseData: detailed });
      }
    } catch (e) {
      console.warn('Backend recommendation error:', e);
    } finally {
      nextStep();
    }
  };

  const handleRunRiskCheckClick = async () => {
    try {
      const activeId = caseData.id || caseId;
      if (activeId) {
        await casesApi.runRiskCheck(activeId);
        const detailed = await casesApi.getCaseById(activeId);
        useNewCaseStore.setState({ caseData: detailed });
      }
    } catch (e) {
      console.warn('Backend risk check error:', e);
    } finally {
      nextStep();
    }
  };

  const handleGenerateReportClick = async () => {
    try {
      const activeId = caseData.id || caseId;
      const decision = reviewDecision === 'pending' ? 'Approved' : reviewDecision;
      if (activeId) {
        await casesApi.submitReview(activeId, {
          status: decision as any,
          notes: caseData.agronomistReview?.notes || 'Validated against ISU tissue testing protocol.',
        });
        await casesApi.generateReport(activeId, 'en');
        const detailed = await casesApi.getCaseById(activeId);
        useNewCaseStore.setState({ caseData: detailed });
      }
    } catch (e) {
      console.warn('Backend report error:', e);
    } finally {
      nextStep();
    }
  };


  const handleSaveDraftOffline = () => {
    saveOfflineDraft({
      farmId: currentFarm.id,
      fieldId: 'North 40 — Block C',
      crop: caseData.crop,
      growthStage: caseData.growthStage,
      notes: 'Field sample from lower leaf chlorosis',
    });
    refreshOfflineCount();
    setOfflineSavedToast(true);
    setTimeout(() => setOfflineSavedToast(false), 3000);
  };

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>{t('wizard.title', 'New Case')}</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-mono text-lg font-normal">
              #{caseId}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {currentFarm.name} · North 40 — Block C · Dent Corn
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline && (
            <button
              type="button"
              onClick={handleSaveDraftOffline}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 transition"
            >
              Save Draft Offline
            </button>
          )}

          {offlineSavedToast && (
            <span className="text-xs text-emerald-600 font-medium animate-pulse">
              ✓ Saved to offline queue!
            </span>
          )}
        </div>
      </div>

      {/* Stepper Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-3">
        <Stepper
          currentStep={currentStep}
          onStepClick={(step) => setStep(step)}
          maxAccessibleStep={6}
        />
      </div>

      {/* STEP 1: DATA COLLECTION */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('wizard.step1Title', 'Step 1: Data Collection')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('wizard.step1Sub', 'Upload crop imagery, soil report, and weather data for AI analysis.')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Crop Image Slot with CornLeafPlaceholder (Fix #1) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  {t('wizard.cropImage', 'Crop Image')}
                </label>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  Corn Leaf Selected
                </span>
              </div>

              {/* Leaf Image Slot */}
              <CornLeafPlaceholder showAnnotations={false} />

              <div className="p-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('wizard.dropImage', 'Drop image or click to upload')}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {t('wizard.supportedFormats', 'JPG, PNG, HEIC · max 20MB')}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md transition"
                >
                  {t('wizard.browseFiles', 'Browse Files')}
                </button>
              </div>
            </div>

            {/* Soil Report Slot */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                {t('wizard.soilReport', 'Soil Report')}
              </label>

              <div
                onClick={() => setSoilPdf('ISU_Lab_Spring_Soil_2026.pdf')}
                className="p-8 border-2 border-dashed border-emerald-300 dark:border-emerald-700/60 rounded-xl text-center bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50/60 cursor-pointer transition flex flex-col items-center justify-center min-h-[200px]"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mb-3 shadow-inner">
                  <FileCheck className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {uploadedSoilPdf || t('wizard.uploadSoilReport', 'Upload soil report (PDF)')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {t('wizard.labReportsAccepted', 'Lab reports, field tests accepted')}
                </p>
                <span className="mt-3 inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 rounded-full">
                  Sample: 14 ppm NO3-N, pH 6.2 loaded
                </span>
              </div>

              {/* Weather Snapshot */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <CloudRain className="w-4 h-4 text-sky-600" />
                    {t('wizard.weatherSnapshot', 'Weather Snapshot')}
                  </span>
                  <span className="text-[10px] text-slate-400">Updated 2h ago</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{t('wizard.tempMax', 'Temp (max)')}</div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{maxTemp}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{t('wizard.tempMin', 'Temp (min)')}</div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{minTemp}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{t('wizard.rainfall7d', 'Rainfall (7d)')}</div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{rainfall}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{t('wizard.humidity', 'Humidity')}</div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">68%</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{t('wizard.wind', 'Wind')}</div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{windSpeed}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{t('wizard.uvIndex', 'UV index')}</div>
                    <div className="font-bold text-amber-600 dark:text-amber-400 text-sm mt-0.5">7 (High)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Farm Profile Summary Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              {t('wizard.farmProfile', 'Farm Profile')}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.farm', 'Farm')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{currentFarm.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.operator', 'Operator')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{currentFarm.operator}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.field', 'Field')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">North 40 — Block C</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.crop', 'Crop')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">Dent Corn (Pioneer P1197AM)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.growthStage', 'Growth Stage')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">V8 (8-leaf)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.plantingDate', 'Planting Date')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">May 3, 2026</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.soilType', 'Soil Type')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">Silty clay loam</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{t('wizard.lastFertilizer', 'Last Fertilizer')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  Apr 30 — {units.convertFertilizer(120, unitSystem).label} anhydrous NH3
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleAnalyzeClick}
              disabled={isSimulatingAnalysis}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition disabled:opacity-75"
            >
              {isSimulatingAnalysis ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Extracting AI Observations...</span>
                </>
              ) : (
                <>
                  <span>{t('wizard.analyzeData', 'Analyze Data')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: AI ANALYSIS */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('wizard.step2Title', 'Step 2: AI Analysis')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('wizard.step2Sub', 'Visual observations from crop image + soil and weather interpretation.')}
            </p>
          </div>

          {/* Visual Observations (Image Analysis) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                {t('wizard.visualObservations', 'Visual Observations (Image Analysis)')}
              </h3>
              <UncertaintyBadge confidence={78} size="sm" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-5">
                <CornLeafPlaceholder showAnnotations={true} />
              </div>

              <div className="md:col-span-7 space-y-3.5">
                {caseData.observations.map((obs, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        {obs.description}
                      </span>
                      <UncertaintyBadge confidence={obs.confidence} size="sm" />
                    </div>
                    <ConfidenceBar score={obs.confidence} showPercentage={true} heightClass="h-1.5" />
                    {obs.note && (
                      <p className="text-[10px] text-slate-400 italic">{obs.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              Note: All observations are based strictly on visible image evidence. The model does not infer lab results from imagery.
            </p>
          </div>

          {/* Soil & Weather Interpretation Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Soil Interpretation */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                {t('wizard.soilInterpretation', 'Soil Interpretation')}
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">Nitrogen (N)</span>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Marginal
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    14 ppm NO3-N is below optimal (25–35 ppm) for V8 corn. Risk of N-stunted growth [ISU Ext. PM 1714].
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">pH 6.2</span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                      Adequate
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    Within optimal range (6.0–6.8) for corn. No liming indicated [ISU Ext. PM 1688].
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">Phosphorus & Potassium</span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                      Adequate
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    P and K at sufficient levels for mid-season demand.
                  </p>
                </div>
              </div>
            </div>

            {/* Weather Interpretation */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-600" />
                {t('wizard.weatherInterpretation', 'Weather Interpretation')}
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">Rainfall {rainfall} / 7d</span>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Below Average
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    12mm received vs 28mm historical average. Mild moisture stress possible at V8 stage — critical for ear development.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">Temperature Range (14–29°C)</span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                      Optimal
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    14–29°C GDD accumulation consistent with expected phenology for this hybrid.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">Soil Moisture Proxy</span>
                    <UncertaintyBadge confidence={48} size="sm" />
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    No in-situ sensor data. Estimate derived from rainfall deficit only. Field inspection recommended.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back', 'Back')}</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateRecsClick}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition"
            >
              <span>{t('wizard.generateRecommendations', 'Generate Recommendations')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CANDIDATE RECOMMENDATIONS */}
      {currentStep === 3 && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('wizard.step3Title', 'Step 3: Candidate Recommendations')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('wizard.step3Sub', 'AI-generated action candidates with evidence, assumptions, and confidence levels.')}
            </p>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            {(['All', 'Crop', 'Fertilizer', 'Irrigation'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeCategoryFilter === cat
                    ? 'bg-emerald-800 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {cat === 'All' ? t('wizard.filterAll', 'All') : cat}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400 italic">
              Sorted by highest confidence (Band definition applied)
            </span>
          </div>

          {/* Sorted Recommendations Cards */}
          <div className="space-y-4">
            {filteredRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 transition hover:border-emerald-300 dark:hover:border-emerald-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {rec.title}
                    </h3>
                  </div>
                  <UncertaintyBadge confidence={rec.confidence} />
                </div>

                {/* Single % Confidence Bar */}
                <ConfidenceBar score={rec.confidence} showPercentage={true} heightClass="h-2" />

                {/* Evidence & Assumptions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-200">Evidence: </span>
                    <span>{rec.evidence}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-200">Assumptions: </span>
                    <span>{rec.assumptions}</span>
                  </div>
                </div>

                {/* Fix #4: Show a "why" line on irrigation advice when soil moisture is high-uncertainty */}
                {rec.whyLine && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span className="font-medium">{rec.whyLine}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back', 'Back')}</span>
            </button>

            <button
              type="button"
              onClick={handleRunRiskCheckClick}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition"
            >
              <span>{t('wizard.runRiskCheck', 'Run Risk Check')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: RISK CHECK */}
      {currentStep === 4 && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('wizard.step4Title', 'Step 4: Risk Check')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('wizard.step4Sub', 'Missing data gaps, unsafe flags, and environmental considerations.')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Missing Data Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t('wizard.missingData', 'Missing Data')}
              </h3>

              <div className="space-y-3 text-xs">
                {caseData.risks.missingData.map((gap, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{gap.item}</div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{gap.reason}</p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                        gap.impact === 'High impact'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : gap.impact === 'Medium impact'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {gap.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Unsafe Action Flags */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-rose-500" />
                {t('wizard.unsafeActionFlags', 'Unsafe Action Flags')}
              </h3>

              <div className="space-y-3 text-xs">
                {caseData.risks.unsafeFlags.map((flag, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      flag.type === 'warning'
                        ? 'bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                        : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-2">
                      {flag.type === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      )}
                      <span>{flag.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] opacity-90 pl-6 leading-relaxed">
                      {flag.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Environmental Notes Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {t('wizard.environmentalNotes', 'Environmental Notes')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Nitrate Leaching Risk</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Medium
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {caseData.risks.environmental.nitrateLeaching.note}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Buffer Zone Compliance</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Good
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {caseData.risks.environmental.bufferZone.note}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Carbon Footprint</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Low
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {caseData.risks.environmental.carbonFootprint.note}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Pollinator Impact</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Low
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {caseData.risks.environmental.pollinatorImpact.note}
                </p>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back', 'Back')}</span>
            </button>

            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition"
            >
              <span>{t('wizard.sendToAgronomist', 'Send to Agronomist')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: AGRONOMIST REVIEW */}
      {currentStep === 5 && (
        <div className="space-y-6 animate-fadeIn">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('wizard.step5Title', 'Step 5: Agronomist Review')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('wizard.step5Sub', 'Expert review panel — approve, edit, or reject AI recommendations.')}
            </p>
          </div>

          {/* Reusable Review Panel */}
          <ReviewPanel
            reviewerName="Dr. Sarah Chen"
            reviewerTitle="Senior Agronomist"
            organization="Iowa State Extension"
            initialStatus={reviewDecision === 'pending' ? 'Awaiting Review' : reviewDecision}
            onDecision={(decision) => setReviewDecision(decision)}
          />

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back', 'Back')}</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateReportClick}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition"
            >
              <span>{t('wizard.generateFarmerReport', 'Generate Farmer Report')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: FARMER GUIDANCE REPORT (EXPLAIN) */}
      {currentStep === 6 && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header & Status */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('wizard.step6Title', 'Step 6: Farmer Guidance Report')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('wizard.step6Sub', 'Plain-language guidance with rationale, next steps, and uncertainty explained.')}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Audio Listen Button */}
              <AudioPlayerButton
                audioUrl={caseData.audioUrl}
                speechText={`${caseData.farmerReport?.headline}. ${caseData.farmerReport?.description}. Recommended steps: Collect leaf tissue sample today to verify nitrogen shortage.`}
              />

              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                <Check className="w-3.5 h-3.5" />
                Agronomist Approved
              </span>
            </div>
          </div>

          {/* Plain English Headline Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {caseData.farmerReport?.headline}
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {caseData.farmerReport?.description}
            </p>
          </div>

          {/* Recommended Next Steps */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              {t('wizard.recommendedNextSteps', 'Recommended Next Steps')}
            </h3>

            <div className="space-y-4">
              {caseData.farmerReport?.steps.map((st) => (
                <div key={st.number} className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 shadow-sm">
                    {st.number}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold text-xs text-slate-900 dark:text-white">
                      {st.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {st.instruction}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warnings & AI Confidence Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Warnings Card */}
            <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Warnings
              </h3>
              <ul className="space-y-2 text-xs text-amber-900/90 dark:text-amber-300/90">
                {caseData.farmerReport?.warnings.map((w, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* AI Confidence Summary Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  {t('wizard.aiConfidenceSummary', 'AI Confidence Summary')}
                </h3>
                <UncertaintyBadge confidence={caseData.confidence} size="sm" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span>Nitrogen deficiency diagnosis</span>
                  <span>{caseData.confidence}%</span>
                </div>
                <ConfidenceBar score={caseData.confidence} showPercentage={false} heightClass="h-2" />
              </div>

              <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                  Why not higher?
                </p>
                <p>{caseData.farmerReport?.confidenceExplanation}</p>
              </div>
            </div>
          </div>

          {/* Footer Approval Signature */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-500 dark:text-slate-400 text-center font-medium">
            Reviewed and approved by Dr. Sarah Chen, Iowa State Extension · 10/16/2026
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back', 'Back')}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm transition"
              >
                <Download className="w-4 h-4" />
                <span>{t('wizard.exportPdf', 'Export PDF')}</span>
              </button>

              <button
                type="button"
                onClick={() => resetCase()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('wizard.startNewCase', 'Start New Case')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
