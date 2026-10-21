from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "AgriAdvisor AI Backend"
    API_V1_STR: str = "/v1"
    
    # Database
    DATABASE_URL: str = "sqlite:///./agriadvisor.db"
    
    # AI Engine
    AI_MODE: str = "mock"  # "mock" or "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    GEMINI_MAX_RPM: int = 8
    
    # Case Assignment
    DEFAULT_MAX_OPEN_CASES: int = 5
    ASSIGN_TIMEOUT_MINUTES: int = 1440
    
    # Firebase & Auth
    FIREBASE_PROJECT_ID: str = "agriadvisor-ai"
    FIREBASE_CREDENTIALS_PATH: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = "./secrets/firebase-admin.json"
    AUTH_EMAIL_DOMAIN: str = "agriadvisor.app"

    # Notifications & SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""
    FRONTEND_URL: str = "http://localhost:5173"
    FEEDBACK_DELAY_MINUTES: int = 10080
    DEFAULT_COUNTRY_CODE: str = "+91"
    SMS_ENABLED: bool = False
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""
    
    # File Storage
    UPLOAD_DIR: str = "./uploads"
    
    # Guardrail Thresholds
    AUTO_APPROVE_CONFIDENCE_THRESHOLD: float = 80.0
    MIN_FARMER_VISIBLE_CONFIDENCE: float = 50.0

    # Field Sensors & Weather
    SENSOR_STALE_HOURS: int = 48
    SHOW_SAMPLE_SENSOR: bool = True
    LOCATION_MAX_ACCURACY_M: float = 100.0
    WEATHER_CACHE_MINUTES: int = 30
    WEATHER_CHECK_HOURS: int = 6
    MAX_SENSOR_PDF_MB: float = 5.0

    # Outbreak Detection
    OUTBREAK_RADIUS_KM: float = 25.0
    OUTBREAK_MIN_FARMS: int = 3
    OUTBREAK_WINDOW_DAYS: int = 14
    OUTBREAK_ALERT_FARMS: int = 6

    # Demo Data Loader
    ALLOW_DEMO_DATA: bool = False

    # RAG & ChromaDB
    CHROMA_PATH: str = "./data/chroma"
    RAG_TOP_K: int = 4
    RAG_MIN_RELEVANCE: float = 30.0
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8080",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )


settings = Settings()
