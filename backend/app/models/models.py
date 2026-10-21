import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Text,
    JSON,
    Index,
    UniqueConstraint,
    Table,
    text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_users_single_admin",
            "role",
            unique=True,
            postgresql_where=text("role = 'admin'"),
            sqlite_where=text("role = 'admin'"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    firebase_uid = Column(String(128), unique=True, index=True, nullable=False)
    email = Column(String(255), nullable=True)  # Contact email (optional)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="farmer", nullable=False)  # 'farmer', 'agronomist', 'admin'
    phone = Column(String(50), nullable=True)
    language = Column(String(10), default="en", nullable=False)  # 'en', 'hi', 'kn'
    channel_prefs = Column(JSON, default=lambda: {"email": True, "whatsapp": False, "sms": False}, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    available = Column(Boolean, default=True, nullable=False)
    max_open_cases = Column(Integer, default=5, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    last_assigned_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    cases = relationship("Case", foreign_keys="Case.user_id", back_populates="user")
    assigned_cases = relationship("Case", foreign_keys="Case.assigned_agronomist_id", back_populates="assigned_agronomist")
    reviews = relationship("Review", back_populates="reviewer")
    notifications = relationship("Notification", back_populates="user")


class Farm(Base):
    __tablename__ = "farms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    operator_name = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    total_acreage = Column(Float, nullable=False, default=0.0)
    latitude = Column(Float, nullable=True, default=42.0308)  # Default Ames, Iowa
    longitude = Column(Float, nullable=True, default=-93.6319)
    primary_crops = Column(JSON, nullable=True, default=list)  # ["Corn", "Soybean"]
    irrigation_system = Column(String(100), default="Center pivot")
    is_organic = Column(Boolean, default=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    last_weather_check_at = Column(DateTime, nullable=True)

    fields = relationship("Field", back_populates="farm", cascade="all, delete-orphan")
    cases = relationship("Case", back_populates="farm")
    alerts = relationship("WeatherAlert", back_populates="farm", cascade="all, delete-orphan")


class Field(Base):
    __tablename__ = "fields"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    acreage = Column(Float, nullable=False, default=0.0)
    soil_type = Column(String(100), nullable=True)
    current_crop = Column(String(100), nullable=True)
    crop_variety = Column(String(100), nullable=True)
    last_fertilizer = Column(String(255), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    accuracy_m = Column(Float, nullable=True)
    location_source = Column(String(50), nullable=True)  # gps|map|search
    location_updated_at = Column(DateTime, nullable=True)
    timezone = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    farm = relationship("Farm", back_populates="fields")
    cases = relationship("Case", back_populates="field")
    sensor_reports = relationship("SensorReport", back_populates="field", cascade="all, delete-orphan")
    alerts = relationship("WeatherAlert", back_populates="field")


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String(50), unique=True, index=True, nullable=False)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    field_id = Column(Integer, ForeignKey("fields.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    crop = Column(String(100), nullable=False)
    growth_stage = Column(String(50), nullable=False)
    status = Column(String(50), default="DRAFT", index=True, nullable=False)
    # Statuses: DRAFT -> ANALYZING -> ANALYZED -> PENDING_REVIEW -> APPROVED | APPROVED_WITH_EDITS | REJECTED -> DELIVERED -> OUTCOME_REPORTED | BLOCKED
    confidence = Column(Float, default=0.0)
    uncertainty = Column(String(20), default="Medium")  # Low, Medium, High
    summary = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    description_lang = Column(String(10), default="en", nullable=True)
    assigned_agronomist_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    reassign_count = Column(Integer, default=0, nullable=False)
    farmer_summary = Column(Text, nullable=True)
    final_suggestion = Column(Text, nullable=True)
    decision_note = Column(Text, nullable=True)
    issue_label = Column(Text, nullable=True)
    issue_category = Column(String(50), nullable=True)  # nitrogen_deficiency|nutrient_other|fungal_disease|bacterial_disease|pest_damage|water_stress|weed_pressure|healthy|other
    ai_degraded = Column(Boolean, default=False, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    sensor_summary = Column(JSON, nullable=True)
    location_snapshot = Column(JSON, nullable=True)  # {lat, lng, accuracy_m, source}
    weather_source = Column(String(50), nullable=True, default="none")  # api|none
    feedback_reminders_sent = Column(Integer, default=0, nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    farm = relationship("Farm", back_populates="cases")
    field = relationship("Field", back_populates="cases")
    user = relationship("User", foreign_keys=[user_id], back_populates="cases")
    assigned_agronomist = relationship("User", foreign_keys=[assigned_agronomist_id], back_populates="assigned_cases")
    files = relationship("CaseFile", back_populates="case", cascade="all, delete-orphan")
    observations = relationship("Observation", back_populates="case", cascade="all, delete-orphan")
    soil_results = relationship("SoilResult", back_populates="case", cascade="all, delete-orphan")
    sensor_reports = relationship("SensorReport", back_populates="case", cascade="all, delete-orphan")
    sensor_readings = relationship("SensorReading", back_populates="case", cascade="all, delete-orphan")
    weather_snapshots = relationship("WeatherSnapshot", back_populates="case", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="case", cascade="all, delete-orphan")
    guardrail_results = relationship("GuardrailResult", back_populates="case", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="case", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="case", cascade="all, delete-orphan")
    outcome_feedback = relationship("OutcomeFeedback", back_populates="case", uselist=False, cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="case", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="case", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="case", cascade="all, delete-orphan")
    outbreaks = relationship("Outbreak", secondary="outbreak_cases", back_populates="cases")


class CaseFile(Base):
    __tablename__ = "case_files"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    file_type = Column(String(50), nullable=False)  # 'crop_image', 'soil_report', 'leaf_macro'
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, default=0)
    mime_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="files")


class Observation(Base):
    __tablename__ = "observations"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(500), nullable=False)
    confidence = Column(Float, default=0.0)
    uncertainty = Column(String(20), default="Medium")
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="observations")


class SoilResult(Base):
    __tablename__ = "soil_results"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    n_value = Column(String(100), nullable=False)  # e.g. "14 ppm NO3-N"
    n_status = Column(String(50), default="Marginal")
    n_citation = Column(String(255), nullable=True)
    ph_value = Column(String(100), default="pH 6.2")
    ph_status = Column(String(50), default="Adequate")
    ph_citation = Column(String(255), nullable=True)
    pk_value = Column(String(100), default="Optimal")
    pk_status = Column(String(50), default="Adequate")
    n_ppm = Column(Float, nullable=True)
    p_ppm = Column(Float, nullable=True)
    k_ppm = Column(Float, nullable=True)
    ph = Column(Float, nullable=True)
    sample_date = Column(String(50), nullable=True)
    needs_confirmation = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="soil_results")


class WeatherSnapshot(Base):
    __tablename__ = "weather_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    temp_max_c = Column(Float, nullable=False)
    temp_min_c = Column(Float, nullable=False)
    rainfall_7d_mm = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    wind_kmh = Column(Float, nullable=False)
    uv_index = Column(Float, nullable=False)
    rainfall_status = Column(String(50), default="Below Average")
    temp_status = Column(String(50), default="Optimal")
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    fetched_at = Column(DateTime, nullable=True)
    source = Column(String(50), nullable=True, default="open-meteo")
    raw_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="weather_snapshots")


class SensorReport(Base):
    __tablename__ = "sensor_reports"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    field_id = Column(Integer, ForeignKey("fields.id", ondelete="CASCADE"), nullable=True)
    file_path = Column(String(500), nullable=True)
    parse_method = Column(String(50), nullable=False)  # regex|table|gemini|manual
    is_simulated = Column(Boolean, default=True, nullable=False)
    device_label = Column(String(100), nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    rows_count = Column(Integer, default=0, nullable=False)
    warnings = Column(JSON, nullable=True, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)

    case = relationship("Case", back_populates="sensor_reports")
    field = relationship("Field", back_populates="sensor_reports")
    readings = relationship("SensorReading", back_populates="sensor_report", cascade="all, delete-orphan")


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (
        Index("ix_sensor_readings_case_id_measured_at", "case_id", "measured_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sensor_report_id = Column(Integer, ForeignKey("sensor_reports.id", ondelete="CASCADE"), nullable=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    measured_at = Column(DateTime, nullable=False)
    soil_moisture_pct = Column(Float, nullable=True)
    n_mgkg = Column(Float, nullable=True)
    p_mgkg = Column(Float, nullable=True)
    k_mgkg = Column(Float, nullable=True)
    temp_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    ph = Column(Float, nullable=True)
    leaf_wetness_pct = Column(Float, nullable=True)

    sensor_report = relationship("SensorReport", back_populates="readings")
    case = relationship("Case", back_populates="sensor_readings")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(50), nullable=False)  # 'Crop', 'Fertilizer', 'Irrigation'
    title = Column(String(255), nullable=False)
    confidence = Column(Float, nullable=False)
    uncertainty = Column(String(20), default="Medium")
    evidence = Column(Text, nullable=True)
    assumptions = Column(Text, nullable=True)
    why = Column(Text, nullable=True)
    why_line = Column(Text, nullable=True)
    citation = Column(String(255), nullable=True)
    chunk_ids = Column(JSON, default=list, nullable=True)
    rank = Column(Integer, default=1)
    is_visible_to_farmer = Column(Boolean, default=True)
    chemical_name = Column(String(100), nullable=True)
    chemical_dose = Column(Float, nullable=True)
    chemical_unit = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="recommendations")

    @property
    def action(self) -> str:
        return self.title

    @action.setter
    def action(self, value: str):
        self.title = value


class GuardrailResult(Base):
    __tablename__ = "guardrail_results"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    rule_name = Column(String(255), nullable=False)
    rule_category = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False)  # 'PASSED', 'FLAGGED', 'BLOCKED'
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="guardrail_results")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False)  # 'APPROVED', 'APPROVED_WITH_EDITS', 'REJECTED'
    decision = Column(String(50), nullable=True)
    decided_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("case_id", "language", name="uq_reports_case_id_language"),
    )

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    language = Column(String(10), default="en", nullable=False)
    body_json = Column(JSON, nullable=False)
    machine_translated = Column(Boolean, default=False, nullable=False)
    audio_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Legacy fields kept for backwards compatibility
    lang = Column(String(10), default="en", nullable=True)
    headline = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    steps = Column(JSON, nullable=True)
    warnings = Column(JSON, nullable=True)
    confidence_explanation = Column(Text, nullable=True)
    audio_url = Column(String(500), nullable=True)

    case = relationship("Case", back_populates="reports")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event = Column(String(100), nullable=False)  # 'high_risk_flag', 'review_required', 'case_approved', 'feedback_reminder'
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    channel = Column(String(50), default="in_app", nullable=False)  # 'in_app', 'email', 'sms', 'whatsapp'
    status = Column(String(50), default="sent", nullable=False)  # 'sent', 'failed', 'skipped', 'read'
    error = Column(Text, nullable=True)
    attempts = Column(Integer, default=1, nullable=False)
    is_read = Column(Boolean, default=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="notifications")


class OutcomeFeedback(Base):
    __tablename__ = "outcome_feedback"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    agronomist_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rating = Column(Integer, default=5, nullable=False)  # 1-5
    comment = Column(Text, nullable=True)
    comment_lang = Column(String(10), default="en", nullable=True)
    audio_path = Column(String(500), nullable=True)
    actual_diagnosis = Column(String(255), nullable=True)
    treatments_applied = Column(JSON, nullable=True)  # ["..."]
    yield_impact_rating = Column(Integer, default=5)  # 1-5
    harvest_yield = Column(Float, nullable=True)  # bu/ac or kg/ha
    notes = Column(Text, nullable=True)
    followed_advice = Column(Boolean, nullable=True)
    outcome = Column(String(50), nullable=True)  # 'improved', 'same', 'worse'
    outcome_comment = Column(Text, nullable=True)
    outcome_reported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="outcome_feedback")
    user = relationship("User", foreign_keys=[user_id])
    agronomist = relationship("User", foreign_keys=[agronomist_id])


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    from_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    to_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason = Column(String(50), nullable=False)  # 'auto', 'continuity', 'timeout', 'admin'
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="assignments")
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sender_role = Column(String(50), nullable=False)  # 'farmer', 'agronomist', 'admin'
    kind = Column(String(50), default="text", nullable=False)  # 'text', 'voice', 'decision', 'feedback'
    original_lang = Column(String(10), default="en", nullable=False)
    original_text = Column(Text, nullable=True)
    audio_path = Column(String(500), nullable=True)
    transcript_status = Column(String(50), default="none", nullable=False)  # 'none', 'pending', 'done', 'failed'
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True, nullable=False)

    case = relationship("Case", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    translations = relationship("MessageTranslation", back_populates="message", cascade="all, delete-orphan")


class MessageTranslation(Base):
    __tablename__ = "message_translations"
    __table_args__ = (
        UniqueConstraint("message_id", "lang", name="uq_message_translation_lang"),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    lang = Column(String(10), nullable=False)
    text = Column(Text, nullable=False)

    message = relationship("Message", back_populates="translations")


class ChemicalRule(Base):
    __tablename__ = "chemical_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    chemical_name = Column(String(255), nullable=False, index=True)
    max_rate = Column(Float, nullable=False)
    unit = Column(String(50), nullable=False)
    stage_window = Column(String(100), default="Any")
    organic_allowed = Column(Boolean, default=False)
    requires_agronomist = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    step = Column(String(50), index=True, nullable=False)  # 'image_analysis', 'recommendation', 'safety_check', 'environmental'
    version = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    title = Column(String(255), nullable=False)
    subtitle = Column(String(255), nullable=True)
    template = Column(Text, nullable=False)
    variables = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    from_state = Column(String(50), nullable=True)
    to_state = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="audit_logs")


class LLMCall(Base):
    __tablename__ = "llm_calls"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="SET NULL"), nullable=True, index=True)
    step = Column(String(50), index=True, nullable=False)
    prompt_version = Column(Integer, default=1, nullable=False)
    model = Column(String(100), nullable=False)
    tokens_in = Column(Integer, default=0, nullable=False)
    tokens_out = Column(Integer, default=0, nullable=False)
    latency_ms = Column(Integer, default=0, nullable=False)
    output_json = Column(JSON, nullable=False)
    cache_key = Column(String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class RAGDocument(Base):
    __tablename__ = "rag_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    source_type = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)
    authors = Column(String(255), nullable=True)
    publisher = Column(String(255), nullable=True)
    filename = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    chunk_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class EvalCase(Base):
    __tablename__ = "eval_cases"

    id = Column(Integer, primary_key=True, index=True)
    case_identifier = Column(String(100), unique=True, index=True, nullable=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="SET NULL"), nullable=True)
    case_type = Column(String(50), default="image", nullable=False)
    crop = Column(String(100), nullable=True)
    ground_truth_category = Column(String(100), nullable=True)
    ground_truth_label = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    image_path = Column(String(500), nullable=True)
    expected_keywords = Column(JSON, nullable=True)
    sensor_scenario = Column(String(50), nullable=True)
    is_unsafe = Column(Boolean, default=False, nullable=False)
    extra_data = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_name = Column(String(255), nullable=True)
    model = Column(String(100), nullable=False)
    prompt_version = Column(Integer, default=1, nullable=False)
    total_cases = Column(Integer, default=0, nullable=False)
    accuracy = Column(Float, default=0.0, nullable=False)
    metrics = Column(JSON, nullable=True)
    status = Column(String(50), default="completed", nullable=False)  # 'running', 'paused', 'completed', 'failed'
    is_demo = Column(Boolean, default=False, nullable=False)
    started_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    results = relationship("EvalCaseResult", back_populates="run", cascade="all, delete-orphan")


class EvalCaseResult(Base):
    __tablename__ = "eval_case_results"

    id = Column(Integer, primary_key=True, index=True)
    eval_run_id = Column(Integer, ForeignKey("eval_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    case_id = Column(String(100), nullable=False, index=True)
    case_type = Column(String(50), default="image", nullable=False)
    passed = Column(Boolean, default=False, nullable=False)
    model_output = Column(JSON, nullable=True)
    ground_truth = Column(JSON, nullable=True)
    failure_reason = Column(Text, nullable=True)
    metrics = Column(JSON, nullable=True)
    latency_ms = Column(Integer, default=0, nullable=False)
    tokens_in = Column(Integer, default=0, nullable=False)
    tokens_out = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    run = relationship("EvalRun", back_populates="results")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


class WeatherAlert(Base):
    __tablename__ = "weather_alerts"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    field_id = Column(Integer, ForeignKey("fields.id", ondelete="SET NULL"), nullable=True)
    source = Column(String(20), nullable=False)  # "weather" | "sensor"
    rule = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)  # "info" | "warning" | "high"
    start_date = Column(Date, nullable=False)
    params = Column(JSON, nullable=True, default=dict)
    dedupe_key = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    notified_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True, index=True)
    is_demo = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_weather_alerts_farm_created", "farm_id", "created_at"),
        UniqueConstraint("farm_id", "rule", "start_date", name="uq_weather_alerts_farm_rule_date"),
    )

    farm = relationship("Farm", back_populates="alerts")
    field = relationship("Field", back_populates="alerts")


# -----------------------------
# Outbreak Detection Models
# -----------------------------
outbreak_cases = Table(
    "outbreak_cases",
    Base.metadata,
    Column("outbreak_id", Integer, ForeignKey("outbreaks.id", ondelete="CASCADE"), primary_key=True),
    Column("case_id", Integer, ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True),
)


class Outbreak(Base):
    __tablename__ = "outbreaks"

    id = Column(Integer, primary_key=True, index=True)
    issue_category = Column(String(50), nullable=False, index=True)
    crop = Column(String(100), nullable=False, index=True)
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    radius_km = Column(Float, default=25.0, nullable=False)
    farm_count = Column(Integer, default=0, nullable=False)
    case_count = Column(Integer, default=0, nullable=False)
    severity = Column(String(20), default="watch", nullable=False)  # watch | alert
    status = Column(String(20), default="open", nullable=False, index=True)  # open | resolved
    is_demo = Column(Boolean, default=False, nullable=False)
    first_seen = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_outbreaks_category_crop", "issue_category", "crop"),
    )

    cases = relationship("Case", secondary=outbreak_cases, back_populates="outbreaks")
    notifications = relationship("OutbreakNotified", back_populates="outbreak", cascade="all, delete-orphan")


class OutbreakNotified(Base):
    __tablename__ = "outbreak_notified"

    id = Column(Integer, primary_key=True, index=True)
    outbreak_id = Column(Integer, ForeignKey("outbreaks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notified_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("outbreak_id", "user_id", name="uq_outbreak_notified_user"),
    )

    outbreak = relationship("Outbreak", back_populates="notifications")
    user = relationship("User")



