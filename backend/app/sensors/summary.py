import datetime
from typing import List, Dict, Any, Optional
from app.core.config import settings


METRIC_NAMES = [
    "soil_moisture_pct",
    "n_mgkg",
    "p_mgkg",
    "k_mgkg",
    "temp_c",
    "humidity_pct",
    "ph",
    "leaf_wetness_pct",
]


def calculate_slope(x_vals: List[float], y_vals: List[float]) -> float:
    """Calculates linear regression slope (dy/dx)."""
    n = len(x_vals)
    if n < 2:
        return 0.0
    mean_x = sum(x_vals) / n
    mean_y = sum(y_vals) / n
    denom = sum((x - mean_x) ** 2 for x in x_vals)
    if denom == 0:
        return 0.0
    numer = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_vals, y_vals))
    return numer / denom


def get_trend_label(metric: str, slope: float) -> str:
    """Determines rising|falling|stable based on metric slope per hour."""
    thresholds = {
        "soil_moisture_pct": 0.1,
        "temp_c": 0.25,
        "humidity_pct": 0.5,
        "ph": 0.02,
        "n_mgkg": 0.2,
        "p_mgkg": 0.2,
        "k_mgkg": 0.2,
        "leaf_wetness_pct": 0.5,
    }
    thresh = thresholds.get(metric, 0.1)
    if slope > thresh:
        return "rising"
    elif slope < -thresh:
        return "falling"
    return "stable"


def compute_sensor_summary(
    readings: List[Dict[str, Any]],
    submission_time: Optional[datetime.datetime] = None,
    timezone_str: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes summary metrics, 24h stats, trends, leaf wetness hours, and staleness.
    """
    if not readings:
        return {
            "latest_values": {},
            "last_24h": {},
            "trends": {},
            "hours_leaf_wetness_ge_70": 0.0,
            "data_age_hours": 0.0,
            "stale": False,
        }

    def get_reading_dt(r):
        dt_val = r.get("measured_at") or r.get("timestamp")
        if isinstance(dt_val, datetime.datetime):
            return dt_val
        s = str(dt_val).strip()
        try:
            return datetime.datetime.fromisoformat(s)
        except Exception:
            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%d-%m-%Y %H:%M:%S",
                "%d-%m-%Y %H:%M",
                "%d/%m/%Y %H:%M:%S",
                "%d/%m/%Y %H:%M",
            ):
                try:
                    return datetime.datetime.strptime(s, fmt)
                except ValueError:
                    continue
            return datetime.datetime.now(datetime.timezone.utc)

    sorted_readings = sorted(readings, key=get_reading_dt)

    latest_reading = sorted_readings[-1]
    latest_dt = get_reading_dt(latest_reading)

    if latest_dt.tzinfo is not None:
        latest_dt_utc = latest_dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    else:
        latest_dt_utc = latest_dt

    # Latest values
    latest_values: Dict[str, Any] = {
        "measured_at": latest_dt.isoformat(),
    }
    for m in METRIC_NAMES:
        # Find the most recent non-null value for metric
        val = None
        for r in reversed(sorted_readings):
            if r.get(m) is not None:
                val = r[m]
                break
        latest_values[m] = val

    # Last 24 hours readings
    window_start = latest_dt - datetime.timedelta(hours=24)
    r_24h = [
        r for r in sorted_readings
        if get_reading_dt(r) >= window_start
    ]
    if not r_24h:
        r_24h = sorted_readings[-24:] if len(sorted_readings) >= 24 else sorted_readings

    last_24h_stats: Dict[str, Any] = {}
    trends: Dict[str, str] = {}

    t0 = get_reading_dt(sorted_readings[0])

    for m in METRIC_NAMES:
        vals_24h = [float(r[m]) for r in r_24h if r.get(m) is not None]
        if vals_24h:
            last_24h_stats[m] = {
                "mean": round(sum(vals_24h) / len(vals_24h), 1),
                "min": round(min(vals_24h), 1),
                "max": round(max(vals_24h), 1),
            }
        else:
            last_24h_stats[m] = {"mean": None, "min": None, "max": None}

        # Trend over full series (or 24h)
        series_points = []
        for r in sorted_readings:
            val = r.get(m)
            if val is not None:
                rdt = get_reading_dt(r)
                hours_offset = (rdt - t0).total_seconds() / 3600.0
                series_points.append((hours_offset, float(val)))

        if len(series_points) >= 2:
            xs = [p[0] for p in series_points]
            ys = [p[1] for p in series_points]
            slope = calculate_slope(xs, ys)
            trends[m] = get_trend_label(m, slope)
        else:
            trends[m] = "stable"

    # Hours with leaf wetness >= 70 in the last 24h
    hours_leaf_wetness_ge_70 = 0.0
    for r in r_24h:
        lw = r.get("leaf_wetness_pct")
        if lw is not None and float(lw) >= 70.0:
            # Each reading represents approximately 1 hour or fraction
            hours_leaf_wetness_ge_70 += 1.0

    # Data age
    if submission_time is None:
        submission_time = datetime.datetime.now(datetime.timezone.utc)
    if submission_time.tzinfo is not None:
        sub_utc = submission_time.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    else:
        sub_utc = submission_time

    data_age_hours = max(0.0, round((sub_utc - latest_dt_utc).total_seconds() / 3600.0, 1))

    stale_hours_threshold = getattr(settings, "SENSOR_STALE_HOURS", 48)
    is_stale = data_age_hours > stale_hours_threshold

    return {
        "latest": latest_values,
        "latest_values": latest_values,
        "last_24h": last_24h_stats,
        "stats_24h": last_24h_stats,
        "trends": trends,
        "hours_leaf_wetness_ge_70": round(hours_leaf_wetness_ge_70, 1),
        "hours_leaf_wetness_ge_70_24h": round(hours_leaf_wetness_ge_70, 1),
        "data_age_hours": data_age_hours,
        "stale": is_stale,
    }

