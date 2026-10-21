import datetime
from typing import List, Optional, Any, Dict, Union
from pydantic import BaseModel, Field, EmailStr, model_validator, field_validator


# -----------------------------
# User & Auth Schemas
# -----------------------------
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "farmer"
    language: str = "en"
    phone: Optional[str] = None
    active: bool = True
    available: bool = True
    max_open_cases: int = 5


class UserCreate(UserBase):
    firebase_uid: str


class UserRead(UserBase):
    id: int
    firebase_uid: str
    created_at: datetime.datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


class UserRegister(BaseModel):
    full_name: str
    username: str
    password: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    language: Optional[str] = "en"
    role: Optional[str] = None  # Ignored if sent by client


class UserRegisterResponse(BaseModel):
    username: str
    login_email: str


class UserMe(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    language: str = "en"
    email: Optional[str] = None
    phone: Optional[str] = None
    channel_prefs: Optional[Dict[str, Any]] = None
    available: bool = True
    max_open_cases: int = 5

    class Config:
        from_attributes = True


class AdminUserRead(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    language: str = "en"
    email: Optional[str] = None
    phone: Optional[str] = None
    channel_prefs: Optional[Dict[str, Any]] = None
    active: bool = True
    available: bool = True
    max_open_cases: int = 5
    created_at: datetime.datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


class AdminCreateAgronomist(BaseModel):
    full_name: str
    username: str
    password: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class AdminResetPassword(BaseModel):
    new_password: str


class AvailabilityUpdate(BaseModel):
    available: bool


class LanguageUpdate(BaseModel):
    language: str


# -----------------------------
# Farm & Field Schemas
# -----------------------------
class FieldBase(BaseModel):
    name: str
    acreage: float
    soil_type: Optional[str] = "Silty clay loam"
    current_crop: Optional[str] = "Dent Corn"
    crop_variety: Optional[str] = None
    last_fertilizer: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy_m: Optional[float] = None
    location_source: Optional[str] = None
    location_updated_at: Optional[datetime.datetime] = None
    timezone: Optional[str] = None


class FieldLocationUpdate(BaseModel):
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    source: Optional[str] = "gps"


class SensorLatestUpdate(BaseModel):
    soil_moisture_pct: Optional[float] = None
    n_mgkg: Optional[float] = None
    p_mgkg: Optional[float] = None
    k_mgkg: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    ph: Optional[float] = None
    leaf_wetness_pct: Optional[float] = None


class GeocodePlaceRead(BaseModel):
    name: str
    admin1: Optional[str] = None
    country: Optional[str] = None
    latitude: float
    longitude: float
    timezone: Optional[str] = None


class SensorStatusItem(BaseModel):
    key: str
    label_key: str
    status: str
    value: Optional[float] = None


class FarmerSensorRead(BaseModel):
    simulated: bool = True
    items: List[SensorStatusItem]


class AgronomistSensorRead(BaseModel):
    simulated: bool = True
    device_label: Optional[str] = None
    latest_values: Dict[str, Any] = {}
    last_24h: Dict[str, Any] = {}
    trends: Dict[str, str] = {}
    hours_leaf_wetness_ge_70: float = 0.0
    data_age_hours: float = 0.0
    stale: bool = False
    interpretation: List[Dict[str, Any]] = []
    readings: List[Dict[str, Any]] = []
    flags: List[Dict[str, Any]] = []
    report_file_url: Optional[str] = None
    field_location: Optional[Dict[str, Any]] = None
    weather_snapshot: Optional[Dict[str, Any]] = None


class FieldCreate(FieldBase):
    pass


class FieldRead(FieldBase):
    id: int
    farm_id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class FarmBase(BaseModel):
    name: str
    operator_name: str
    location: str
    total_acreage: float = 0.0
    latitude: Optional[float] = 42.0308
    longitude: Optional[float] = -93.6319
    primary_crops: Optional[List[str]] = ["Corn", "Soybean"]
    irrigation_system: Optional[str] = "Center pivot"
    is_organic: Optional[bool] = False


class FarmCreate(FarmBase):
    pass


class FarmUpdate(BaseModel):
    name: Optional[str] = None
    operator_name: Optional[str] = None
    location: Optional[str] = None
    total_acreage: Optional[float] = None
    primary_crops: Optional[List[str]] = None
    irrigation_system: Optional[str] = None
    is_organic: Optional[bool] = None


class FieldUpdate(BaseModel):
    name: Optional[str] = None
    acreage: Optional[float] = None
    soil_type: Optional[str] = None
    current_crop: Optional[str] = None
    crop_variety: Optional[str] = None
    last_fertilizer: Optional[str] = None



class FarmRead(FarmBase):
    id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime
    fields: List[FieldRead] = []

    class Config:
        from_attributes = True


# -----------------------------
# Case Schemas
# -----------------------------
class CaseCreate(BaseModel):
    farm_id: int
    field_id: int
    crop: str
    growth_stage: str
    notes: Optional[str] = None
    description: Optional[str] = None
    description_lang: Optional[str] = "en"


class CaseSubmit(BaseModel):
    description: str = Field(min_length=10)
    description_lang: Optional[str] = "en"


class CaseFileRead(BaseModel):
    id: int
    file_type: str
    file_path: str
    mime_type: str
    size_bytes: int
    original_name: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class SoilResultBase(BaseModel):
    nitrogen_ppm: Optional[float] = None
    phosphorus_ppm: Optional[float] = None
    potassium_ppm: Optional[float] = None
    ph: Optional[float] = None
    n_ppm: Optional[float] = None
    p_ppm: Optional[float] = None
    k_ppm: Optional[float] = None
    sample_date: Optional[str] = None
    needs_confirmation: bool = False
    organic_matter_pct: Optional[float] = None
    cation_exchange_capacity: Optional[float] = None
    micronutrients: Optional[Dict[str, Any]] = None


class SoilResultCreate(SoilResultBase):
    pass


class SoilPatch(BaseModel):
    n_ppm: Optional[float] = None
    p_ppm: Optional[float] = None
    k_ppm: Optional[float] = None
    ph: Optional[float] = Field(None, ge=3.0, le=10.0)
    sample_date: Optional[str] = None
    needs_confirmation: Optional[bool] = None


class SoilResultRead(SoilResultBase):
    id: int
    case_id: int
    n_value: Optional[str] = None
    n_status: Optional[str] = None
    ph_value: Optional[str] = None
    ph_status: Optional[str] = None
    pk_value: Optional[str] = None
    pk_status: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class WeatherSnapshotRead(BaseModel):
    id: int
    case_id: int
    temp_max_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    rainfall_7d_mm: Optional[float] = None
    humidity: Optional[float] = None
    wind_kmh: Optional[float] = None
    uv_index: Optional[float] = None
    rainfall_status: Optional[str] = None
    temp_status: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    fetched_at: Optional[datetime.datetime] = None
    source: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ObservationRead(BaseModel):
    id: int
    case_id: int
    description: Optional[str] = None
    label: Optional[str] = "Visual symptom"
    category: Optional[str] = "Foliar"
    confidence: float
    uncertainty: Optional[str] = "Medium"
    box_coordinates: Optional[List[float]] = None
    severity: Optional[str] = None
    note: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class RecommendationRead(BaseModel):
    id: int
    case_id: int
    rank: int
    title: Optional[str] = None
    action: Optional[str] = None
    timing: Optional[str] = None
    confidence: float
    uncertainty: str
    rag_sources: Optional[List[str]] = None
    trade_off: Optional[str] = None
    rationale: Optional[str] = None
    is_visible_to_farmer: bool = True
    chemical_name: Optional[str] = None
    chemical_dose: Optional[float] = None
    chemical_unit: Optional[str] = None
    category: Optional[str] = None
    why: Optional[str] = None
    why_line: Optional[str] = None
    evidence: Optional[str] = None
    assumptions: Optional[str] = None
    citation: Optional[str] = None
    chunk_ids: Optional[List[Union[str, int]]] = None
    created_at: datetime.datetime

    def model_post_init(self, __context: Any) -> None:
        if not self.action and self.title:
            self.action = self.title
        elif not self.title and self.action:
            self.title = self.action

    class Config:
        from_attributes = True


class GuardrailResultRead(BaseModel):
    id: int
    case_id: int
    rule_name: str
    rule_category: str
    status: str
    details: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    status: str  # 'approve' | 'approve_with_edits' | 'reject'
    notes: Optional[str] = None


class ReviewDecisionIn(BaseModel):
    decision: Optional[str] = None  # 'approve' | 'approve_with_edits' | 'reject'
    status: Optional[str] = None    # backwards-compatible alias
    edits: Optional[Dict[str, Any]] = None  # { recommendations: [{id: int, action: str}], final_suggestion: str }
    note: Optional[str] = None
    notes: Optional[str] = None     # backwards-compatible alias

    @model_validator(mode="before")
    @classmethod
    def populate_aliases(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if not values.get("decision") and values.get("status"):
                values["decision"] = values.get("status")
            if not values.get("note") and values.get("notes"):
                values["note"] = values.get("notes")
        return values


class ReviewRead(BaseModel):
    id: int
    case_id: int
    reviewer_id: int
    status: str
    notes: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ReportStepItem(BaseModel):
    title: str
    detail: str


class ReportBodyJson(BaseModel):
    what_is_happening: str
    next_steps: List[ReportStepItem] = []
    warnings: List[str] = []
    reviewed_by: str
    reviewed_at: str


class FarmerReportRead(BaseModel):
    id: int
    case_id: int
    language: str
    body_json: Dict[str, Any]
    machine_translated: bool = False
    audio_path: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ReportRead(BaseModel):
    id: int
    case_id: Optional[int] = None
    language: Optional[str] = "en"
    lang: Optional[str] = "en"
    body_json: Optional[Dict[str, Any]] = None
    machine_translated: Optional[bool] = False
    audio_path: Optional[str] = None
    headline: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    warnings: Optional[List[str]] = None
    confidence_explanation: Optional[str] = None
    audio_url: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class OutcomeFeedbackCreate(BaseModel):
    actual_diagnosis: Optional[str] = None
    treatments_applied: Optional[List[str]] = None
    yield_impact_rating: int = Field(default=5, ge=1, le=5)
    harvest_yield: Optional[float] = None
    notes: Optional[str] = None


class CaseFeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    language: Optional[str] = "en"


class OutcomeFeedbackRead(BaseModel):
    id: int
    case_id: int
    user_id: int
    agronomist_id: Optional[int] = None
    rating: int = 5
    comment: Optional[str] = None
    comment_lang: Optional[str] = "en"
    audio_path: Optional[str] = None
    actual_diagnosis: Optional[str] = None
    treatments_applied: Optional[List[str]] = None
    yield_impact_rating: int = 5
    harvest_yield: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class CaseRead(BaseModel):
    id: int
    case_number: str
    farm_id: int
    field_id: int
    user_id: int
    crop: str
    growth_stage: str
    status: str
    confidence: float
    uncertainty: str
    summary: Optional[str] = None
    description: Optional[str] = None
    description_lang: Optional[str] = "en"
    assigned_agronomist_id: Optional[int] = None
    assigned_at: Optional[datetime.datetime] = None
    reassign_count: int = 0
    farmer_summary: Optional[str] = None
    final_suggestion: Optional[str] = None
    decision_note: Optional[str] = None
    issue_label: Optional[str] = None
    issue_category: Optional[str] = None
    ai_degraded: bool = False
    farm: Optional[FarmRead] = None
    field: Optional[FieldRead] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class FarmerCaseRead(BaseModel):
    id: int
    case_number: str
    status: str
    created_at: datetime.datetime
    crop: str
    growth_stage: str
    description: Optional[str] = None
    description_lang: Optional[str] = "en"
    assigned_agronomist_name: Optional[str] = None
    farmer_summary: Optional[str] = None
    approved_recommendations: List[str] = []
    final_suggestion: Optional[str] = None
    decision_note: Optional[str] = None

    class Config:
        from_attributes = True


class CaseDetailRead(CaseRead):
    files: List[CaseFileRead] = []
    observations: List[ObservationRead] = []
    soil_results: List[SoilResultRead] = []
    weather_snapshots: List[WeatherSnapshotRead] = []
    recommendations: List[RecommendationRead] = []
    guardrail_results: List[GuardrailResultRead] = []
    reviews: List[ReviewRead] = []
    reports: List[ReportRead] = []
    outcome_feedback: Optional[OutcomeFeedbackRead] = None
    farmer_description_translated: Optional[str] = None

    class Config:
        from_attributes = True


# -----------------------------
# Messages & Translations
# -----------------------------
class MessageRead(BaseModel):
    id: int
    case_id: int
    sender_id: int
    sender_name: Optional[str] = None
    sender_role: str
    kind: str  # 'text', 'voice', 'decision', 'feedback'
    original_lang: str
    original_text: Optional[str] = None
    text: Optional[str] = None
    translated: bool = False
    audio_url: Optional[str] = None
    transcript_status: str  # 'none', 'pending', 'done', 'failed'
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# -----------------------------
# Admin Schemas
# -----------------------------
class AdminAgronomistRead(BaseModel):
    id: int
    name: Optional[str] = None
    username: str
    available: bool
    open_count: int
    max_open_cases: int
    total_reviewed: int
    avg_feedback_rating: float
    accepted_count: int = 0
    accepted_with_edits_count: int = 0
    rejected_count: int = 0
    positive_reviews_count: int = 0
    negative_reviews_count: int = 0


class AdminCaseRead(BaseModel):
    id: int
    case_number: str
    farmer_id: int
    farmer_name: Optional[str] = None
    status: str
    crop: str
    description: Optional[str] = None
    assigned_agronomist_id: Optional[int] = None
    assigned_agronomist_name: Optional[str] = None
    assigned_at: Optional[datetime.datetime] = None
    decision_note: Optional[str] = None
    final_suggestion: Optional[str] = None
    farmer_feedback_rating: Optional[int] = None
    farmer_feedback_comment: Optional[str] = None
    reassign_count: int = 0
    created_at: datetime.datetime


class AdminAgronomistUpdate(BaseModel):
    max_open_cases: Optional[int] = None
    available: Optional[bool] = None


class AdminAssignIn(BaseModel):
    agronomist_id: int


class AdminCommunicationRead(BaseModel):
    id: int
    case_id: int
    case_number: str
    farmer_id: int
    farmer_name: str
    agronomist_id: Optional[int] = None
    agronomist_name: Optional[str] = None
    sender_role: str
    kind: str
    original_text: Optional[str] = None
    text: Optional[str] = None
    audio_url: Optional[str] = None
    created_at: datetime.datetime


class AdminFeedbackRead(BaseModel):
    id: int
    case_id: int
    case_number: str
    farmer_id: int
    farmer_name: str
    agronomist_id: Optional[int] = None
    agronomist_name: Optional[str] = None
    rating: int
    comment: Optional[str] = None
    comment_translated: Optional[str] = None
    created_at: datetime.datetime


# -----------------------------
# Notification & Prompt Schemas
# -----------------------------
class NotificationRead(BaseModel):
    id: int
    user_id: int
    event: str
    title: str
    message: str
    channel: str = "in_app"
    status: str = "sent"
    error: Optional[str] = None
    attempts: int = 1
    is_read: bool = False
    case_id: Optional[int] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class NotificationPrefsUpdate(BaseModel):
    channel_prefs: Optional[Dict[str, bool]] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class OutcomeReportIn(BaseModel):
    followed_advice: bool
    outcome: str
    comment: Optional[str] = None

    @field_validator("outcome")
    @classmethod
    def validate_outcome(cls, v: str) -> str:
        if v not in ("improved", "same", "worse"):
            raise ValueError("outcome must be one of: improved, same, worse")
        return v


class AdminNotificationLogItem(BaseModel):
    id: int
    user_id: int
    username: Optional[str] = None
    event: str
    title: str
    message: str
    channel: str
    status: str
    error: Optional[str] = None
    attempts: int = 1
    is_read: bool = False
    case_id: Optional[int] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class AdminNotificationLogResponse(BaseModel):
    items: List[AdminNotificationLogItem]
    total: int
    page: int
    page_size: int


class AdminNotificationTestIn(BaseModel):
    channel: str


class PromptTemplateUpdate(BaseModel):
    template: str
    title: Optional[str] = None
    subtitle: Optional[str] = None
    variables: Optional[List[str]] = None


class PromptTemplateRead(BaseModel):
    id: int
    step: str
    version: int = 1
    is_active: bool = True
    title: str
    subtitle: Optional[str] = None
    template: str
    variables: Optional[List[str]] = None
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class RadarMetric(BaseModel):
    subject: str
    value: float
    benchmark: float = 75.0


class EvalOverviewRead(BaseModel):
    total_cases: int = 0
    resolved_cases: int = 0
    flagged_cases: int = 0
    blocked_cases: int = 0
    avg_confidence: float = 82.0
    safety_score: float = 94.0
    groundedness_score: float = 78.0
    active_agronomists: int = 4
    computed_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    # Extended benchmark fields
    latest_run: Optional[Dict[str, Any]] = None
    delta: Optional[Dict[str, str]] = None
    radar_data: List[RadarMetric] = []
    status: str = "completed"
    run_id: Optional[int] = None


class EvalRunRequest(BaseModel):
    prompt_version: int = 1
    max_cases: int = 12
    resume: bool = False
    run_id: Optional[int] = None


class GuardrailSettingsUpdate(BaseModel):
    auto_approve_confidence_threshold: float = Field(ge=0.0, le=100.0, default=80.0)
    hide_confidence_threshold: float = Field(ge=0.0, le=100.0, default=50.0)


# -----------------------------
# Alert & Weather Forecast Schemas
# -----------------------------
class WeatherAlertRead(BaseModel):
    id: int
    farm_id: int
    farm_name: Optional[str] = None
    field_id: Optional[int] = None
    field_name: Optional[str] = None
    source: str  # "weather" | "sensor"
    rule: str
    severity: str  # "info" | "warning" | "high"
    start_date: str
    title: str
    message: str
    action: str
    params: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime
    notified_at: Optional[datetime.datetime] = None
    read_at: Optional[datetime.datetime] = None
    is_demo: bool = False

    class Config:
        from_attributes = True


class AlertsListResponse(BaseModel):
    items: List[WeatherAlertRead]
    total: int
    unread_count: int
    page: int
    limit: int


class AlertJobSummary(BaseModel):
    farms_checked: int
    alerts_created: int
    failures: int
    farms_skipped: int
    details: List[Dict[str, Any]] = []


class ForecastDayItem(BaseModel):
    date: str
    temp_max_c: float
    temp_min_c: float
    precipitation_mm: float
    precipitation_probability_pct: int
    wind_speed_kmh: float
    uv_index_max: float


class FarmForecastResponse(BaseModel):
    farm_id: int
    farm_name: str
    field_id: Optional[int] = None
    field_name: Optional[str] = None
    latitude: float
    longitude: float
    is_coarsened: bool
    timezone: str
    fetched_at: str
    daily: List[ForecastDayItem]
    active_alerts_count: int = 0


# -----------------------------
# Analytics Schemas
# -----------------------------
class KpiItem(BaseModel):
    value: Optional[Union[float, int]] = None
    previous_value: Optional[Union[float, int]] = None


class CasePerDayItem(BaseModel):
    date: str
    created: int
    decided: int


class ByCropItem(BaseModel):
    crop: str
    count: int


class ByIssueCategoryItem(BaseModel):
    category: str
    count: int


class FunnelStageItem(BaseModel):
    stage: str
    label_key: str
    count: int
    drop_off_pct: float


class DecisionMix(BaseModel):
    approve: int
    approve_with_edits: int
    reject: int


class AgentStatItem(BaseModel):
    agronomist_id: int
    agronomist: str
    open: int
    reviewed: int
    avg_hours_to_decision: Optional[float] = None
    avg_rating: Optional[float] = None
    timeout_count: int
    available: bool


class RatingDistributionItem(BaseModel):
    rating: int
    count: int


class TopFarmItem(BaseModel):
    farm_id: int
    farm_name: str
    count: int


class SensorFindingItem(BaseModel):
    key: str
    label_key: str
    count: int


class AlertByRuleItem(BaseModel):
    rule: str
    count: int


class AdminAnalyticsResponse(BaseModel):
    from_date: str = Field(..., alias="from")
    to_date: str = Field(..., alias="to")
    previous_from: str
    previous_to: str
    kpis: Dict[str, KpiItem]
    cases_per_day: List[CasePerDayItem]
    by_crop: List[ByCropItem]
    by_issue_category: List[ByIssueCategoryItem]
    status_funnel: List[FunnelStageItem]
    decision_mix: DecisionMix
    ai_agreement_rate: Optional[float] = None
    agent_stats: List[AgentStatItem]
    language_mix: Dict[str, List[Dict[str, Any]]]
    rating_distribution: List[RatingDistributionItem]
    top_farms_by_cases: List[TopFarmItem]
    response_time_buckets: Dict[str, int]
    sensor_findings: List[SensorFindingItem]
    alerts_by_rule: List[AlertByRuleItem]

    class Config:
        populate_by_name = True


# -----------------------------
# Outbreak Schemas
# -----------------------------
class OutbreakRead(BaseModel):
    id: int
    issue_category: str
    crop: str
    center_lat: float
    center_lng: float
    radius_km: float
    farm_count: int
    case_count: int
    severity: str  # watch | alert
    status: str  # open | resolved
    first_seen: datetime.datetime
    last_seen: datetime.datetime
    resolved_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class OutbreakCaseItem(BaseModel):
    id: int
    case_number: str
    crop: str
    issue_category: Optional[str] = None
    status: str
    created_at: datetime.datetime
    farm_id: Optional[int] = None
    farm_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    class Config:
        from_attributes = True


class OutbreakFarmItem(BaseModel):
    farm_id: int
    farm_name: str
    operator_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    case_count: int = 1

    class Config:
        from_attributes = True


class OutbreakDetailRead(OutbreakRead):
    cases: List[OutbreakCaseItem] = []
    farms: List[OutbreakFarmItem] = []

    class Config:
        from_attributes = True


class AdminMapCaseItem(BaseModel):
    id: int
    case_number: str
    crop: str
    issue_category: str
    status: str
    date: datetime.datetime
    farm_id: Optional[int] = None
    farm_name: Optional[str] = None
    lat: float
    lng: float
    outbreak_id: Optional[int] = None

    class Config:
        from_attributes = True


class NearbyOutbreakAlert(BaseModel):
    outbreak_id: int
    issue_category: str
    crop: str
    severity: str
    radius_km: float
    distance_km: Optional[float] = None
    first_seen: datetime.datetime
    last_seen: datetime.datetime
    title: str
    message: str
    action: str

    class Config:
        from_attributes = True


# -----------------------------
# Demo Data Schemas
# -----------------------------
class AdminDemoStatusResponse(BaseModel):
    enabled: bool
    has_demo_data: bool
    counts: Dict[str, int]


class AdminDemoLoadRequest(BaseModel):
    cases: int = Field(default=30, ge=1, le=100)
    no_firebase: bool = False


class AdminDemoLoadResponse(BaseModel):
    success: bool
    message: str
    counts: Dict[str, int]


class AdminDemoResetResponse(BaseModel):
    success: bool
    message: str
    deleted: Dict[str, int]

