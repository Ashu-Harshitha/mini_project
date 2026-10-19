import React, { useState, useEffect } from 'react';
import {
  CloudSun,
  Droplets,
  Wind,
  CloudRain,
  RefreshCw,
  Clock,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';

export interface WeatherCardProps {
  fieldId?: string | number | null;
  initialWeather?: any;
  onRefresh?: () => void;
  className?: string;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({
  fieldId,
  initialWeather,
  onRefresh,
  className = '',
}) => {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<any>(initialWeather || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = async () => {
    if (!fieldId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await casesApi.getFieldWeather(fieldId);
      setWeather(data);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.warn('Weather fetch error:', err);
      setError(
        t('weather.fetchError', 'Live weather telemetry could not be updated right now.')
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialWeather) {
      setWeather(initialWeather);
    } else if (fieldId) {
      fetchWeather();
    }
  }, [fieldId, initialWeather]);

  if (!weather && !loading && !error) {
    return null;
  }

  // Format updated time
  const formatTime = (isoString?: string) => {
    if (!isoString) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const current = weather?.current || {};
  const temp = current.temperature_2m ?? weather?.temp_c ?? weather?.tempMaxC ?? '--';
  const humidity = current.relative_humidity_2m ?? weather?.humidity_pct ?? weather?.humidity ?? '--';
  const wind = current.wind_speed_10m ?? weather?.wind_speed_kmh ?? weather?.windKmh ?? '--';
  const rain7d = weather?.precip_7d_mm ?? weather?.rainfall7dMm ?? weather?.rain_7d ?? 0;
  const fetchedAt = weather?.fetched_at || weather?.created_at;

  return (
    <div
      className={`p-5 rounded-3xl bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-sky-50/60 dark:from-slate-900 dark:via-slate-900/90 dark:to-teal-950/20 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-4 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
            <CloudSun className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('weather.title', 'Automated Field Weather')}
            </h3>
            <span className="text-[11px] text-teal-800/80 dark:text-teal-300 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>{t('weather.source', 'Source: Open-Meteo High-Resolution Telemetry')}</span>
            </span>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={fetchWeather}
          disabled={loading || !fieldId}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs border border-slate-200/60 dark:border-slate-700 transition disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-600' : ''}`} />
          <span>{loading ? t('common.loading', 'Loading...') : t('weather.refresh', 'Refresh')}</span>
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid of Weather Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Temperature */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <CloudSun className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">
              {t('weather.temp', 'Air Temp')}
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {temp}°C
            </span>
          </div>
        </div>

        {/* Humidity */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 flex items-center justify-center flex-shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">
              {t('weather.humidity', 'Humidity')}
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {humidity}%
            </span>
          </div>
        </div>

        {/* 7-Day Rainfall */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <CloudRain className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">
              {t('weather.rain7d', '7-Day Rain')}
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {typeof rain7d === 'number' ? rain7d.toFixed(1) : rain7d} mm
            </span>
          </div>
        </div>

        {/* Wind Speed */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 flex items-center justify-center flex-shrink-0">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">
              {t('weather.wind', 'Wind')}
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {wind} km/h
            </span>
          </div>
        </div>
      </div>

      {/* Footer updated timestamp */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>
            {t('weather.updatedAt', 'Updated at')} {formatTime(fetchedAt)}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">
          {t('weather.noManualEntry', 'Values fetched automatically via field GPS')}
        </span>
      </div>
    </div>
  );
};

export default WeatherCard;
