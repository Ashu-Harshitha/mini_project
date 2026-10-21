import time
import uuid
import logging
import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db, SessionLocal
from app.models.models import PromptTemplate, User, EvalCase, EvalRun, LLMCall
from app.schemas.schemas import PromptTemplateRead, PromptTemplateUpdate
from app.api.deps import require_role
from app.services.ai.prompts import get_active_prompt_template, DEFAULT_PROMPTS
from app.services.ai.gemini_client import get_gemini_client
from app.services.eval_runner import run_evaluation_suite

logger = logging.getLogger("agriadvisor.prompts")

router = APIRouter(prefix="/prompts", tags=["Prompt Lab"], dependencies=[Depends(require_role("admin"))])

# In-memory comparison jobs store
_compare_jobs: Dict[str, Any] = {}


class PromptPreviewRequest(BaseModel):
    variables: Optional[Dict[str, Any]] = None
    sample_case_id: Optional[int] = None
    model: Optional[str] = None
    temperature: float = 0.2
    max_tokens: int = 2048
    template: Optional[str] = None


class PromptCompareRequest(BaseModel):
    step: str
    version_a: int
    version_b: int
    max_cases: int = 6


@router.get("", response_model=List[PromptTemplateRead])
def list_prompts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List active prompt templates for each step (admin only)."""
    return (
        db.query(PromptTemplate)
        .filter(PromptTemplate.is_active == True)
        .order_by(PromptTemplate.step.asc())
        .all()
    )


@router.get("/{step}/versions", response_model=List[PromptTemplateRead])
def get_prompt_versions(
    step: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Returns all historical versions of prompt templates for a specific step (admin only)."""
    versions = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.step == step)
        .order_by(PromptTemplate.version.desc())
        .all()
    )
    if not versions:
        active = get_active_prompt_template(db, step)
        if active:
            return [active]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No prompt versions found for step '{step}'.",
        )
    return versions


@router.post("/{step}/activate/{version}", response_model=PromptTemplateRead)
def activate_prompt_version(
    step: str,
    version: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Sets a specific prompt version as active for the given step (admin only)."""
    target = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.step == step, PromptTemplate.version == version)
        .first()
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt template for step '{step}' version {version} not found.",
        )

    # Deactivate all other versions
    db.query(PromptTemplate).filter(PromptTemplate.step == step).update({"is_active": False})
    target.is_active = True
    db.commit()
    db.refresh(target)
    logger.info(f"Activated prompt version {version} for step '{step}'")
    return target


@router.post("/{step}/preview")
def preview_prompt_execution(
    step: str,
    payload: PromptPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Executes the prompt template ONCE with cache OFF (admin only).
    Substitutes variables and returns the model output and token counts.
    """
    # 1. Determine template text
    raw_template = payload.template
    if not raw_template:
        active = get_active_prompt_template(db, step)
        if active:
            raw_template = active.template
        else:
            default_meta = DEFAULT_PROMPTS.get(step, {})
            raw_template = default_meta.get("template", "Analyze the crop symptoms for {{crop_type}}.")

    # 2. Build variables
    vars_dict: Dict[str, Any] = {
        "crop_type": "Corn",
        "growth_stage": "V8",
        "field_id": "Field 12",
        "soil_type": "Silt Loam",
        "irrigation_system": "Center pivot",
        "is_organic": "No",
        "farmer_description": "Noticed brown pustules and leaf lesions across several plants.",
        "observations": "Reddish-brown pustules and chlorotic leaf margins",
        "soil_data": "N: 24 ppm, P: 18 ppm, K: 160 ppm, pH: 6.4",
        "weather_data": "High 28C, Low 18C, Humidity 75%, Rain 0mm",
        "retrieved_guidance": "University Extension: Fungal rust response protocols",
        "chemical_rules": "UAN 28% max 50 lb/ac, Urea max 30 lb/ac",
    }

    # If sample_case_id is provided, populate from eval_cases
    if payload.sample_case_id:
        case = db.query(EvalCase).filter(EvalCase.id == payload.sample_case_id).first()
        if case:
            vars_dict["crop_type"] = case.crop or vars_dict["crop_type"]
            vars_dict["farmer_description"] = case.description or vars_dict["farmer_description"]
            vars_dict["growth_stage"] = "V8"

    if payload.variables:
        vars_dict.update(payload.variables)

    # 3. Substitute variables into template
    rendered_prompt = raw_template
    for k, v in vars_dict.items():
        placeholder_curly = "{{" + k + "}}"
        placeholder_colon = "{" + k + "}"
        rendered_prompt = rendered_prompt.replace(placeholder_curly, str(v))
        rendered_prompt = rendered_prompt.replace(placeholder_colon, str(v))

    # 4. Execute model call with cache OFF
    gemini = get_gemini_client()
    target_model = payload.model or getattr(gemini, "model_name", "gemini-2.5-flash-lite")
    start_t = time.time()

    if getattr(gemini, "ai_mode", "") == "mock" or not getattr(gemini, "_client", None):
        # Realistic mock output based on step
        if step == "image_analysis":
            mock_out = {
                "issue_label": "Common rust (Puccinia sorghi)",
                "issue_category": "fungal_disease",
                "observations": [
                    {"text": "Raised reddish-brown pustules on upper canopy", "confidence": 88.0},
                    {"text": "Leaf tissue intact with minimal necrosis", "confidence": 82.0},
                ],
                "confidence": 86.0,
            }
        elif step == "recommendation":
            mock_out = {
                "issue_label": "Common rust suppression",
                "recommendations": [
                    {"action": "Apply targeted fungicide spray", "why": "Prevent pustule sporulation", "confidence": 88.0},
                    {"action": "Monitor neighboring rows", "why": "Check secondary infection pressure", "confidence": 84.0},
                ],
            }
        else:
            mock_out = {
                "result": f"Simulated preview response for {step}",
                "status": "PASSED",
                "details": "Safe application window verified.",
            }
        latency_ms = int((time.time() - start_t) * 1000) or 85
        tokens_in = len(rendered_prompt.split()) * 2
        tokens_out = 150
        output_data = mock_out
    else:
        # Real Gemini API call (bypassing cache)
        from google.genai import types
        contents = [rendered_prompt]
        response = gemini._execute_with_retry(
            gemini._client.models.generate_content,
            model=target_model,
            contents=contents,
        )
        latency_ms = int((time.time() - start_t) * 1000)
        output_data = response.text.strip() if response and response.text else "No output generated."
        tokens_in = getattr(getattr(response, "usage_metadata", None), "prompt_token_count", 120) or 120
        tokens_out = getattr(getattr(response, "usage_metadata", None), "candidates_token_count", 95) or 95

    return {
        "step": step,
        "model": target_model,
        "temperature": payload.temperature,
        "max_tokens": payload.max_tokens,
        "output": output_data,
        "rendered_prompt": rendered_prompt,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "latency_ms": latency_ms,
        "generated_at": datetime.datetime.utcnow().isoformat(),
    }


def _run_comparison_job(job_id: str, step: str, ver_a: int, ver_b: int, max_cases: int):
    """Executes prompt comparison across versions on golden cases."""
    db = SessionLocal()
    try:
        _compare_jobs[job_id]["status"] = "running"

        # Run evaluation benchmark for version A
        run_a = run_evaluation_suite(prompt_version=ver_a, max_cases=max_cases)
        # Run evaluation benchmark for version B
        run_b = run_evaluation_suite(prompt_version=ver_b, max_cases=max_cases)

        metrics_a = run_a.metrics or {}
        metrics_b = run_b.metrics or {}

        _compare_jobs[job_id]["status"] = "completed"
        _compare_jobs[job_id]["completed_at"] = datetime.datetime.utcnow().isoformat()
        _compare_jobs[job_id]["comparison"] = {
            "step": step,
            "version_a": {
                "version": ver_a,
                "run_id": run_a.id,
                "metrics": metrics_a,
            },
            "version_b": {
                "version": ver_b,
                "run_id": run_b.id,
                "metrics": metrics_b,
            },
            "winner": "version_b" if metrics_b.get("image_accuracy", 0) >= metrics_a.get("image_accuracy", 0) else "version_a",
        }
    except Exception as e:
        logger.error(f"Comparison job {job_id} failed: {e}", exc_info=True)
        _compare_jobs[job_id]["status"] = "failed"
        _compare_jobs[job_id]["error"] = str(e)
    finally:
        db.close()


@router.post("/compare")
def compare_prompt_versions(
    payload: PromptCompareRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Compares two versions of a prompt template side by side on a golden subset (admin only).
    Runs as a background job.
    """
    job_id = str(uuid.uuid4())[:8]
    _compare_jobs[job_id] = {
        "job_id": job_id,
        "step": payload.step,
        "version_a": payload.version_a,
        "version_b": payload.version_b,
        "status": "pending",
        "created_at": datetime.datetime.utcnow().isoformat(),
    }

    # Add background task
    background_tasks.add_task(
        _run_comparison_job,
        job_id=job_id,
        step=payload.step,
        ver_a=payload.version_a,
        ver_b=payload.version_b,
        max_cases=payload.max_cases,
    )

    return {
        "job_id": job_id,
        "message": f"Comparison job between version {payload.version_a} and version {payload.version_b} initiated.",
        "status": "running",
    }


@router.get("/compare/{job_id}")
def get_compare_job_status(
    job_id: str,
    current_user: User = Depends(require_role("admin")),
):
    """Fetches status and side-by-side results of a prompt comparison job (admin only)."""
    job = _compare_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Comparison job not found.")
    return job


@router.get("/{step}", response_model=PromptTemplateRead)
def get_prompt_by_step(
    step: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Returns the currently active prompt template for a specific step (admin only)."""
    prompt = get_active_prompt_template(db, step)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt template for step '{step}' not found.",
        )
    return prompt


@router.put("/{step}", response_model=PromptTemplateRead)
def update_prompt_by_step(
    step: str,
    prompt_in: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Creates a new version of the prompt template and activates it (admin only).
    Deactivates older versions for this step.
    """
    max_ver = (
        db.query(func.max(PromptTemplate.version))
        .filter(PromptTemplate.step == step)
        .scalar()
        or 0
    )
    next_ver = max_ver + 1

    db.query(PromptTemplate).filter(PromptTemplate.step == step).update({"is_active": False})

    default_meta = DEFAULT_PROMPTS.get(step, {})
    title = prompt_in.title or default_meta.get("title") or f"{step.replace('_', ' ').title()} Template"
    subtitle = prompt_in.subtitle or default_meta.get("subtitle")
    variables = prompt_in.variables or default_meta.get("variables", [])

    new_prompt = PromptTemplate(
        step=step,
        version=next_ver,
        is_active=True,
        title=title,
        subtitle=subtitle,
        template=prompt_in.template,
        variables=variables,
    )
    db.add(new_prompt)
    db.commit()
    db.refresh(new_prompt)
    return new_prompt
