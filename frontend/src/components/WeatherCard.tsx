import React, { useState, useEffect } from 'react';
import {
  CloudSun,
  Droplets,
  Wind,
  CloudRain,
  Sun,
  RefreshCw,
  Clock,
  Sparkles,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';
import { alertsApi, type FarmForecastResponse, type ForecastDayItem } from '@/api/alertsApi';

export interface WeatherCardProps {
  fieldId?: string | number | null;
  farmId?: string | number | null;
  initialWeather?: any;
  onRefresh?: () => void;
  className?: string;
  showForecast7d?: boolean;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({
  fieldId,
  farmId,
  initialWeather,
  onRefresh,
  className = '',
  showForecast7d = true,
}) => {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<any>(initialWeather || null);
  const [forecast, setForecast] = useState<FarmForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      if (farmId) {
        const fc = await alertsApi.getFarmForecast(Number(farmId));
        setForecast(fc);
      } else if (fieldId) {
        const data = await casesApi.getFieldWeather(fieldId);
        setWeather(data);
      }
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
    }
    if (farmId || fieldId) {
      fetchWeather();
    }
  }, [farmId, fieldId]);

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

  const getDayLabel = (dateStr: string, index: number) => {
    if (index === 0) return t('weather.today', 'Today');
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { weekday: 'short' });
    } catch {
      return dateStr;
    }
  };

  const getWeatherIcon = (day: ForecastDayItem) => {
    if (day.precipitation_mm >= 5.0) {
      return <CloudRain className="w-5 h-5 text-blue-500" />;
    }
    if (day.wind_speed_kmh >= 25.0) {
      return <Wind className="w-5 h-5 text-teal-500" />;
    }
    if (day.temp_max_c >= 32.0) {
      return <Sun className="w-5 h-5 text-amber-500" />;
    }
    return <CloudSun className="w-5 h-5 text-amber-500" />;
  };

  // If we have forecast data from Open-Meteo
  if (forecast && forecast.daily && forecast.daily.length > 0) {
    const today = forecast.daily[0];
    const fetchedAt = forecast.fetched_at;

    return (
      <div
        className={`p-6 rounded-3xl bg-gradient-to-br from-emerald-50/80 via-teal-50/50 to-sky-50/70 dark:from-slate-900 dark:via-slate-900/90 dark:to-teal-950/30 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-5 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <CloudSun className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {forecast.farm_name ? `${forecast.farm_name} — ` : ''}
                {t('weather.farmForecastTitle', '7-Day Weather Forecast')}
              </h3>
              <span className="text-xs text-teal-800/80 dark:text-teal-300 font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('weather.source', 'Source: Open-Meteo High-Resolution Telemetry')}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Updated {formatTime(fetchedAt)}</span>
            </span>

            <button
              type="button"
              onClick={fetchWeather}
              disabled={loading}
              className="p-2 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs border border-slate-200/60 dark:border-slate-700 transition"
              title="Refresh forecast"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Today's Highlight Tile (Large Text) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-emerald-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 shadow-inner">
              <Sun className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('weather.todayConditions', "Today's Forecast")}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white">
                  {today.temp_max_c}°C
                </span>
                <span className="text-lg font-bold text-slate-400">
                  / {today.temp_min_c}°C
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-700 pt-3 md:pt-0 md:pl-6 text-center">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">{t('weather.rain', 'Rain')}</span>
              <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 block">
                {today.precipitation_mm} mm
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">{t('weather.rainChance', 'Rain Chance')}</span>
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                {today.precipitation_probability_pct}%
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">{t('weather.wind', 'Wind')}</span>
              <span className="text-sm font-extrabold text-teal-600 dark:text-teal-400 mt-0.5 block">
                {today.wind_speed_kmh} km/h
              </span>
            </div>
          </div>
        </div>

        {/* 7-Day Forecast Tiles */}
        {showForecast7d && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('weather.sevenDayTiles', '7-Day Outlook')}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {forecast.daily.map((day, idx) => (
                <div
                  key={day.date}
                  className={`p-3 rounded-2xl border text-center flex flex-col justify-between items-center transition-all ${
                    idx === 0
                      ? 'bg-emerald-100/60 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 font-bold'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/70 hover:border-emerald-200'
                  }`}
                >
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    {getDayLabel(day.date, idx)}
                  </span>
                  <div className="my-2">{getWeatherIcon(day)}</div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    {day.temp_max_c}°
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {day.temp_min_c}°
                  </span>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {day.precipitation_mm > 0 ? `${day.precipitation_mm}mm` : 'Dry'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to legacy snapshot view if forecast not available
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

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Updated {formatTime(fetchedAt)}</span>
          <button
            type="button"
            onClick={fetchWeather}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <CloudSun className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">{t('weather.temp', 'Air Temp')}</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">{temp}°C</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 flex items-center justify-center flex-shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">{t('weather.humidity', 'Humidity')}</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">{humidity}%</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <CloudRain className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">{t('weather.rain7d', '7-Day Rain')}</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {typeof rain7d === 'number' ? rain7d.toFixed(1) : rain7d} mm
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-emerald-100/60 dark:border-slate-700/60 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 flex items-center justify-center flex-shrink-0">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-medium block">{t('weather.wind', 'Wind')}</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white">{wind} km/h</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherCard;
