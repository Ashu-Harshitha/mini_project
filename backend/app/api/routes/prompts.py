from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import PromptTemplate, User
from app.schemas.schemas import PromptTemplateRead, PromptTemplateUpdate
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/prompts", tags=["Prompt Lab"])


@router.get("", response_model=List[PromptTemplateRead])
def list_prompts(db: Session = Depends(get_db)):
    return db.query(PromptTemplate).all()


@router.get("/{step}", response_model=PromptTemplateRead)
def get_prompt_by_step(step: str, db: Session = Depends(get_db)):
    prompt = db.query(PromptTemplate).filter(PromptTemplate.step == step).first()
    if not prompt:
        raise HTTPException(status_code=404, detail=f"Prompt template for step '{step}' not found.")
    return prompt


@router.put("/{step}", response_model=PromptTemplateRead)
def update_prompt_by_step(
    step: str,
    prompt_in: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "agronomist")),
):
    prompt = db.query(PromptTemplate).filter(PromptTemplate.step == step).first()
    if not prompt:
        # Create if not exists
        prompt = PromptTemplate(
            step=step,
            title=prompt_in.title or f"{step.replace('_', ' ').title()} Template",
            subtitle=prompt_in.subtitle,
            template=prompt_in.template,
            variables=prompt_in.variables or [],
        )
        db.add(prompt)
    else:
        prompt.template = prompt_in.template
        if prompt_in.title:
            prompt.title = prompt_in.title
        if prompt_in.subtitle:
            prompt.subtitle = prompt_in.subtitle
        if prompt_in.variables:
            prompt.variables = prompt_in.variables

    db.commit()
    db.refresh(prompt)
    return prompt
