import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.api.routes import (
    auth,
    admin,
    farms,
    cases,
    reviews,
    prompts,
    notifications,
    eval,
    dashboard,
    rag,
)
from app.scripts.seed import seed_database
from app.services.assignment import check_case_assignment_timeouts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agriadvisor.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and seed default chemical rules and demo data
    logger.info("Initializing AgriAdvisor AI database...")
    Base.metadata.create_all(bind=engine)
    
    # Ensure alembic is stamped to latest schema
    try:
        from alembic.config import Config
        from alembic import command
        alembic_ini = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic.ini")
        if os.path.exists(alembic_ini):
            alembic_cfg = Config(alembic_ini)
            command.stamp(alembic_cfg, "head")
    except Exception as e:
        logger.debug(f"Alembic auto-stamp note: {e}")
    
    # Auto-seed database if empty
    db = SessionLocal()
    try:
        seed_database(db)
    except Exception as e:
        logger.warning(f"Database auto-seeding skipped or already initialized: {e}")
    finally:
        db.close()

    # Timeout Job: APScheduler every 5 minutes
    scheduler = None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler

        def timeout_job():
            job_db = SessionLocal()
            try:
                check_case_assignment_timeouts(job_db)
            except Exception as e:
                logger.error(f"Error executing timeout job: {e}")
            finally:
                job_db.close()

        scheduler = BackgroundScheduler()
        scheduler.add_job(timeout_job, "interval", minutes=5)
        scheduler.start()
        logger.info("Started APScheduler assignment timeout job (5-minute interval).")
    except Exception as e:
        logger.warning(f"Failed to start APScheduler: {e}")

    yield

    if scheduler:
        try:
            scheduler.shutdown(wait=False)
            logger.info("Shutdown APScheduler assignment timeout job.")
        except Exception:
            pass

    logger.info("Shutting down AgriAdvisor AI backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="AgriAdvisor AI Backend - Smart Agriculture Decision Support & Guidance",
    lifespan=lifespan,
)

# CORS Middleware for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global unhandled error at {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred.", "path": str(request.url.path)},
    )

# Static file serving for uploads
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Mount API Routers under /v1 and root
api_prefix = settings.API_V1_STR
app.include_router(auth.router, prefix=api_prefix)
app.include_router(auth.router)
app.include_router(auth.me_router, prefix=api_prefix)
app.include_router(auth.me_router)
app.include_router(admin.router, prefix=api_prefix)
app.include_router(admin.router)
app.include_router(farms.router, prefix=api_prefix)
app.include_router(cases.router, prefix=api_prefix)
app.include_router(cases.router)
app.include_router(reviews.router, prefix=api_prefix)
app.include_router(reviews.router)
app.include_router(prompts.router, prefix=api_prefix)
app.include_router(notifications.router, prefix=api_prefix)
app.include_router(eval.router, prefix=api_prefix)
app.include_router(dashboard.router, prefix=api_prefix)
app.include_router(dashboard.router)
app.include_router(rag.router, prefix=api_prefix)
app.include_router(rag.router)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "ai_mode": settings.AI_MODE,
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to AgriAdvisor AI API",
        "docs_url": "/docs",
        "version": "1.0.0",
    }
