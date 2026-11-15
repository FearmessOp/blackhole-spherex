"""Run the Epsilon Indi B measurement chain on the fast movers (0.2 deg cutouts only).

Per slug, in this order, each step with its own log:
  target_astrometry.py <slug> --tag wide              -> logs/target_astrometry_<slug>_wide.log
  field_astrometry.py  <slug> --tag wide              -> logs/field_astrometry_<slug>_wide.log
  fit_motion.py        <slug> --tag wide --align wide -> logs/fit_motion_<slug>_wide_aligned.log
The fit options are those of logs/fit_motion_eps-indi-b_aligned.log (methods win and psf,
all detectors, aligned per exposure to the field stars). A step that fails is logged
and the chain goes on to the next slug; nothing is retried or tuned.

If <name> starts with "stack", the only step is the epoch stacking for the site:
  stack_epochs.py      <slug> --tag wide              -> logs/stack_<slug>_wide.log

Usage: .venv/Scripts/python.exe pipeline/run_fast_movers.py <name> <slug> [<slug> ...]
       progress goes to logs/run_fast_movers_<name>.log
"""
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGS = ROOT / "logs"
STEPS = [("target_astrometry", ["--tag", "wide"], "target_astrometry_{slug}_wide.log"),
         ("field_astrometry", ["--tag", "wide"], "field_astrometry_{slug}_wide.log"),
         ("fit_motion", ["--tag", "wide", "--align", "wide"], "fit_motion_{slug}_wide_aligned.log")]
STACK = [("stack_epochs", ["--tag", "wide"], "stack_{slug}_wide.log")]

def main():
    name, slugs = sys.argv[1], sys.argv[2:]
    steps = STACK if name.startswith("stack") else STEPS
    progress = LOGS / f"run_fast_movers_{name}.log"
    with progress.open("w", encoding="utf-8") as out:
        for slug in slugs:
            for script, opts, log in steps:
                t0 = time.time()
                with (LOGS / log.format(slug=slug)).open("w", encoding="utf-8") as f:
                    code = subprocess.run(
                        [sys.executable, str(ROOT / "pipeline" / f"{script}.py"), slug, *opts],
                        cwd=ROOT, stdout=f, stderr=subprocess.STDOUT).returncode
                out.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {slug} {script} "
                          f"exit={code} secs={time.time() - t0:.0f}\n")
                out.flush()
        out.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} DONE\n")
    return 0

if __name__ == "__main__":
    sys.exit(main())