import datetime
from typing import List, Optional, Any, Dict, Union
from pydantic import BaseModel, Field, EmailStr, model_validator


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
    organic_matter_pct: Optional[float] = None
    cation_exchange_capacity: Optional[float] = None
    micronutrients: Optional[Dict[str, Any]] = None


class SoilResultCreate(SoilResultBase):
    pass


class SoilResultRead(SoilResultBase):
    id: int
    case_id: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class WeatherSnapshotRead(BaseModel):
    id: int
    case_id: int
    temp_max_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    rainfall_7d_mm: Optional[float] = None
    humidity: Optional[int] = None
    wind_kmh: Optional[float] = None
    uv_index: Optional[float] = None
    rainfall_status: Optional[str] = None
    temp_status: Optional[str] = None
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


class ReportRead(BaseModel):
    id: int
    lang: str
    headline: str
    description: str
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
    channel: str
    is_read: bool
    case_id: Optional[int] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class PromptTemplateUpdate(BaseModel):
    template: str
    title: Optional[str] = None
    subtitle: Optional[str] = None
    variables: Optional[List[str]] = None


class PromptTemplateRead(BaseModel):
    id: int
    step: str
    title: str
    subtitle: Optional[str] = None
    template: str
    variables: Optional[List[str]] = None
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


# -----------------------------
# Evaluation Overview Schema
# -----------------------------
class EvalOverviewRead(BaseModel):
    total_cases: int
    resolved_cases: int
    flagged_cases: int
    blocked_cases: int
    avg_confidence: float
    safety_score: float
    groundedness_score: float
    active_agronomists: int
    computed_at: datetime.datetime
