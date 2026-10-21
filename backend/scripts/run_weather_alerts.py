#!/usr/bin/env python3
"""
Manual runner for AgriAdvisor AI Weather & Sensor Alerts.
Usage:
    python scripts/run_weather_alerts.py [--force]
"""
import sys
import os
import argparse
import asyncio

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal
from app.services.alerts_engine import run_all_weather_alerts_job


async def main():
    parser = argparse.ArgumentParser(description="Run AgriAdvisor weather alerts check.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force check all farms even if checked in the last 3 hours.",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("AgriAdvisor AI - Proactive Weather Alerts Check")
    print(f"Force re-check: {args.force}")
    print("=" * 60)

    db = SessionLocal()
    try:
        summary = await run_all_weather_alerts_job(db=db, force=args.force)

        print("\n--- Summary Report ---")
        print(f"Farms Checked:  {summary['farms_checked']}")
        print(f"Alerts Created: {summary['alerts_created']}")
        print(f"Farms Skipped:  {summary['farms_skipped']}")
        print(f"Failures:       {summary['failures']}")
        print("----------------------")

        if summary.get("details"):
            print("\nDetailed breakdown:")
            for d in summary["details"]:
                status = d.get("status")
                farm_id = d.get("farm_id")
                if status == "success":
                    print(f"  [+] Farm #{farm_id}: {d.get('alerts_created', 0)} alert(s) generated.")
                elif status == "skipped":
                    print(f"  [-] Farm #{farm_id}: skipped ({d.get('reason')}).")
                else:
                    print(f"  [!] Farm #{farm_id}: failed ({d.get('error')}).")

        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
