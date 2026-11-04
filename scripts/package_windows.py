"""Build a downloadable app archive without databases, caches, or credentials.

Run npm run build first, then python3 scripts/package_windows.py.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import shutil

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text())["version"]
if not (root / "dist/index.html").is_file():
    raise SystemExit("Run npm run build before packaging.")
downloads = root / "downloads"
downloads.mkdir(exist_ok=True)
archive = downloads / f"ryan-tms-windows-v{version}.zip"
files = [".gitignore", ".node-version", "README.md", "OPEN-ME.txt", "START-TMS.cmd",
         "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "playwright.config.js"]
for directory in ["client", "server", "templates", "tests", "scripts", "dist"]:
    files.extend(str(p.relative_to(root)) for p in (root / directory).rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
with ZipFile(archive, "w", ZIP_DEFLATED) as output:
    for name in sorted(files):
        output.write(root / name, "Ryan-TMS/" + name)
with ZipFile(archive) as check:
    assert check.testzip() is None
    assert "Ryan-TMS/START-TMS.cmd" in check.namelist()
    assert not any("/data/" in n or "/.local/" in n or "/.git/" in n or "/node_modules/" in n for n in check.namelist())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
shutil.copyfile(archive, downloads / "ryan-tms-windows.zip")
(downloads / "README.md").write_text(f'''# Windows download — v{version}

[Download RYAN TMS v{version}](https://github.com/RyanKYChan/Ryan-TMS/raw/refs/heads/main/downloads/{archive.name})

Install Node.js 24 from https://nodejs.org/en/download, extract the archive, and run `START-TMS.cmd` inside the `Ryan-TMS` folder. Keep the command window open while using the dashboard.

**First update to v0.10.0:** Close the old app. Extract anywhere, launch, choose **Import Existing Database**, select the previous Ryan-TMS folder, inspect its path/counts, and confirm. Keep the whole old data folder including WAL/SHM files together. Originals are retained. Your data now lives at `%LOCALAPPDATA%\\Ryan-TMS\\data\\tms.sqlite` and later updates open it automatically.

Includes bulk VIN/carrier reassignment, confirmation of transfers detected in pasted carrier sheets, persistent storage, verified WAL-safe import, versioned schema migration backups, single-instance protection, and database backup/restore in **Data & backups**. Departed/delivered carrier assignments remain protected. See `OPEN-ME.txt` for first-time steps.

SHA-256: `{digest}`
''')
print(f"Packaged {len(files)} files in {archive.name}: {archive.stat().st_size:,} bytes")
print(f"SHA-256: {digest}")
