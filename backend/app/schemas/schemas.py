import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, EmailStr


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

    class Config:
        from_attributes = True


class FarmBase(BaseModel):
    name: str
    operator_name: str
    location: str
    total_acreage: float
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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    primary_crops: Optional[List[str]] = None
    irrigation_system: Optional[str] = None
    is_organic: Optional[bool] = None


class FarmRead(FarmBase):
    id: int
    created_at: datetime.datetime
    fields: List[FieldRead] = []

    class Config:
        from_attributes = True


# -----------------------------
# Case & Sub-Resource Schemas
# -----------------------------
class CaseCreate(BaseModel):
    farm_id: int
    field_id: int
    crop: str = "Dent Corn"
    growth_stage: str = "V8 (8-leaf)"
    notes: Optional[str] = None


class CaseFileRead(BaseModel):
    id: int
    file_type: str
    file_path: str
    file_name: str
    file_size: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ObservationRead(BaseModel):
    id: int
    description: str
    confidence: float
    uncertainty: str
    note: Optional[str] = None

    class Config:
        from_attributes = True


class SoilResultCreate(BaseModel):
    n_value: str = "14 ppm NO3-N"
    n_status: str = "Marginal"
    n_citation: Optional[str] = "ISU Ext. PM 1714"
    ph_value: str = "pH 6.2"
    ph_status: str = "Adequate"
    ph_citation: Optional[str] = "ISU Ext. PM 1688"
    pk_value: str = "P & K Sufficient"
    pk_status: str = "Adequate"


class SoilResultRead(SoilResultCreate):
    id: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class WeatherSnapshotRead(BaseModel):
    id: int
    temp_max_c: float
    temp_min_c: float
    rainfall_7d_mm: float
    humidity: float
    wind_kmh: float
    uv_index: float
    rainfall_status: str
    temp_status: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class RecommendationRead(BaseModel):
    id: int
    rank: int
    category: str
    title: str
    confidence: float
    uncertainty: str
    evidence: Optional[str] = None
    assumptions: Optional[str] = None
    why_line: Optional[str] = None
    citation: Optional[str] = None
    is_visible_to_farmer: bool = True
    chemical_name: Optional[str] = None
    chemical_dose: Optional[float] = None
    chemical_unit: Optional[str] = None

    class Config:
        from_attributes = True


class GuardrailResultRead(BaseModel):
    id: int
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
    actual_diagnosis: str
    treatments_applied: List[str]
    yield_impact_rating: int = Field(ge=1, le=5)
    harvest_yield: Optional[float] = None
    notes: Optional[str] = None


class OutcomeFeedbackRead(BaseModel):
    id: int
    case_id: int
    actual_diagnosis: str
    treatments_applied: Optional[List[str]] = None
    yield_impact_rating: int
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
    farm: Optional[FarmRead] = None
    field: Optional[FieldRead] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

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

    class Config:
        from_attributes = True


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
