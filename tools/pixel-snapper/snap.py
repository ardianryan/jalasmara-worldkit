#!/usr/bin/env python3
"""JalasmaraWorldKit adapter for the pinned Sprite Fusion Pixel Snapper CLI."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
BINARY = ROOT / ".cache" / "target" / "release" / "spritefusion-pixel-snapper"


def verify_source():
    manifest = json.loads((ROOT / "source.json").read_text())
    for name, expected in manifest["vendoredFilesSha256"].items():
        path = ROOT / "vendor" / name
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Pinned upstream source changed: {name}")
    return manifest


def build(offline=False):
    verify_source()
    command = ["cargo", "build", "--locked", "--release", "--manifest-path",
               str(ROOT / "vendor" / "Cargo.toml"), "--target-dir", str(ROOT / ".cache" / "target")]
    if offline:
        command.append("--offline")
    subprocess.run(command, check=True)


def palette_value(value):
    if value == "jala-muara":
        return ",".join(json.loads((ROOT / "palettes" / "jala-muara.json").read_text())["colors"])
    if not re.fullmatch(r"[0-9a-fA-F]{6}(,[0-9a-fA-F]{6})*", value):
        raise ValueError("Palette must be jala-muara or comma-separated six-digit RGB hex colors")
    return value


def process(source, output, colors=16, pixel_size=None, palette=None):
    verify_source()
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.exists():
        raise ValueError(f"Input does not exist: {source}")
    if source == output or output.exists():
        raise ValueError("Output must be a new file or new batch directory; input is never overwritten")
    for reserved in [PROJECT / "client-godot" / "resources", PROJECT / "apps" / "web" / "public"]:
        if output.is_relative_to(reserved):
            raise ValueError("Write a review output outside runtime assets; promote it separately after review")
    if source.is_dir() and output.is_relative_to(source):
        raise ValueError("Batch output must be outside the input directory")
    if not BINARY.is_file():
        raise ValueError("Binary not built; run: python3 tools/pixel-snapper/snap.py build")
    command = [str(BINARY), str(source), str(output), str(colors)]
    if pixel_size is not None:
        command += ["--pixel-size", str(pixel_size)]
    if palette:
        command += ["--palette", palette_value(palette)]
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(command, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    builder = sub.add_parser("build", help="Build pinned upstream native CLI; only this step may fetch dependencies")
    builder.add_argument("--offline", action="store_true")
    sub.add_parser("verify", help="Check vendored source hashes against its pinned provenance")
    snap = sub.add_parser("snap", help="Snap a PNG/JPEG or directory to a new review output offline")
    snap.add_argument("input")
    snap.add_argument("output")
    snap.add_argument("--colors", type=int, default=16)
    snap.add_argument("--pixel-size", type=float)
    snap.add_argument("--palette")
    args = parser.parse_args()
    try:
        if args.command == "build":
            build(args.offline)
        elif args.command == "verify":
            print(json.dumps(verify_source()["upstream"], indent=2))
        else:
            process(args.input, args.output, args.colors, args.pixel_size, args.palette)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Pixel Snapper: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
