import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';

// Lazy load Leaflet Map Container
const MapContainerInner = lazy(() => import('./MapContainerInner'));

export interface LocationData {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  source: 'gps' | 'map' | 'search';
  timezone?: string;
  name?: string;
}

interface LocationPickerProps {
  fieldId?: string | number | null;
  initialLat?: number | null;
  initialLng?: number | null;
  initialAccuracyM?: number | null;
  onLocationConfirmed?: (loc: LocationData) => void;
  className?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  fieldId,
  initialLat = 12.9716, // Default fallback (e.g. Karnataka agricultural zone)
  initialLng = 77.5946,
  initialAccuracyM = null,
  onLocationConfirmed,
  className = '',
}) => {
  const { t } = useTranslation();

  const [lat, setLat] = useState<number>(initialLat || 12.9716);
  const [lng, setLng] = useState<number>(initialLng || 77.5946);
  const [accuracyM, setAccuracyM] = useState<number | null>(initialAccuracyM || null);
  const [source, setSource] = useState<'gps' | 'map' | 'search'>('search');

  // Status and UI state
  const [isLocating, setIsLocating] = useState(false);
  const [locatingStatus, setLocatingStatus] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedSuccess, setConfirmedSuccess] = useState(false);

  // Place Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{
      name: string;
      latitude: number;
      longitude: number;
      country?: string;
      admin1?: string;
      display_name?: string;
    }>
  >([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Initialize from props if updated
  useEffect(() => {
    if (initialLat && initialLng && initialLat !== 0 && initialLng !== 0) {
      setLat(initialLat);
      setLng(initialLng);
      if (initialAccuracyM) setAccuracyM(initialAccuracyM);
    }
  }, [initialLat, initialLng, initialAccuracyM]);

  // Handle Current Location with High Accuracy + 15s Timeout + Fallback Retry
  const handleUseCurrentLocation = useCallback(() => {
    setLocationError(null);
    setConfirmedSuccess(false);

    // 1. Check secure context
    if (
      typeof window !== 'undefined' &&
      window.isSecureContext === false &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setLocationError(
        t(
          'location.insecureContext',
          'GPS location requires a secure HTTPS connection. Please search your village or pin your field on the map.'
        )
      );
      return;
    }

    if (!navigator.geolocation) {
      setLocationError(
        t('location.positionUnavailable', 'Geolocation hardware is not supported by your browser.')
      );
      return;
    }

    setIsLocating(true);
    setLocatingStatus(t('location.gettingLocation', 'Acquiring GPS fix (high accuracy)...'));

    // High accuracy request with 15s timeout
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        setAccuracyM(Math.round(accuracy));
        setSource('gps');
        setIsLocating(false);
        setLocatingStatus(null);
      },
      (err) => {
        // If high accuracy times out, retry once with enableHighAccuracy: false
        if (err.code === err.TIMEOUT) {
          setLocatingStatus(t('location.timeoutRetry', 'GPS timed out. Retrying with cell/network location...'));
          navigator.geolocation.getCurrentPosition(
            (pos2) => {
              const { latitude, longitude, accuracy } = pos2.coords;
              setLat(latitude);
              setLng(longitude);
              setAccuracyM(Math.round(accuracy));
              setSource('gps');
              setIsLocating(false);
              setLocatingStatus(null);
            },
            (err2) => {
              setIsLocating(false);
              setLocatingStatus(null);
              handleGeolocationError(err2);
            },
            { enableHighAccuracy: false, timeout: 15000 }
          );
        } else {
          setIsLocating(false);
          setLocatingStatus(null);
          handleGeolocationError(err);
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [t]);

  const handleGeolocationError = (err: GeolocationPositionError) => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setLocationError(
          t(
            'location.permissionDenied',
            'Location access was denied. Please allow GPS permissions in your browser or search your village below.'
          )
        );
        break;
      case err.POSITION_UNAVAILABLE:
        setLocationError(
          t(
            'location.positionUnavailable',
            'Position is currently unavailable. Please search for your village or tap your field on the map.'
          )
        );
        break;
      case err.TIMEOUT:
        setLocationError(
          t(
            'location.timeout',
            'GPS request timed out. Please search for your nearest town or pin your field manually.'
          )
        );
        break;
      default:
        setLocationError(t('location.unknownError', 'Could not detect position. Please use the search bar or map.'));
        break;
    }
  };

  // Dragging pin or tapping map moves pin and sets source to 'map'
  const handlePinMoved = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setSource('map');
    // Once farmer manually adjusts the pin, clear low-accuracy warning
    setAccuracyM(null);
    setConfirmedSuccess(false);
  };

  // Place Geocoding Search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 2) return;

    setIsSearching(true);
    setLocationError(null);
    try {
      const places = await casesApi.geocode(query);
      setSearchResults(places || []);
      setShowSearchResults(true);
      if (!places || places.length === 0) {
        setLocationError(t('location.noResults', 'No places found. Try a different town or village name.'));
      }
    } catch (err: any) {
      console.warn('Geocoding search failed:', err);
      setLocationError(t('location.searchFailed', 'Place search is temporarily unavailable. Please tap the map.'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPlace = (place: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
    display_name?: string;
  }) => {
    setLat(place.latitude);
    setLng(place.longitude);
    setAccuracyM(null);
    setSource('search');
    setShowSearchResults(false);
    setSearchQuery(place.display_name || `${place.name}, ${place.admin1 || ''}`);
    setConfirmedSuccess(false);
  };

  // Confirm Location (calls PUT /fields/{id}/location if fieldId provided, or returns data to parent)
  const handleConfirmLocation = async () => {
    setIsConfirming(true);
    setLocationError(null);
    try {
      let timezoneStr: string | undefined;

      if (fieldId) {
        const res = await casesApi.updateFieldLocation(fieldId, {
          lat,
          lng,
          accuracy_m: accuracyM || undefined,
          source,
        });
        timezoneStr = res?.timezone;
      }

      setConfirmedSuccess(true);
      if (onLocationConfirmed) {
        onLocationConfirmed({
          lat,
          lng,
          accuracy_m: accuracyM,
          source,
          timezone: timezoneStr,
          name: searchQuery,
        });
      }
    } catch (err: any) {
      console.error('Failed to confirm field location:', err);
      setLocationError(err.message || 'Failed to save field location. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const isLowAccuracy = accuracyM !== null && accuracyM > 100;

  return (
    <div className={`p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('location.fieldLocation', 'Field Location')}
            </h3>
            <span className="text-[11px] text-slate-400">
              {t('location.neededForWeather', 'Required for live rainfall, temperature, and local crop advisory')}
            </span>
          </div>
        </div>

        {confirmedSuccess && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('location.confirmedSuccess', 'Location Confirmed')}</span>
          </span>
        )}
      </div>

      {/* Prominent "Use My Current Location" Button */}
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={isLocating}
        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white font-extrabold text-sm shadow-md transition flex items-center justify-center gap-2.5 disabled:opacity-50"
      >
        {isLocating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{locatingStatus || t('location.gettingLocation', 'Acquiring GPS fix...')}</span>
          </>
        ) : (
          <>
            <Navigation className="w-5 h-5 text-emerald-200 fill-emerald-200" />
            <span>{t('location.useGps', 'Use My Current Location')}</span>
          </>
        )}
      </button>

      {/* Error & Warning Banners */}
      {locationError && (
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
          <span>{locationError}</span>
        </div>
      )}

      {isLowAccuracy && (
        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span>
            {t(
              'location.lowAccuracyWarning',
              `GPS accuracy is ±${accuracyM}m. Move the pin to your exact field on the map.`
            )}
          </span>
        </div>
      )}

      {/* Geocoding Search Fallback */}
      <div className="relative">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('location.searchPlaceholder', 'Or search village, town, or district...')}
              className="w-full text-xs pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || searchQuery.trim().length < 2}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition disabled:opacity-40"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : t('location.searchBtn', 'Search')}
          </button>
        </form>

        {/* Dropdown with search results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {searchResults.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPlace(p)}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                  <span className="text-[11px] text-slate-400 ml-1.5">
                    {[p.admin1, p.country].filter(Boolean).join(', ')}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {p.latitude.toFixed(2)}, {p.longitude.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Map with draggable marker & accuracy circle */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner">
        <Suspense
          fallback={
            <div className="h-[260px] bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span>{t('location.loadingMap', 'Loading satellite map...')}</span>
            </div>
          }
        >
          <MapContainerInner
            lat={lat}
            lng={lng}
            accuracyM={accuracyM}
            onPositionChange={handlePinMoved}
            height="260px"
          />
        </Suspense>

        {/* Floating map hint */}
        <div className="absolute bottom-2 left-2 right-2 pointer-events-none z-10 flex justify-center">
          <span className="px-3 py-1 rounded-full bg-slate-900/80 text-white text-[10px] font-medium backdrop-blur-sm shadow flex items-center gap-1.5">
            <Info className="w-3 h-3 text-emerald-400" />
            <span>{t('location.dragPinHint', 'Drag the green pin or tap anywhere to fine-tune your field boundary.')}</span>
          </span>
        </div>
      </div>

      {/* Coordinates readout and Confirm Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
          <span>
            {lat.toFixed(5)}°, {lng.toFixed(5)}°
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400">({source})</span>
          {accuracyM && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">±{accuracyM}m</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleConfirmLocation}
          disabled={isConfirming || (lat === 0 && lng === 0)}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow transition flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {isConfirming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Location...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>{t('location.confirmLocation', 'Confirm Field Location')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default LocationPicker;
