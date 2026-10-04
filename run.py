"""Build web, start API + simulator on :8000."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _dist_stale() -> bool:
    dist = ROOT / "web" / "dist"
    index = dist / "index.html"
    if not index.exists():
        return True
    src = ROOT / "web" / "src"
    if not src.exists():
        return False
    newest_src = max((p.stat().st_mtime for p in src.rglob("*") if p.is_file()), default=0)
    return index.stat().st_mtime < newest_src


def main() -> None:
    ap = argparse.ArgumentParser(description="Run SomaiyaNet")
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--no-sim", action="store_true")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    if not args.no_build and _dist_stale():
        print("building web...")
        subprocess.run(["npm", "--prefix", "web", "run", "build"], cwd=str(ROOT), check=True)
    else:
        print("skipping web build")

    env = dict(os.environ)
    if args.no_sim:
        env["SIMULATOR"] = "0"
    cmd = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(args.port)]
    print(f"starting {' '.join(cmd)}")
    if not args.no_open:
        try:
            webbrowser.open(f"http://127.0.0.1:{args.port}")
        except Exception:
            pass
    subprocess.run(cmd, cwd=str(ROOT), env=env, check=True)


if __name__ == "__main__":
    main()
