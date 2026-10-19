import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
  Activity,
  Download,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  CloudSun,
  Layers,
  Thermometer,
  Droplets,
  Leaf,
  Clock,
  Sparkles,
  Info,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { casesApi } from '@/api/casesApi';
import WeatherCard from './WeatherCard';

const MapContainerInner = lazy(() => import('./MapContainerInner'));

interface AgronomistSensorPanelProps {
  caseId: string | number;
  fieldId?: string | number | null;
  className?: string;
}

export const AgronomistSensorPanel: React.FC<AgronomistSensorPanelProps> = ({
  caseId,
  fieldId,
  className = '',
}) => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchSensors() {
      setLoading(true);
      setError(null);
      try {
        const res = await casesApi.getCaseSensors(caseId);
        if (active) setData(res);
      } catch (err: any) {
        if (active) {
          console.warn('Failed to load agronomist sensor telemetry:', err);
          setError(err.message || 'No field sensor telemetry available for this case.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (caseId) {
      fetchSensors();
    }

    return () => {
      active = false;
    };
  }, [caseId]);

  if (loading) {
    return (
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span>Loading sensor telemetry and series...</span>
      </div>
    );
  }

  if (error || !data) {
    return null; // Gracefully hidden if no telemetry exists
  }

  const latest = data.latest || {};
  const stats24 = data.stats_24h || {};
  const interpretations = data.interpretation || {};
  const flags = data.flags || [];
  const series = (data.readings_series || []).map((r: any) => ({
    ...r,
    time: r.measured_at ? new Date(r.measured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
  }));
  const location = data.location;
  const pdfUrl = data.report_file_url || casesApi.getSensorReportFileUrl(caseId);

  return (
    <div className={`p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 ${className}`}>
      {/* Header with Simulated Badge and PDF Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Field Sensors Telemetry
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              SIMULATED
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1 block">
            Device: {data.device_label || 'AgriSensor IoT Pack'} · {data.rows_count || series.length} readings recorded
          </span>
        </div>

        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            download="sensor_report.pdf"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition shadow-xs"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Download Original PDF</span>
          </a>
        )}
      </div>

      {/* Data Quality and Validation Flags */}
      {flags.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-800/60 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Data-Quality & Telemetry Validation Flags</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {flags.map((fl: any, idx: number) => {
              const flagName = typeof fl === 'string' ? fl : fl.rule_name || fl.flag || 'flag';
              const flagMsg = typeof fl === 'string' ? fl : fl.message || fl.details || '';
              return (
                <span
                  key={idx}
                  title={flagMsg}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-700/60 flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                  <span>{flagName}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Latest Telemetry Values & Status Chips */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Latest Measured Telemetry & Status
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Soil Moisture */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Soil Moisture</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                {interpretations.soil_moisture?.status || 'Adequate'}
              </span>
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              {latest.soil_moisture_pct != null ? `${latest.soil_moisture_pct}%` : '--'}
            </div>
          </div>

          {/* Nitrogen */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Nitrogen (N)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {interpretations.nitrogen?.status || 'Adequate'}
              </span>
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              {latest.n_mgkg != null ? `${latest.n_mgkg} mg/kg` : '--'}
            </div>
          </div>

          {/* Phosphorus & Potassium */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">P & K</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                OK
              </span>
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
              P: {latest.p_mgkg ?? '--'} · K: {latest.k_mgkg ?? '--'}
            </div>
          </div>

          {/* Air Temp & Humidity */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Air Temp / Hum</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {latest.temp_c != null ? `${latest.temp_c}°C` : '--'}
              </span>
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
              {latest.humidity_pct != null ? `${latest.humidity_pct}% RH` : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* 24-Hour Statistical Summary Table */}
      {Object.keys(stats24).length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Last 24 Hours Statistics (Mean / Min / Max)
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Parameter</th>
                  <th className="py-2.5 px-3">Mean</th>
                  <th className="py-2.5 px-3">Min</th>
                  <th className="py-2.5 px-3">Max</th>
                  <th className="py-2.5 px-3">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200 font-mono">
                {Object.entries(stats24).map(([key, stat]: [string, any]) => {
                  const tr = data.trends?.[key] || 'stable';
                  return (
                    <tr key={key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-sans font-semibold capitalize text-slate-700 dark:text-slate-300">
                        {key.replace('_pct', ' (%)').replace('_mgkg', ' (mg/kg)').replace('_c', ' (°C)')}
                      </td>
                      <td className="py-2 px-3">{stat.mean != null ? stat.mean.toFixed(1) : '--'}</td>
                      <td className="py-2 px-3">{stat.min != null ? stat.min.toFixed(1) : '--'}</td>
                      <td className="py-2 px-3">{stat.max != null ? stat.max.toFixed(1) : '--'}</td>
                      <td className="py-2 px-3 font-sans">
                        <span
                          className={`text-[11px] font-bold uppercase ${
                            tr === 'rising'
                              ? 'text-emerald-600'
                              : tr === 'falling'
                              ? 'text-rose-500'
                              : 'text-slate-400'
                          }`}
                        >
                          {tr}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recharts Mini Line Charts */}
      {series.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            48-Hour Historical Telemetry Series
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart 1: Soil Moisture */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-sky-600" />
                Soil Moisture (%)
              </span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={7} />
                    <YAxis domain={[10, 50]} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                    <Line
                      type="monotone"
                      dataKey="soil_moisture_pct"
                      name="Moisture %"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Temp & Humidity */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                Air Temperature (°C) & Humidity (%)
              </span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={7} />
                    <YAxis yAxisId="temp" domain={[10, 45]} tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="hum" orientation="right" domain={[30, 100]} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temp_c"
                      name="Temp (°C)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="hum"
                      type="monotone"
                      dataKey="humidity_pct"
                      name="Humidity (%)"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: N, P, K */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                NPK Macro Nutrients (mg/kg)
              </span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={7} />
                    <YAxis domain={[0, 150]} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" dataKey="n_mgkg" name="N" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="p_mgkg" name="P" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="k_mgkg" name="K" stroke="#f97316" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Leaf Wetness */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                Leaf Wetness & Fungal Duration (%)
              </span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={7} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                    <Line
                      type="monotone"
                      dataKey="leaf_wetness_pct"
                      name="Leaf Wetness (%)"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Field Location Map & Weather Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Field GPS Map Pin */}
        {location && location.lat && location.lng && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Field GPS Coordinates</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                ±{location.accuracy_m || 15}m ({location.source || 'gps'})
              </span>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <Suspense fallback={<div className="h-40 bg-slate-200 dark:bg-slate-700 animate-pulse" />}>
                <MapContainerInner
                  lat={location.lat}
                  lng={location.lng}
                  accuracyM={location.accuracy_m}
                  onPositionChange={() => {}}
                  height="170px"
                  interactive={false}
                  zoom={14}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Live Weather Telemetry */}
        {fieldId && (
          <div>
            <WeatherCard fieldId={fieldId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AgronomistSensorPanel;
