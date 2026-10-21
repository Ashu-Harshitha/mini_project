import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  Filter,
  RefreshCw,
  Layers,
  ChevronRight,
  MapPin,
  Calendar,
  Building,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { outbreaksApi, type OutbreakItem, type MapCaseItem } from '@/api/outbreaksApi';

// Issue category color mappings
const CATEGORY_COLORS: Record<string, string> = {
  pest: '#ef4444', // Red
  disease: '#f97316', // Orange
  nutrient_deficiency: '#eab308', // Yellow
  deficiency: '#eab308',
  weed: '#84cc16', // Lime
  environmental: '#3b82f6', // Blue
  weather: '#3b82f6',
  healthy: '#10b981', // Emerald
  other: '#a855f7', // Purple
};

function getCategoryColor(category?: string | null): string {
  if (!category) return CATEGORY_COLORS.other;
  const key = category.toLowerCase().trim();
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.other;
}

// Controller to smoothly pan/zoom to selected coordinates
function MapController({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom || map.getZoom(), { duration: 1.0 });
  }, [center, zoom, map]);
  return null;
}

export const OutbreakMap: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAppStore();
  const isAdmin = user?.role === 'admin';

  // Data states
  const [outbreaks, setOutbreaks] = useState<OutbreakItem[]>([]);
  const [cases, setCases] = useState<MapCaseItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  // Filters
  const [selectedCrop, setSelectedCrop] = useState<string>('all');
  const [selectedIssue, setSelectedIssue] = useState<string>('all');
  const [lookbackDays, setLookbackDays] = useState<number>(14);
  const [outbreaksOnly, setOutbreaksOnly] = useState<boolean>(false);
  const [selectedOutbreakId, setSelectedOutbreakId] = useState<number | null>(null);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([12.9716, 77.5946]); // Default South India / Karnataka
  const [mapZoom, setMapZoom] = useState<number>(8);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [outbreaksRes, casesRes] = await Promise.all([
        outbreaksApi.getOutbreaks(),
        outbreaksApi.getMapCases({
          crop: selectedCrop !== 'all' ? selectedCrop : undefined,
          issue: selectedIssue !== 'all' ? selectedIssue : undefined,
          days: lookbackDays,
        }),
      ]);
      setOutbreaks(outbreaksRes);
      setCases(casesRes);

      // Auto-center on active outbreak or cases if available
      const openOutbreak = outbreaksRes.find((o) => o.status === 'open');
      if (openOutbreak) {
        setMapCenter([openOutbreak.center_lat, openOutbreak.center_lng]);
        setMapZoom(9);
      } else if (casesRes.length > 0) {
        setMapCenter([casesRes[0].lat, casesRes[0].lng]);
      }
    } catch (err: any) {
      console.error('Failed to load outbreak map data:', err);
      setError(err?.message || 'Failed to load outbreak map data');
    } finally {
      setLoading(false);
    }
  }, [selectedCrop, selectedIssue, lookbackDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleResolveOutbreak = async (id: number) => {
    if (!isAdmin) return;
    setResolvingId(id);
    try {
      const updated = await outbreaksApi.resolveOutbreak(id);
      setOutbreaks((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err: any) {
      console.error('Failed to resolve outbreak:', err);
      alert(err?.message || 'Failed to resolve outbreak');
    } finally {
      setResolvingId(null);
    }
  };

  // Distinct crops and issues for filter dropdowns / chips
  const distinctCrops = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => {
      if (c.crop) set.add(c.crop);
    });
    outbreaks.forEach((o) => {
      if (o.crop) set.add(o.crop);
    });
    return Array.from(set).sort();
  }, [cases, outbreaks]);

  const distinctIssues = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => {
      if (c.issue_category) set.add(c.issue_category);
    });
    outbreaks.forEach((o) => {
      if (o.issue_category) set.add(o.issue_category);
    });
    return Array.from(set).sort();
  }, [cases, outbreaks]);

  // Filtered cases
  const displayedCases = useMemo(() => {
    return cases.filter((c) => {
      if (outbreaksOnly && !c.outbreak_id) return false;
      return true;
    });
  }, [cases, outbreaksOnly]);

  // Filtered outbreaks
  const displayedOutbreaks = useMemo(() => {
    return outbreaks.filter((o) => {
      if (selectedCrop !== 'all' && o.crop.toLowerCase() !== selectedCrop.toLowerCase()) return false;
      if (selectedIssue !== 'all' && o.issue_category.toLowerCase() !== selectedIssue.toLowerCase()) return false;
      return true;
    });
  }, [outbreaks, selectedCrop, selectedIssue]);

  const focusOutbreak = (o: OutbreakItem) => {
    setSelectedOutbreakId(o.id);
    setMapCenter([o.center_lat, o.center_lng]);
    setMapZoom(10);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
      {/* Top Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 shrink-0 z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                {t('outbreaks.title', 'Regional Outbreak Map')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAdmin
                  ? t('outbreaks.adminSubtitle', 'Spatial clustering & active biosecurity alerts')
                  : t('outbreaks.agronomistSubtitle', 'Read-only regional surveillance for your assigned workload')}
              </p>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Lookback Days Chips */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setLookbackDays(d)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    lookbackDays === d
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Crop Select */}
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-0 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">{t('outbreaks.allCrops', 'All Crops')}</option>
              {distinctCrops.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Issue Select */}
            <select
              value={selectedIssue}
              onChange={(e) => setSelectedIssue(e.target.value)}
              className="text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-0 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">{t('outbreaks.allIssues', 'All Issues')}</option>
              {distinctIssues.map((iss) => (
                <option key={iss} value={iss}>
                  {iss.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>

            {/* Outbreaks Only Toggle */}
            <button
              onClick={() => setOutbreaksOnly(!outbreaksOnly)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                outbreaksOnly
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('outbreaks.outbreaksOnly', 'Outbreaks only')}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
              title="Refresh Map"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Map + Side List */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Full-width Map Container */}
        <div className="flex-1 h-full relative z-0">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom={true}
            className="w-full h-full"
            style={{ background: '#f8fafc' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController center={mapCenter} zoom={mapZoom} />

            {/* Translucent Outbreak Circles */}
            {displayedOutbreaks.map((o) => {
              const isAlert = o.severity === 'alert';
              const isResolved = o.status === 'resolved';
              return (
                <Circle
                  key={`outbreak-${o.id}`}
                  center={[o.center_lat, o.center_lng]}
                  radius={o.radius_km * 1000}
                  pathOptions={{
                    color: isResolved ? '#64748b' : isAlert ? '#dc2626' : '#d97706',
                    fillColor: isResolved ? '#94a3b8' : isAlert ? '#ef4444' : '#f59e0b',
                    fillOpacity: isResolved ? 0.08 : 0.18,
                    weight: isResolved ? 1 : 2,
                    dashArray: isResolved ? '6, 6' : undefined,
                  }}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 text-xs min-w-[200px]">
                      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200">
                        <span className="font-bold text-sm">
                          {o.crop.toUpperCase()} • {o.issue_category.replace('_', ' ').toUpperCase()}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isResolved
                              ? 'bg-slate-200 text-slate-700'
                              : isAlert
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {o.status === 'resolved' ? 'Resolved' : o.severity}
                        </span>
                      </div>
                      <p className="mb-1">
                        <strong>Radius:</strong> {o.radius_km} km
                      </p>
                      <p className="mb-1">
                        <strong>Impact:</strong> {o.farm_count} farms ({o.case_count} cases)
                      </p>
                      <p className="mb-1 text-slate-500">
                        <strong>First seen:</strong> {new Date(o.first_seen).toLocaleDateString()}
                      </p>
                      <p className="text-slate-500">
                        <strong>Last seen:</strong> {new Date(o.last_seen).toLocaleDateString()}
                      </p>
                      {isAdmin && o.status === 'open' && (
                        <button
                          onClick={() => handleResolveOutbreak(o.id)}
                          disabled={resolvingId === o.id}
                          className="mt-2 w-full py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium flex items-center justify-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" />
                          {resolvingId === o.id ? 'Resolving...' : 'Mark Resolved'}
                        </button>
                      )}
                    </div>
                  </Popup>
                </Circle>
              );
            })}

            {/* Colored CircleMarkers per Case (Issue Category) */}
            {displayedCases.map((c) => {
              const markerColor = getCategoryColor(c.issue_category);
              return (
                <CircleMarker
                  key={`case-${c.id}`}
                  center={[c.lat, c.lng]}
                  radius={7}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: markerColor,
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 text-xs min-w-[180px]">
                      <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-200">
                        <span className="font-bold text-xs text-emerald-800">Case #{c.case_number}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white uppercase"
                          style={{ backgroundColor: markerColor }}
                        >
                          {c.issue_category}
                        </span>
                      </div>
                      <div className="space-y-0.5 my-1">
                        <p>
                          <strong>Crop:</strong> {c.crop}
                        </p>
                        {c.farm_name && (
                          <p>
                            <strong>Farm:</strong> {c.farm_name}
                          </p>
                        )}
                        <p>
                          <strong>Status:</strong> {c.status}
                        </p>
                        <p className="text-slate-500">
                          <strong>Date:</strong> {new Date(c.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100">
                        <Link
                          to={`/cases/${c.id}`}
                          className="text-emerald-600 hover:text-emerald-700 font-semibold text-[11px] flex items-center gap-1"
                        >
                          View case details &rarr;
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {/* Floating Category Legend */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg text-xs max-w-xs">
            <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {t('outbreaks.legend', 'Category Legend')}
            </h4>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {Object.entries({
                Pest: CATEGORY_COLORS.pest,
                Disease: CATEGORY_COLORS.disease,
                Deficiency: CATEGORY_COLORS.deficiency,
                Weed: CATEGORY_COLORS.weed,
                Weather: CATEGORY_COLORS.weather,
                Other: CATEGORY_COLORS.other,
              }).map(([label, color]) => (
                <div key={label} className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                  <span className="text-[11px]">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 font-medium">
                <span className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500 shrink-0" />
                Alert Outbreak (≥6 farms)
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <span className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500 shrink-0" />
                Watch Outbreak (≥3 farms)
              </div>
            </div>
          </div>
        </div>

        {/* Side List of Outbreaks */}
        <div className="w-full md:w-80 lg:w-96 bg-white dark:bg-slate-900 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 z-10 overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {t('outbreaks.outbreakList', 'Active & Recent Outbreaks')} ({displayedOutbreaks.length})
            </span>
            <span className="text-xs text-slate-500">
              {cases.length} cases in {lookbackDays}d
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {displayedOutbreaks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-medium">{t('outbreaks.noOutbreaks', 'No outbreaks detected in this view.')}</p>
              </div>
            ) : (
              displayedOutbreaks.map((o) => {
                const isSelected = selectedOutbreakId === o.id;
                const isAlert = o.severity === 'alert';
                const isResolved = o.status === 'resolved';

                return (
                  <div
                    key={o.id}
                    onClick={() => focusOutbreak(o)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-l-4 border-emerald-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isResolved ? 'bg-slate-400' : isAlert ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
                          }`}
                        />
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                          {o.crop} • {o.issue_category.replace('_', ' ')}
                        </h4>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isResolved
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            : isAlert
                            ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {isResolved ? 'Resolved' : o.severity}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 my-1">
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400" />
                        <strong>{o.farm_count}</strong> farms
                      </span>
                      <span>•</span>
                      <span>
                        <strong>{o.case_count}</strong> cases
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {o.radius_km} km radius
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Last seen: {new Date(o.last_seen).toLocaleDateString()}
                      </span>
                      {isAdmin && o.status === 'open' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolveOutbreak(o.id);
                          }}
                          disabled={resolvingId === o.id}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle className="w-2.5 h-2.5" />
                          {resolvingId === o.id ? '...' : t('outbreaks.markResolved', 'Mark resolved')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutbreakMap;
