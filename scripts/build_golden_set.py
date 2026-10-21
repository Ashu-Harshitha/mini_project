import os
import sys
import runpy
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
target_script = backend_dir / "scripts" / "build_golden_set.py"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Ensure working directory is backend so database and relative paths resolve consistently
os.chdir(str(backend_dir))

if __name__ == "__main__":
    runpy.run_path(str(target_script), run_name="__main__")
