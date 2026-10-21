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
    models,
    guardrails,
    alerts,
    outbreaks,
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

    # Re-scan DB for cases whose feedback reminder is due so restarts never lose them
    startup_db = SessionLocal()
    try:
        from app.services.feedback_reminders import check_and_send_feedback_reminders
        reminders_sent = check_and_send_feedback_reminders(startup_db)
        if reminders_sent > 0:
            logger.info(f"Startup rescan dispatched {reminders_sent} due feedback reminder(s).")
    except Exception as e:
        logger.warning(f"Startup feedback reminder scan note: {e}")
    finally:
        startup_db.close()

    # APScheduler: assignment timeouts (5 min) & feedback reminders (5 min)
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

        def reminder_job():
            job_db = SessionLocal()
            try:
                check_and_send_feedback_reminders(job_db)
            except Exception as e:
                logger.error(f"Error executing feedback reminder job: {e}")
            finally:
                job_db.close()

        def weather_alerts_job():
            import asyncio
            from app.services.alerts_engine import run_all_weather_alerts_job
            job_db = SessionLocal()
            try:
                loop = None
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                if loop.is_running():
                    asyncio.create_task(run_all_weather_alerts_job(job_db))
                else:
                    loop.run_until_complete(run_all_weather_alerts_job(job_db))
            except Exception as e:
                logger.error(f"Error executing weather alerts job: {e}")
            finally:
                job_db.close()

        def outbreak_detection_job():
            job_db = SessionLocal()
            try:
                from app.services.outbreaks import detect_outbreaks
                detect_outbreaks(job_db)
            except Exception as e:
                logger.error(f"Error executing outbreak detection job: {e}")
            finally:
                job_db.close()

        scheduler = BackgroundScheduler()
        scheduler.add_job(timeout_job, "interval", minutes=5)
        scheduler.add_job(reminder_job, "interval", minutes=5)
        scheduler.add_job(weather_alerts_job, "interval", hours=getattr(settings, "WEATHER_CHECK_HOURS", 6))
        scheduler.add_job(outbreak_detection_job, "interval", hours=1)
        scheduler.start()
        logger.info("Started APScheduler jobs (timeouts, feedback reminders, weather alerts & outbreaks).")
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

# CORS Middleware limited strictly to FRONTEND_URL
_cors_origins = [settings.FRONTEND_URL.rstrip("/")]
if "localhost" in settings.FRONTEND_URL or "127.0.0.1" in settings.FRONTEND_URL:
    _cors_origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])
_cors_origins = list(dict.fromkeys(_cors_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
app.include_router(guardrails.router, prefix=api_prefix)
app.include_router(guardrails.router)
app.include_router(cases.router, prefix=api_prefix)
app.include_router(cases.router)
app.include_router(reviews.router, prefix=api_prefix)
app.include_router(reviews.router)
app.include_router(prompts.router, prefix=api_prefix)
app.include_router(prompts.router)
app.include_router(notifications.router, prefix=api_prefix)
app.include_router(eval.router, prefix=api_prefix)
app.include_router(eval.router)
app.include_router(models.router, prefix=api_prefix)
app.include_router(models.router)
app.include_router(dashboard.router, prefix=api_prefix)
app.include_router(dashboard.router)
app.include_router(rag.router, prefix=api_prefix)
app.include_router(rag.router)
app.include_router(alerts.router, prefix=api_prefix)
app.include_router(alerts.router)
app.include_router(outbreaks.router, prefix=api_prefix)
app.include_router(outbreaks.router)



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
