# Windows download — v0.10.0

[Download RYAN TMS v0.10.0](https://github.com/RyanKYChan/Ryan-TMS/raw/refs/heads/main/downloads/ryan-tms-windows-v0.10.0.zip)

Install Node.js 24 from https://nodejs.org/en/download, extract the archive, and run `START-TMS.cmd` inside the `Ryan-TMS` folder. Keep the command window open while using the dashboard.

**First update to v0.10.0:** Close the old app. Extract anywhere, launch, choose **Import Existing Database**, select the previous Ryan-TMS folder, inspect its path/counts, and confirm. Keep the whole old data folder including WAL/SHM files together. Originals are retained. Your data now lives at `%LOCALAPPDATA%\Ryan-TMS\data\tms.sqlite` and later updates open it automatically.

Includes bulk VIN/carrier reassignment, confirmation of transfers detected in pasted carrier sheets, persistent storage, verified WAL-safe import, versioned schema migration backups, single-instance protection, and database backup/restore in **Data & backups**. Departed/delivered carrier assignments remain protected. See `OPEN-ME.txt` for first-time steps.

SHA-256: `18c7be98c3b71d9476cf8d0d94215d015ac70e0150fc34d01011cc3dae51f7c0`
