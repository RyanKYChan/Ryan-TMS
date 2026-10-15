# Windows download — v0.9.0

[Download RYAN TMS v0.9.0](https://github.com/RyanKYChan/Ryan-TMS/raw/refs/heads/main/downloads/ryan-tms-windows-v0.9.0.zip)

Install Node.js 24 from https://nodejs.org/en/download, extract the archive, and run `START-TMS.cmd` inside the `Ryan-TMS` folder. Keep the command window open while using the dashboard.

**Updating:** Close the old app first. Back up its `data` folder. Extract into the same parent folder so the new `Ryan-TMS` folder merges with the existing folder, replacing application files. Do not delete the old folder or its `data` directory. The ZIP contains no databases. Restart the launcher and check v0.9.0 in the footer.

This update saves default loading/unloading yards per stripping project and adds bulk truck bookings from carrier messages. Review truck/trailer/driver rows, apply shared yards and dates, then book the batch together. Clear arrival instructions fill a separate yard-arrival deadline, visible in the calendar and announcements. Dates remain date-only in announcements unless hours are enabled. Invalid batches roll back completely and retries do not duplicate visits. Existing vehicle projects and their records are preserved. Existing data is retained when updating as described above.

SHA-256: `2a3a46a6cd9f4346893a73a9ba8e916b7bb7dbade893259cd6cedd9a95999fa9`
