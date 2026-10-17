import os
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "AgriAdvisor AI Backend"
    API_V1_STR: str = "/v1"
    
    # Database
    DATABASE_URL: str = "sqlite:///./agriadvisor.db"
    
    # AI Engine
    AI_MODE: str = "mock"  # "mock" or "openai"
    OPENAI_API_KEY: str = ""
    
    # Firebase & Auth
    FIREBASE_PROJECT_ID: str = "agriadvisor-ai"
    FIREBASE_CREDENTIALS_PATH: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = "./secrets/firebase-admin.json"
    AUTH_EMAIL_DOMAIN: str = "agriadvisor.app"
    
    # File Storage
    UPLOAD_DIR: str = "./uploads"
    
    # Guardrail Thresholds
    AUTO_APPROVE_CONFIDENCE_THRESHOLD: float = 80.0
    MIN_FARMER_VISIBLE_CONFIDENCE: float = 50.0
    
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
