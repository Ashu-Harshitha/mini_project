import httpx
import logging
import datetime
from typing import Dict, Any, List, Optional, Tuple
from app.core.config import settings

logger = logging.getLogger("agriadvisor.weather")

# In-memory cache for weather snapshots: (lat_2dec, lng_2dec) -> (data, fetched_at)
_WEATHER_CACHE: Dict[Tuple[float, float], Tuple[Dict[str, Any], datetime.datetime]] = {}

# In-memory cache for geocoding queries: query_str -> (results, fetched_at)
_GEOCODE_CACHE: Dict[str, Tuple[List[Dict[str, Any]], datetime.datetime]] = {}


def coarsen(lat: float, lng: float, decimals: int = 1) -> Tuple[float, float]:
    """Coarsens GPS coordinates for privacy protection."""
    return round(float(lat), decimals), round(float(lng), decimals)


async def fetch_open_meteo_weather(
    lat: float,
    lng: float,
    force_refresh: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Fetches weather telemetry from Open-Meteo forecast API:
    - current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation
    - daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max
    - past_days=7
    - forecast_days=3
    - timezone=auto

    Caches by coordinates rounded to 2 decimals for WEATHER_CACHE_MINUTES.
    Performs 1 retry on failure. Returns None on complete failure.
    """
    coord_key = (round(float(lat), 2), round(float(lng), 2))
    cache_ttl_min = getattr(settings, "WEATHER_CACHE_MINUTES", 30)
    now = datetime.datetime.now(datetime.timezone.utc)

    # Check cache
    if not force_refresh and coord_key in _WEATHER_CACHE:
        cached_data, cached_time = _WEATHER_CACHE[coord_key]
        if (now - cached_time).total_seconds() < cache_ttl_min * 60:
            logger.info(f"Serving cached weather for coordinates {coord_key}")
            return cached_data

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        f"&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
        f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max"
        f"&past_days=7"
        f"&forecast_days=3"
        f"&timezone=auto"
    )

    last_exc = None
    for attempt in range(2):  # 1 initial try + 1 retry
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    daily = data.get("daily", {})
                    current = data.get("current", {})
                    tz_name = data.get("timezone", "UTC")

                    # daily data contains past_days=7 + current day + forecast_days=3
                    precip_sums = daily.get("precipitation_sum", [])
                    # past 7 days rain: sum of first 7 items
                    past_7d_precip = precip_sums[:7] if len(precip_sums) >= 7 else precip_sums
                    rain_7d = round(float(sum(past_7d_precip)), 1) if past_7d_precip else 0.0

                    # Tmax & Tmin for current / recent day
                    tmax_list = daily.get("temperature_2m_max", [28.0])
                    tmin_list = daily.get("temperature_2m_min", [16.0])
                    # Current day index is 7 (since past_days=7)
                    curr_day_idx = 7 if len(tmax_list) > 7 else 0
                    tmax = float(tmax_list[curr_day_idx])
                    tmin = float(tmin_list[curr_day_idx])

                    humidity = float(current.get("relative_humidity_2m", 65.0))
                    wind = float(current.get("wind_speed_10m", 15.0))
                    uv_list = daily.get("uv_index_max", [6.0])
                    uv = float(uv_list[curr_day_idx] if len(uv_list) > curr_day_idx else uv_list[0])

                    result = {
                        "temp_max_c": tmax,
                        "temp_min_c": tmin,
                        "rainfall_7d_mm": rain_7d,
                        "humidity": humidity,
                        "wind_kmh": wind,
                        "uv_index": uv,
                        "rainfall_status": "Below Average" if rain_7d < 25.0 else "Optimal",
                        "temp_status": "Optimal" if 15.0 <= tmax <= 32.0 else "Stress",
                        "lat": float(lat),
                        "lng": float(lng),
                        "timezone": tz_name,
                        "source": "api",
                        "fetched_at": now.isoformat(),
                        "raw_data": data,
                    }

                    _WEATHER_CACHE[coord_key] = (result, now)
                    return result
                else:
                    last_exc = Exception(f"HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            last_exc = e
            logger.warning(f"Open-Meteo attempt {attempt + 1} failed: {e}")

    logger.error(f"Open-Meteo weather fetch failed after retry: {last_exc}")
    return None


async def geocode_open_meteo(query: str) -> List[Dict[str, Any]]:
    """
    Proxies free Open-Meteo Geocoding API, caches results, returns at most 5 places.
    """
    clean_q = (query or "").strip().lower()
    if not clean_q or len(clean_q) < 2:
        return []

    now = datetime.datetime.now(datetime.timezone.utc)
    # Check cache (1 hour TTL)
    if clean_q in _GEOCODE_CACHE:
        cached_results, cached_time = _GEOCODE_CACHE[clean_q]
        if (now - cached_time).total_seconds() < 3600:
            return cached_results

    url = (
        f"https://geocoding-api.open-meteo.com/v1/search"
        f"?name={httpx.URL('', params={'q': clean_q}).params['q']}"
        f"&count=5"
        f"&language=en"
        f"&format=json"
    )

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                raw_results = data.get("results", []) or []
                places = []
                for p in raw_results[:5]:
                    places.append({
                        "name": p.get("name", ""),
                        "admin1": p.get("admin1") or p.get("country_code", ""),
                        "country": p.get("country", ""),
                        "latitude": float(p.get("latitude", 0.0)),
                        "longitude": float(p.get("longitude", 0.0)),
                        "timezone": p.get("timezone", "UTC"),
                    })
                _GEOCODE_CACHE[clean_q] = (places, now)
                return places
    except Exception as e:
        logger.warning(f"Geocoding request failed: {e}")

    return []
