"""CLI script to generate simulated AgriAdvisor sensor report PDFs.

Usage:
    python -m scripts.make_sensor_pdf --scenario healthy|n_deficiency|dry|fungal_risk|random --hours 48 --interval 60 --seed 1 --out FILE
"""
import argparse
import sys
import os
from app.sensors.generator import generate_sensor_pdf


def main():
    parser = argparse.ArgumentParser(description="Generate simulated field sensor PDF report.")
    parser.add_argument(
        "--scenario",
        type=str,
        default="healthy",
        choices=["healthy", "n_deficiency", "dry", "fungal_risk", "random"],
        help="Simulation scenario",
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=48,
        help="Hours of simulated sensor telemetry (default 48)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        help="Reading interval in minutes (default 60)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=1,
        help="Deterministic pseudo-random seed (default 1)",
    )
    parser.add_argument(
        "--out",
        type=str,
        default="sensor_report.pdf",
        help="Output PDF filepath",
    )

    args = parser.parse_args()

    pdf_bytes = generate_sensor_pdf(
        scenario=args.scenario,
        hours=args.hours,
        interval_minutes=args.interval,
        seed=args.seed,
    )

    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(args.out, "wb") as f:
        f.write(pdf_bytes)

    print(f"Generated {len(pdf_bytes)} bytes PDF to {args.out} (scenario={args.scenario}, hours={args.hours}, interval={args.interval}, seed={args.seed})")


if __name__ == "__main__":
    main()
