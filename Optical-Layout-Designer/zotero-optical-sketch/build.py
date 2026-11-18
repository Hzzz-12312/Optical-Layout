#!/usr/bin/env python3
"""Build the Optical Sketch Zotero plugin XPI from this folder.

Usage:
    python build.py                # writes ../Optical-Sketch-<version>.xpi
    python build.py path/to/file.xpi

Only the runtime files are packaged: manifest.json, bootstrap.js, storage.js,
editor.js, editor.css, icon.svg and locale/**/*.ftl. Development files
(build.py, update.json, README.md) stay out of the archive.

Zotero 10 rejects a plugin whose manifest lacks any of
applications.zotero.id, applications.zotero.update_url and
applications.zotero.strict_max_version, so the script refuses to build a
package that would fail on install.
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent
REPO_ROOT = PLUGIN_DIR.parent
MANIFEST = PLUGIN_DIR / "manifest.json"

# Files that are part of the Git repository but not of the installed plugin.
EXCLUDED = {"build.py", "update.json", "README.md", "README.txt"}


def load_manifest() -> dict:
    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"manifest.json is not valid JSON: {error}") from error
    if manifest.get("manifest_version") != 2:
        raise SystemExit("manifest.json: manifest_version must be 2")
    zotero = manifest.get("applications", {}).get("zotero", {})
    for key in ("id", "update_url", "strict_max_version"):
        if not zotero.get(key):
            raise SystemExit(
                f"manifest.json: applications.zotero.{key} is required by Zotero 10"
            )
    if "*" in zotero.get("strict_min_version", "").split("."):
        raise SystemExit(
            "manifest.json: '*' is not allowed in applications.zotero.strict_min_version"
        )
    return manifest


def packaged_files() -> list[tuple[Path, str]]:
    files = []
    for path in sorted(PLUGIN_DIR.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(PLUGIN_DIR)
        name = relative.as_posix()
        if name in EXCLUDED or relative.parts[0].startswith("."):
            continue
        if "__pycache__" in relative.parts:
            continue
        files.append((path, name))
    return files


def main() -> None:
    manifest = load_manifest()
    version = manifest["version"]
    output = (
        Path(sys.argv[1]).expanduser().resolve()
        if len(sys.argv) > 1
        else (REPO_ROOT / f"Optical-Sketch-{version}.xpi").resolve()
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    files = packaged_files()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        # manifest.json first keeps simple unpackers happy.
        archive.write(MANIFEST, "manifest.json")
        for path, name in files:
            if name == "manifest.json":
                continue
            archive.write(path, name)
    names = zipfile.ZipFile(output).namelist()
    print(f"built {output} ({output.stat().st_size} bytes, {len(names)} entries)")
    for name in names:
        print(f"  {name}")
    if "bootstrap.js" not in names:
        raise SystemExit("bootstrap.js is missing from the package")


if __name__ == "__main__":
    main()
