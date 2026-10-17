import sys
import os

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal
from app.scripts.seed_users import seed_users

if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_users(db)
        print("Users successfully seeded in Firebase and Database!")
    finally:
        db.close()
