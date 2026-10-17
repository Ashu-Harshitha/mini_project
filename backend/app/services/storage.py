import os
import shutil
from abc import ABC, abstractmethod
from fastapi import UploadFile
from app.core.config import settings


class StorageService(ABC):
    @abstractmethod
    async def save_file(self, file: UploadFile, subfolder: str = "") -> str:
        """
        Saves uploaded file and returns accessible URL or file path.
        """
        pass


class LocalStorageService(StorageService):
    def __init__(self, base_dir: str = settings.UPLOAD_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    async def save_file(self, file: UploadFile, subfolder: str = "") -> str:
        target_dir = os.path.join(self.base_dir, subfolder)
        os.makedirs(target_dir, exist_ok=True)

        destination_path = os.path.join(target_dir, file.filename or "uploaded_file")
        with open(destination_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return destination_path


class FirebaseStorageService(StorageService):
    async def save_file(self, file: UploadFile, subfolder: str = "") -> str:
        # TODO: Implement upload to Firebase Cloud Storage bucket via google-cloud-storage
        raise NotImplementedError("Firebase Storage integration will be activated with production credentials.")


def get_storage_service() -> StorageService:
    return LocalStorageService()
