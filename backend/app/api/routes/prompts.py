from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import PromptTemplate, User
from app.schemas.schemas import PromptTemplateRead, PromptTemplateUpdate
from app.api.deps import require_role
from app.services.ai.prompts import get_active_prompt_template, DEFAULT_PROMPTS

router = APIRouter(prefix="/prompts", tags=["Prompt Lab"])


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


@router.get("/{step}", response_model=PromptTemplateRead)
def get_prompt_by_step(
    step: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Returns the currently active prompt template for a specific step (admin only).
    """
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
    Deactivates any older versions for this step.
    """
    # 1. Determine next version number
    max_ver = (
        db.query(func.max(PromptTemplate.version))
        .filter(PromptTemplate.step == step)
        .scalar()
        or 0
    )
    next_ver = max_ver + 1

    # 2. Deactivate previous versions
    db.query(PromptTemplate).filter(PromptTemplate.step == step).update({"is_active": False})

    # 3. Retrieve default metadata if not provided
    default_meta = DEFAULT_PROMPTS.get(step, {})
    title = prompt_in.title or default_meta.get("title") or f"{step.replace('_', ' ').title()} Template"
    subtitle = prompt_in.subtitle or default_meta.get("subtitle")
    variables = prompt_in.variables or default_meta.get("variables", [])

    # 4. Create and activate new version
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
