import sys
import runpy
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
target_script = backend_dir / "scripts" / "ingest_rag.py"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    runpy.run_path(str(target_script), run_name="__main__")
