# Windows download — v0.11.0

[Download RYAN TMS v0.11.0](https://github.com/RyanKYChan/Ryan-TMS/raw/refs/heads/main/downloads/ryan-tms-windows-v0.11.0.zip)

Install Node.js 24 from https://nodejs.org/en/download, extract the archive, and run `START-TMS.cmd` inside the `Ryan-TMS` folder. Keep the command window open while using the dashboard.

**First update to v0.10.0:** Close the old app. Extract anywhere, launch, choose **Import Existing Database**, select the previous Ryan-TMS folder, inspect its path/counts, and confirm. Keep the whole old data folder including WAL/SHM files together. Originals are retained. Your data now lives at `%LOCALAPPDATA%\Ryan-TMS\data\tms.sqlite` and later updates open it automatically.

This update adds focused packing-list dashboards, priority and hold planning, onward objectives, next actions, review dates, scoped movement pipelines, carrier/load progress and list-only VIN drilldowns/exports. Existing bulk carrier reassignment and persistent database/backup features are included. Upgrading from v0.10 creates a schema backup automatically; use v0.11 or later afterward. Departed/delivered carrier assignments remain protected. See `OPEN-ME.txt` for first-time steps.

SHA-256: `4491d1a5bfcd374eb09fdf7251819d0ebb222c3d34caa7de067082c23ae7afb0`
