#!/usr/bin/env python3
"""
Compare the TypeScript port's positions against the original C++ (the answer key).

Usage (from celestia-web):
  python3 compare_positions.py ../Celestia/ref_positions.csv port_positions.csv

Prints max / median / mean error per body in km (and as a fraction of the body's distance),
and writes:
  error_report.txt   - paste this into Argon when asking for fixes
  public/verify.json - read by the app's /verify page
  results.csv        - one row appended per run, for the "errors over iterations" chart
"""
import csv
import json
import math
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

PASS_KM = 1.0  # a body passes if every date is within 1 km of the original


def load(path):
    rows = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                key = (r["body"].strip(), round(float(r["jd"]), 6))
                rows[key] = (float(r["x_km"]), float(r["y_km"]), float(r["z_km"]))
            except (KeyError, ValueError):
                continue
    return rows


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: python3 compare_positions.py ref_positions.csv port_positions.csv")
    ref, port = load(sys.argv[1]), load(sys.argv[2])
    if not port:
        sys.exit("The port's CSV has no readable rows. Check its header is body,jd,x_km,y_km,z_km.")

    errors = defaultdict(list)  # body -> [(err_km, rel, jd, ref_xyz, port_xyz)]
    missing = defaultdict(int)
    for (body, jd), r in ref.items():
        p = port.get((body, jd))
        if p is None:
            missing[body] += 1
            continue
        err = math.dist(r, p)
        dist = math.hypot(*r) or 1.0
        errors[body].append((err, err / dist, jd, r, p))

    bodies = list(dict.fromkeys(b for b, _ in ref))
    summary, lines = {}, []
    header = f"{'body':<9}{'max_km':>16}{'median_km':>16}{'mean_km':>16}{'max_rel':>12}  result"
    print(header)
    lines.append(header)
    for b in bodies:
        e = errors.get(b, [])
        if not e:
            line = f"{b:<9}{'missing from port output':>60}"
            print(line)
            lines.append(line)
            summary[b] = {"missing": missing[b]}
            continue
        kms = [x[0] for x in e]
        mx, med, mean = max(kms), statistics.median(kms), statistics.fmean(kms)
        rel = max(x[1] for x in e)
        ok = mx <= PASS_KM and missing[b] == 0
        line = f"{b:<9}{mx:>16.3f}{med:>16.3f}{mean:>16.3f}{rel:>12.2e}  {'PASS' if ok else 'FAIL'}"
        if missing[b]:
            line += f" ({missing[b]} dates missing)"
        print(line)
        lines.append(line)
        worst = sorted(e, reverse=True)[:5]
        summary[b] = {
            "max_km": mx, "median_km": med, "mean_km": mean, "max_relative": rel,
            "pass": ok, "missing": missing[b],
            "worst": [{"jd": w[2], "error_km": w[0], "expected": w[3], "actual": w[4]} for w in worst],
        }

    passed = sum(1 for v in summary.values() if v.get("pass"))
    total_line = f"\n{passed}/{len(bodies)} bodies within {PASS_KM} km on every date"
    print(total_line)
    lines.append(total_line)

    report = ["Error report: TypeScript port vs original Celestia C++ (km). Ground truth = C++.", *lines, "", "Worst dates per failing body:"]
    for b, v in summary.items():
        if v.get("pass") or "worst" not in v:
            continue
        report.append(f"\n{b}:")
        for w in v["worst"]:
            ex, ac = w["expected"], w["actual"]
            report.append(f"  jd {w['jd']}: error {w['error_km']:.3f} km | expected ({ex[0]:.6f}, {ex[1]:.6f}, {ex[2]:.6f}) | got ({ac[0]:.6f}, {ac[1]:.6f}, {ac[2]:.6f})")
    Path("error_report.txt").write_text("\n".join(report) + "\n")

    Path("public").mkdir(exist_ok=True)
    Path("public/verify.json").write_text(json.dumps({"pass_threshold_km": PASS_KM, "bodies": summary}, indent=2))

    new = not Path("results.csv").exists()
    with open("results.csv", "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["timestamp", "bodies_passed", "bodies_total"] + [f"{b}_max_km" for b in bodies])
        w.writerow([time.strftime("%H:%M:%S"), passed, len(bodies)] + [f"{summary[b].get('max_km', '')}" for b in bodies])

    print("Wrote error_report.txt, public/verify.json, and a row in results.csv")


if __name__ == "__main__":
    main()
