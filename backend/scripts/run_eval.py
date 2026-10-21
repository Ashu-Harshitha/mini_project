#!/usr/bin/env python3
"""
AgriAdvisor Evaluation Runner CLI.
Usage:
  python -m scripts.run_eval [--prompt-version N] [--max-cases 12] [--resume]
"""

import sys
import argparse
from pathlib import Path

# Add backend to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
parent_dir = root_dir.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.services.eval_runner import run_evaluation_suite


def main():
    parser = argparse.ArgumentParser(description="AgriAdvisor AI Evaluation Benchmark Runner")
    parser.add_argument("--prompt-version", type=int, default=1, help="Prompt template version to benchmark (default: 1)")
    parser.add_argument("--max-cases", type=int, default=12, help="Maximum image cases to evaluate (default: 12)")
    parser.add_argument("--resume", action="store_true", help="Resume latest paused evaluation run")
    parser.add_argument("--run-id", type=int, default=None, help="Specific run ID to resume")

    args = parser.parse_args()

    try:
        run = run_evaluation_suite(
            prompt_version=args.prompt_version,
            max_cases=args.max_cases,
            resume=args.resume,
            run_id=args.run_id,
        )
        sys.exit(0 if run.status == "completed" else 1)
    except Exception as e:
        print(f"Evaluation runner failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
