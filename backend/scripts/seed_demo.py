"""
AgriAdvisor AI Demo Data Seeder CLI.

Usage:
    python -m scripts.seed_demo [--reset] [--no-firebase] [--cases 30]

Options:
    --reset         Remove all demo data in dependency order
    --no-firebase   Skip Firebase Auth user creation/deletion (database only)
    --cases N       Number of demo cases to generate (default: 30)
"""

import sys
import os
import argparse
from typing import Dict, Any

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal
from app.services.demo_loader import (
    load_demo_data,
    reset_demo_data,
    get_demo_status,
    AGRONOMIST_DEFS,
    FARMER_DEFS,
    DEMO_PASSWORD,
)


def print_table(headers: list, rows: list):
    """Prints a neat ASCII table."""
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))

    sep = "+-" + "-+-".join("-" * w for w in col_widths) + "-+"
    header_str = "| " + " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers)) + " |"

    print(sep)
    print(header_str)
    print(sep)
    for row in rows:
        row_str = "| " + " | ".join(str(val).ljust(col_widths[i]) for i, val in enumerate(row)) + " |"
        print(row_str)
    print(sep)


def print_credentials():
    """Prints a clear credentials table of all seeded demo users."""
    headers = ["Username", "Role", "Full Name", "Language", "Password", "Notes / Status"]
    rows = []

    for a in AGRONOMIST_DEFS:
        rows.append([
            a["username"],
            a["role"],
            a["full_name"],
            a.get("language", "en"),
            DEMO_PASSWORD,
            a.get("notes", ""),
        ])

    for f in FARMER_DEFS:
        lang_label = {"en": "English", "hi": "Hindi", "kn": "Kannada"}.get(f["language"], f["language"])
        rows.append([
            f["username"],
            f["role"],
            f["full_name"],
            f["language"],
            DEMO_PASSWORD,
            f"Farmer ({lang_label})",
        ])

    print("\n" + "=" * 80)
    print(" DEMO CREDENTIALS TABLE")
    print("=" * 80)
    print_table(headers, rows)
    print("\nNote: Demo accounts are tagged with is_demo=True and start with demo_.")
    print("=" * 80 + "\n")


def main():
    parser = argparse.ArgumentParser(description="AgriAdvisor AI Demo Data Seeder")
    parser.add_argument("--reset", action="store_true", help="Delete all demo data")
    parser.add_argument("--no-firebase", action="store_true", help="Bypass Firebase auth calls")
    parser.add_argument("--cases", type=int, default=30, help="Number of demo cases (default: 30)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.reset:
            print("[*] Initiating Demo Data Reset...")
            deleted = reset_demo_data(db, no_firebase=args.no_firebase)
            print("[+] Demo data successfully reset! Deleted entity counts:")
            for entity, count in deleted.items():
                if count > 0:
                    print(f"    - {entity}: {count}")
            status = get_demo_status(db)
            print(f"[*] Remaining demo records: {sum(status['counts'].values())}")
        else:
            print(f"[*] Seeding demo data (cases={args.cases}, no-firebase={args.no_firebase})...")
            res = load_demo_data(db, num_cases=args.cases, no_firebase=args.no_firebase)
            print(f"[+] {res['message']}")
            print("[*] Seeded entity counts:")
            for entity, count in res["counts"].items():
                print(f"    - {entity}: {count}")
            print_credentials()
    finally:
        db.close()


if __name__ == "__main__":
    main()
