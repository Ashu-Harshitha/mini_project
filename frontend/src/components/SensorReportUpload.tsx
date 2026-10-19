import React, { useState } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Download,
  Edit3,
  Loader2,
  X,
  Droplets,
  Thermometer,
  Wind,
  Activity,
  Layers,
  Leaf,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { casesApi } from '@/api/casesApi';

// Simulated ranges validation schema using Zod
export const sensorValuesSchema = z.object({
  soil_moisture_pct: z.number().min(15, 'Moisture min 15%').max(45, 'Moisture max 45%').nullable().optional(),
  n_mgkg: z.number().min(20, 'N min 20 mg/kg').max(150, 'N max 150 mg/kg').nullable().optional(),
  p_mgkg: z.number().min(20, 'P min 20 mg/kg').max(150, 'P max 150 mg/kg').nullable().optional(),
  k_mgkg: z.number().min(20, 'K min 20 mg/kg').max(150, 'K max 150 mg/kg').nullable().optional(),
  temp_c: z.number().min(15, 'Temp min 15°C').max(40, 'Temp max 40°C').nullable().optional(),
  humidity_pct: z.number().min(40, 'Humidity min 40%').max(90, 'Humidity max 90%').nullable().optional(),
  ph: z.number().min(4.5, 'pH min 4.5').max(8.5, 'pH max 8.5').nullable().optional(),
  leaf_wetness_pct: z.number().min(0, 'Leaf wetness min 0%').max(100, 'Leaf wetness max 100%').nullable().optional(),
});

export type SensorValuesFormData = z.infer<typeof sensorValuesSchema>;

export interface SensorStatusItem {
  key: string;
  label_key: string;
  status: string;
  value: number | string | null;
}

interface SensorReportUploadProps {
  caseId?: string | number | null;
  onSensorDataLoaded?: (summary: any, interpretation: any) => void;
  className?: string;
}

export const SensorReportUpload: React.FC<SensorReportUploadProps> = ({
  caseId,
  onSensorDataLoaded,
  className = '',
}) => {
  const { t } = useTranslation();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Parse result & current summary
  const [summaryData, setSummaryData] = useState<any>(null);
  const [interpretations, setInterpretations] = useState<SensorStatusItem[]>([]);
  const [showEditForm, setShowEditForm] = useState(false);

  // Sample Report Generator state
  const [sampleScenario, setSampleScenario] = useState('healthy');

  // Manual Edit Form values
  const [formValues, setFormValues] = useState<SensorValuesFormData>({
    soil_moisture_pct: 32,
    n_mgkg: 85,
    p_mgkg: 60,
    k_mgkg: 90,
    temp_c: 26,
    humidity_pct: 65,
    ph: 6.5,
    leaf_wetness_pct: 15,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setUploadError(t('sensors.pdfOnlyError', 'Please upload a PDF document.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t('sensors.pdfSizeError', 'File exceeds 5 MB limit.'));
      return;
    }

    setPdfFile(file);
    setUploadError(null);

    // If caseId exists, upload directly
    if (caseId) {
      setIsUploading(true);
      try {
        const res = await casesApi.uploadSensorReport(caseId, file);
        setUploadSuccess(true);
        setSummaryData(res.summary);
        buildInterpretationsFromRes(res);
        if (onSensorDataLoaded) {
          onSensorDataLoaded(res.summary, res.interpretation);
        }
      } catch (err: any) {
        console.error('PDF sensor parse error:', err);
        setUploadError(
          err.message ||
            t(
              'sensors.parseError',
              'Could not read the sensor PDF. You can enter or correct the values manually below.'
            )
        );
        setShowEditForm(true);
      } finally {
        setIsUploading(false);
      }
    } else {
      // If case isn't created yet in backend, mark file selected and prefill demo summary
      setUploadSuccess(true);
      setInterpretations(getDefaultStatusItems(formValues));
    }
  };

  const buildInterpretationsFromRes = (res: any) => {
    const inter = res.interpretation || {};
    const latest = res.summary?.latest || {};

    const items: SensorStatusItem[] = [
      {
        key: 'soil_moisture',
        label_key: 'sensors.soil_moisture',
        status: inter.soil_moisture?.status || 'OK',
        value: latest.soil_moisture_pct != null ? `${latest.soil_moisture_pct}%` : null,
      },
      {
        key: 'nitrogen',
        label_key: 'sensors.nitrogen',
        status: inter.nitrogen?.status || 'OK',
        value: latest.n_mgkg != null ? `${latest.n_mgkg} mg/kg` : null,
      },
      {
        key: 'phosphorus',
        label_key: 'sensors.phosphorus',
        status: inter.phosphorus?.status || 'OK',
        value: latest.p_mgkg != null ? `${latest.p_mgkg} mg/kg` : null,
      },
      {
        key: 'potassium',
        label_key: 'sensors.potassium',
        status: inter.potassium?.status || 'OK',
        value: latest.k_mgkg != null ? `${latest.k_mgkg} mg/kg` : null,
      },
      {
        key: 'temp_c',
        label_key: 'sensors.temp_c',
        status: inter.heat_stress?.status === 'high' ? 'Heat Stress' : 'Optimal',
        value: latest.temp_c != null ? `${latest.temp_c}°C` : null,
      },
      {
        key: 'humidity',
        label_key: 'sensors.humidity',
        status: latest.humidity_pct > 80 ? 'High' : latest.humidity_pct < 40 ? 'Low' : 'OK',
        value: latest.humidity_pct != null ? `${latest.humidity_pct}%` : null,
      },
      {
        key: 'ph',
        label_key: 'sensors.ph',
        status: inter.ph?.status || 'Optimal',
        value: latest.ph != null ? `${latest.ph}` : null,
      },
      {
        key: 'leaf_wetness',
        label_key: 'sensors.leaf_wetness',
        status: inter.fungal_pressure?.status === 'high' ? 'Fungal Risk' : 'Low',
        value: latest.leaf_wetness_pct != null ? `${latest.leaf_wetness_pct}%` : null,
      },
    ];

    setInterpretations(items);
    setFormValues({
      soil_moisture_pct: latest.soil_moisture_pct ?? 30,
      n_mgkg: latest.n_mgkg ?? 80,
      p_mgkg: latest.p_mgkg ?? 50,
      k_mgkg: latest.k_mgkg ?? 80,
      temp_c: latest.temp_c ?? 25,
      humidity_pct: latest.humidity_pct ?? 65,
      ph: latest.ph ?? 6.5,
      leaf_wetness_pct: latest.leaf_wetness_pct ?? 20,
    });
  };

  const getDefaultStatusItems = (v: SensorValuesFormData): SensorStatusItem[] => [
    { key: 'soil_moisture', label_key: 'sensors.soil_moisture', status: (v.soil_moisture_pct ?? 30) < 22 ? 'Dry' : (v.soil_moisture_pct ?? 30) > 38 ? 'Wet' : 'OK', value: `${v.soil_moisture_pct}%` },
    { key: 'nitrogen', label_key: 'sensors.nitrogen', status: (v.n_mgkg ?? 80) < 40 ? 'Low' : 'OK', value: `${v.n_mgkg} mg/kg` },
    { key: 'phosphorus', label_key: 'sensors.phosphorus', status: 'OK', value: `${v.p_mgkg} mg/kg` },
    { key: 'potassium', label_key: 'sensors.potassium', status: 'OK', value: `${v.k_mgkg} mg/kg` },
    { key: 'temp_c', label_key: 'sensors.temp_c', status: (v.temp_c ?? 25) >= 35 ? 'Heat Stress' : 'Optimal', value: `${v.temp_c}°C` },
    { key: 'humidity', label_key: 'sensors.humidity', status: (v.humidity_pct ?? 65) > 80 ? 'High' : 'OK', value: `${v.humidity_pct}%` },
    { key: 'ph', label_key: 'sensors.ph', status: 'Optimal', value: `${v.ph}` },
    { key: 'leaf_wetness', label_key: 'sensors.leaf_wetness', status: (v.leaf_wetness_pct ?? 20) > 70 ? 'High Risk' : 'Low', value: `${v.leaf_wetness_pct}%` },
  ];

  // Manual values submission
  const handleSaveManualValues = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const parsed = sensorValuesSchema.safeParse(formValues);
    if (!parsed.success) {
      const errMap: Record<string, string> = {};
      parsed.error.issues.forEach((iss) => {
        if (iss.path[0]) errMap[iss.path[0].toString()] = iss.message;
      });
      setFormErrors(errMap);
      return;
    }

    if (caseId) {
      setIsSavingManual(true);
      try {
        const res = await casesApi.updateSensorSummary(caseId, formValues);
        buildInterpretationsFromRes(res);
        setShowEditForm(false);
        setUploadSuccess(true);
        if (onSensorDataLoaded) {
          onSensorDataLoaded(res.summary, res.interpretation);
        }
      } catch (err: any) {
        setUploadError(err.message || 'Failed to update sensor values.');
      } finally {
        setIsSavingManual(false);
      }
    } else {
      setInterpretations(getDefaultStatusItems(formValues));
      setShowEditForm(false);
      setUploadSuccess(true);
    }
  };

  // Helper icon lookup
  const getMetricIcon = (key: string) => {
    switch (key) {
      case 'soil_moisture':
        return <Droplets className="w-5 h-5 text-sky-600" />;
      case 'nitrogen':
      case 'phosphorus':
      case 'potassium':
        return <Layers className="w-5 h-5 text-emerald-600" />;
      case 'temp_c':
        return <Thermometer className="w-5 h-5 text-amber-600" />;
      case 'humidity':
        return <Wind className="w-5 h-5 text-teal-600" />;
      case 'ph':
        return <Activity className="w-5 h-5 text-indigo-600" />;
      case 'leaf_wetness':
        return <Leaf className="w-5 h-5 text-emerald-600" />;
      default:
        return <Droplets className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('stress') || s.includes('dry') || s.includes('risk') || s.includes('acidic') || s.includes('low') || s.includes('high')) {
      if (s.includes('ok') || s.includes('optimal') || s.includes('adequate')) {
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      }
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300';
    }
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  };

  return (
    <div className={`p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('sensors.title', 'Simulated Field Sensor Telemetry')}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {t('sensors.simulatedBadge', 'Simulated data')}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {t('sensors.subtitle', 'Upload AgriAdvisor sensor kit report PDF or generate a test scenario')}
            </span>
          </div>
        </div>

        {/* Download Sample Generator Action */}
        <div className="flex items-center gap-2">
          <select
            value={sampleScenario}
            onChange={(e) => setSampleScenario(e.target.value)}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="healthy">Scenario: Healthy</option>
            <option value="n_deficiency">Scenario: N Deficiency</option>
            <option value="dry">Scenario: Dry Soil</option>
            <option value="fungal_risk">Scenario: Fungal Risk</option>
            <option value="random">Scenario: Random Field</option>
          </select>
          <a
            href={casesApi.getSensorSampleUrl(sampleScenario)}
            download={`sensor_report_${sampleScenario}.pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('sensors.downloadSample', 'Sample PDF')}</span>
          </a>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Drag & Drop PDF upload area (shown if no successful parse yet or to replace) */}
      {!uploadSuccess && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.[0]) {
              handleFileSelect(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed rounded-3xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center ${
            isDragging
              ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          {isUploading ? (
            <div className="py-4 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('sensors.readingReport', 'Reading and validating sensor PDF...')}
              </span>
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mb-2 shadow-xs">
                <UploadCloud className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {t('sensors.dragDropPdf', 'Drag & drop field sensor PDF here, or click to browse')}
              </span>
              <span className="text-[11px] text-slate-400 mt-1">
                Supports ReportLab sensor reports (Max 5 MB, up to 10 pages)
              </span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                }}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {/* "We read your report" Result Display with Large Plain-Status Tiles */}
      {uploadSuccess && interpretations.length > 0 && (
        <div className="space-y-4 pt-1">
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100 block">
                  {t('sensors.weReadYourReport', 'We read your sensor report')}
                </span>
                <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  {pdfFile ? pdfFile.name : 'Simulated 48-Hour Field Sensor Feed'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEditForm(!showEditForm)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-xs border border-slate-200 dark:border-slate-700 transition"
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('sensors.somethingWrong', 'Something wrong? Edit values')}</span>
              </button>
            </div>
          </div>

          {/* Large plain tiles for farmers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {interpretations.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center">
                    {getMetricIcon(item.key)}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${getStatusColor(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="mt-3">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    {t(item.label_key as any, { defaultValue: item.key.replace('_', ' ') }) as string}
                  </span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    {item.value || '--'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Value Edit / Correction Form (Zod ranges) */}
      {showEditForm && (
        <form
          onSubmit={handleSaveManualValues}
          className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {t('sensors.manualFormTitle', 'Manual Sensor Readings Correction')}
            </h4>
            <button
              type="button"
              onClick={() => setShowEditForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Soil Moisture */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Moisture (15-45%)
              </label>
              <input
                type="number"
                step="0.1"
                value={formValues.soil_moisture_pct ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, soil_moisture_pct: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.soil_moisture_pct && (
                <span className="text-[10px] text-rose-500">{formErrors.soil_moisture_pct}</span>
              )}
            </div>

            {/* Nitrogen */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Nitrogen (20-150 mg/kg)
              </label>
              <input
                type="number"
                step="1"
                value={formValues.n_mgkg ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, n_mgkg: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.n_mgkg && (
                <span className="text-[10px] text-rose-500">{formErrors.n_mgkg}</span>
              )}
            </div>

            {/* Phosphorus */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Phosphorus (20-150 mg/kg)
              </label>
              <input
                type="number"
                step="1"
                value={formValues.p_mgkg ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, p_mgkg: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.p_mgkg && (
                <span className="text-[10px] text-rose-500">{formErrors.p_mgkg}</span>
              )}
            </div>

            {/* Potassium */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Potassium (20-150 mg/kg)
              </label>
              <input
                type="number"
                step="1"
                value={formValues.k_mgkg ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, k_mgkg: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.k_mgkg && (
                <span className="text-[10px] text-rose-500">{formErrors.k_mgkg}</span>
              )}
            </div>

            {/* Air Temp */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Air Temp (15-40°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={formValues.temp_c ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, temp_c: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.temp_c && (
                <span className="text-[10px] text-rose-500">{formErrors.temp_c}</span>
              )}
            </div>

            {/* Humidity */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Humidity (40-90%)
              </label>
              <input
                type="number"
                step="1"
                value={formValues.humidity_pct ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, humidity_pct: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.humidity_pct && (
                <span className="text-[10px] text-rose-500">{formErrors.humidity_pct}</span>
              )}
            </div>

            {/* Soil pH */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Soil pH (4.5-8.5)
              </label>
              <input
                type="number"
                step="0.1"
                value={formValues.ph ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, ph: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.ph && (
                <span className="text-[10px] text-rose-500">{formErrors.ph}</span>
              )}
            </div>

            {/* Leaf Wetness */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Leaf Wetness (0-100%)
              </label>
              <input
                type="number"
                step="1"
                value={formValues.leaf_wetness_pct ?? ''}
                onChange={(e) =>
                  setFormValues({ ...formValues, leaf_wetness_pct: parseFloat(e.target.value) || null })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              {formErrors.leaf_wetness_pct && (
                <span className="text-[10px] text-rose-500">{formErrors.leaf_wetness_pct}</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowEditForm(false)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingManual}
              className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow disabled:opacity-50"
            >
              {isSavingManual ? 'Updating...' : t('sensors.saveChanges', 'Save Sensor Values')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SensorReportUpload;
