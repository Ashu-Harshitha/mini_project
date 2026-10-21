from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Farm, Field, User
from app.schemas.schemas import FarmCreate, FarmUpdate, FarmRead, FieldCreate, FieldRead
from app.api.deps import get_current_user

router = APIRouter(prefix="/farms", tags=["Farms & Fields"], dependencies=[Depends(get_current_user)])


@router.post("", response_model=FarmRead, status_code=status.HTTP_201_CREATED)
def create_farm(
    farm_in: FarmCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    farm = Farm(**farm_in.model_dump())
    db.add(farm)
    db.commit()
    db.refresh(farm)
    return farm


@router.get("", response_model=List[FarmRead])
def list_farms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Farm).all()


@router.get("/{id}", response_model=FarmRead)
def get_farm(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    farm = db.query(Farm).filter(Farm.id == id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    return farm


@router.put("/{id}", response_model=FarmRead)
def update_farm(
    id: int,
    farm_in: FarmUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    farm = db.query(Farm).filter(Farm.id == id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    for k, v in farm_in.model_dump(exclude_unset=True).items():
        setattr(farm, k, v)

    db.commit()
    db.refresh(farm)
    return farm


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_farm(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    farm = db.query(Farm).filter(Farm.id == id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    if current_user.role == "farmer" and farm.operator_name not in (current_user.full_name, current_user.username):
        raise HTTPException(status_code=403, detail="Forbidden: You cannot delete this farm.")
    db.delete(farm)
    db.commit()
    return None


@router.post("/{id}/fields", response_model=FieldRead, status_code=status.HTTP_201_CREATED)
def add_field_to_farm(
    id: int,
    field_in: FieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    farm = db.query(Farm).filter(Farm.id == id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    new_field = Field(farm_id=id, **field_in.model_dump())
    db.add(new_field)
    farm.total_acreage += new_field.acreage
    db.commit()
    db.refresh(new_field)
    return new_field


@router.get("/{id}/fields", response_model=List[FieldRead])
def list_farm_fields(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    farm = db.query(Farm).filter(Farm.id == id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    return farm.fields
