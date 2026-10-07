# RYAN · Transport operations

A mini TMS for vehicle spot transport and shunting, starting with a Maxus project of 400 expected units. Projects, customers, packing lists, and loads are reusable for future work.

## Open it on your Windows computer

[Download the v0.6.0 Windows ZIP](https://github.com/RyanKYChan/Ryan-TMS/raw/refs/heads/main/downloads/ryan-tms-windows-v0.6.0.zip)

ChatGPT's cloud environment page does not expose the web app. The server must run on your own computer, or the app needs a separate hosted deployment. Opening the HTML files directly does not start the API.

Install Node.js 24, extract the downloadable app ZIP, and double-click `START-TMS.cmd` in the extracted folder. It installs dependencies on first use and starts the built app. Edge opens after a successful readiness check. Keep the command window open while using the app. See `OPEN-ME.txt` for step-by-step instructions. The ZIP excludes workspace databases and starts with an empty real project.

The launcher can also be run using `npm run open` after dependencies and the production build are present. Browser launch is Windows-specific; other systems display a local address. The dashboard, import, and tracking logic are the same as the workspace version.

## Update an existing Windows installation

Close the app's command window first. Make a backup copy of your existing `data` folder. Extract the new ZIP into the same parent folder so its `Ryan-TMS` folder merges with your current `Ryan-TMS` folder; replace application files when prompted. **Do not delete the old folder or its `data` directory.** The ZIP contains no database or `data` folder, so merging it does not replace your existing packing lists. Start `START-TMS.cmd` again and refresh Edge. Version 0.6.0 appears in the footer. Existing packing lists, notes, dates, and load assignments are retained; the database gains project volume settings automatically. Existing unit prices remain unit costs.

You can re-paste an existing packing list with its original name to fill previously missed columns. Matching VINs update in place rather than creating duplicates.

## Start the app

Requires **Node.js 24** (the environment uses 24.19.0).

```sh
cd /workspace/Ryan-TMS
npm ci --cache /workspace/Ryan-TMS/.local/npm-cache
npm run dev
```

The development server listens on port **3000**, bound to the local machine. It serves both the React interface and the API. To run the production build locally:

```sh
npm run build
npm start
```

The repository is an existing checkout in an isolated cloud workspace; do not create another worktree for ordinary development.

## First real packing list

1. Open **Import units**. Enter a packing list name, such as `MAXUS · Vessel arrival 01`.
2. Copy a range of cells from Google Sheets and paste it. Include the header row when importing multiple columns. A single column of VINs also works without a header.
3. Review the detected columns and preview. Expand **Column mapping** if a header needs to be matched manually. Fix invalid or duplicate VINs before continuing.
4. Import. Every unit appears in **Unit register**, linked to its packing list.
5. Open **Load builds**, create a load, and set capacity, carrier, truck, origin, destination, ETD, and ETA.
6. Open the load and select available units, or select vehicles in the register and use **Assign to load**.
7. Record actual departure (ATD) and actual arrival (ATA) on the load. Existing actual timestamps are preserved; only missing milestones are filled. Click a VIN to edit milestones individually.
8. Use **Export CSV** to download the project's full register for Google Sheets.

For a generic packing list with **VIN No**, **Model**, **Loading**, and **Unloading**, the two address columns map to the complete POL and POD addresses automatically. When an address ends in a recognised postcode/city pattern, those fields are extracted too (for example `9130 Kallo` or `8380 Zeebrugge`). Countries are only inferred when explicitly supplied; a postcode alone does not establish a country. Copied spreadsheet rows, CSV/semicolon data, and Markdown tables are supported.

The importer detects common header variations and can find a header after title rows. Choose **First row contains headers** if automatic detection needs an override. Unmatched columns are shown in the mapping panel; custom mappings are remembered in your browser after a successful import. **Shared POL / POD details** fills blank values for the whole import while preserving values supplied in the sheet or already stored on an existing vehicle.

For vehicles already imported, open **Unit register**, select vehicles, and click **Bulk edit**. The header checkbox selects the current page; **Select all N matching vehicles** expands the selection across every filtered page. Add only the fields you want to change and choose **Set value**, **Fill blanks**, or **Clear**. Review the per-VIN preview and apply. The API validates the whole batch before writing, and an invalid milestone prevents partial changes. Bulk edits apply to vehicle records; editing a load later can resynchronise its route and planning fields.

Use **Explore a sample project** to try the flow before real data arrives. Sample VINs, routes, carriers, and prices live in a separate, clearly labelled demo project. Real projects start empty.

## Assign the first 200 VINs to a carrier

1. Open **Unit register**. Optionally filter to a particular packing list. **Rows per page** offers 50, 100, 200, 400, or **All vehicles**; the default is 200.
2. Enter **200** in **Select next** and click **Select 200 VINs**. The selection follows the original packing-list import order, across pages. Re-importing a sheet does not reorder existing VINs. For older databases, original insertion order is restored automatically.
3. Click **Assign to carrier**. Enter a new carrier name or choose an existing carrier, then click **Assign 200 vehicles**.
4. Repeat for the next batch. **Without a carrier only** is enabled by default, so the first carrier's VINs are skipped. Already selected VINs are also skipped when adding another batch. You can select individual checkboxes or select all matching vehicles instead.

Carrier allocation does not create a load or mark vehicles as planned. Vehicles on an existing load retain its carrier unless you change the load's carrier, or remove planned vehicles from that load first. VINs, packing lists, route details, notes, and milestones remain in place.

## Build loads by pasting the full carrier batch

1. Open **Load builds** and click the carrier, such as **Valida**. The app remembers your last carrier on this computer. All allocated VINs, built loads, and VINs not yet load built appear together.
2. Click **Paste full batch for Valida** (or **Paste carrier sheet**). Copy the entire Google Sheets range including headers, blank gaps, and the unassigned remainder.
3. Check the full sheet preview: all nonempty source columns and all VINs are shown. Empty trailing rows and columns are ignored. `Appointment #` maps to the vehicle reference.
4. Check **Detected loads** and **Not load built**. Gaps close load groups. The final unbroken list without planning details remains unassigned to a load. If a dated/trucked prefix runs directly into that remainder, the prefix is detected as the last load. You can change any detected section between **Load build** and **Unassigned to a load** before reviewing.
5. Click **Review changes**. Check new/reused loads, changed fields, and any planned VINs returning to the unassigned remainder, then **Apply update**. Use **Show changed VINs only** for a focused comparison; every resulting field is available by scrolling the table horizontally.
6. Whenever the sheet changes, paste the same full batch again. Existing VINs and unchanged loads are reused. New gaps and dates update planning and movement progress; a check with no changes is recorded too.

For a sheet with twelve dated/trucked groups of six VINs followed by 128 unplanned VINs, the result is **12 loads / 72 VINs on loads / 128 not load built**. The unassigned remainder never becomes a single 128-VIN load. A sheet with no gaps or load references stays unbuilt by default; dates can still be updated, and section treatment can be overridden.

**Sync planned load membership from this full sheet** is enabled by default. When a planned VIN returns to the unassigned remainder, the preview proposes removing it from its load while keeping its dates and carrier. Departed/delivered load assignments are retained, even if those VINs are pasted in the unassigned section. Turn off membership sync for a partial or dates-only paste that should retain all existing load assignments. VINs absent from a paste keep their saved state.

- Paste updates only VINs already imported and allocated to the chosen carrier. Unknown VINs and VINs owned by another carrier are flagged. Import/assign them first.
- Blank cells preserve saved values, including notes and actual dates. VIN identity, packing-list membership, and packing-list order are retained. Explicitly clear values through vehicle details or bulk edit when needed.
- Optional `Load`, `Load ID`, `Load reference`, `Loadbuild`, and `Trip number` columns group rows by reference. A reference entered only on the first row fills down until the next reference or gap.
- Repeating the same groups reuses saved loads. Changed groups can split or merge planned loads. Departed or delivered VINs keep an existing load; a missing load can still be established after actual dates were recorded.
- Inferred sheet loads follow their actual group sizes, up to 500 vehicles. Manually created load capacities remain enforced. Carrier ownership, every row, and milestone chronology are validated before applying. If saved data changes after preview, review the paste again.
- Empty old loads remain as history and are hidden by default in **Load builds**. Enable **Include empty load history** to see them. **New load** still supports manual planning.

**Carriers** remains available for allocation, copying VINs, milestone coverage, and sheet check history. Its paste area uses the same full-sheet rules. **Load builds** displays the whole selected carrier batch with brand/model, reference/appointment, comments, POL/POD details, truck plate, and ETD/ATD/ETA/ATA. The overview and carrier comparison include progress and the not-load-built count.

Google Sheets checks remain manual copy/paste. The [carrier sheet template](templates/carrier-sheet.tsv) supplies a reusable header row.

## Project settings (v0.6.0)

Open **Project settings** beside Import units on any project page.

- Edit the project name and customer/brand at any time. VINs, loads, dates, prices and carrier allocations stay attached to the same project.
- **Use an editable estimate** lets you raise or lower the estimated unit volume. Dashboard delivery progress uses that target.
- **Use the packing-list total automatically** uses the current unique VIN count across all packing lists as the target, including when the final quantity is lower than the original estimate. New VIN imports update it automatically; re-pasting existing VINs does not increase it. Your estimate is retained so you can switch back. An empty project correctly shows zero in this mode.
- The **Total imported** figure is always the number of vehicle records. Changing the target does not create or remove VINs; VINs omitted from a repeat paste remain saved.
- **Delete project** opens a confirmation showing the records to be removed. Type the current project name and choose **Permanently delete project**. This removes that project's VINs, packing lists, loads, carriers, rates, sheet checks, schedule alerts and activity in one transaction. Other projects are preserved. Back up your data folder beforehand if you need to recover it; the optional CSV export contains the unit register only.
- After deletion, the app selects a remaining project. If none remain, it shows **Create your first project**. Deleted projects are not recreated on restart.

## Calendar, pricing and schedule changes (v0.5.0)

- **Calendar** displays planned pickups (ETD). Choose deliveries (ETA) or both, filter by carrier, and move between months. Click a movement to open the load or VIN. VINs sharing a load and timestamp are grouped; differing dates within a load remain visible separately. Days and times use your browser's timezone.
- **Pricing & analysis** lets each project choose cost per load/unit and revenue per load/unit independently. Existing **Price (EUR)** remains the unit cost. Add unit revenue in VIN details, bulk edit or a pasted **Unit revenue (EUR)** column. Load details contain separate cost and revenue fields.
- Set project default rates and choose **Fill blank prices only**, **Replace existing prices**, or **Defaults for future imports / loads only**. Only the selected cost/revenue bases contribute to analysis, preventing double counting. New VINs/loads inherit their respective defaults. Select particular loads in the pricing table to apply a different bulk rate.
- Revenue minus cost is **planned margin**, based on recorded amounts. Missing price entries are flagged; future load prices for VINs without a load are excluded. Zero is a recorded price, distinct from a blank. Amounts are EUR with up to two decimals.
- **Ready to go** is the additional unit stage when **Reference / Appointment #** is present, or the sheet explicitly says Ready. Actual departure/delivery stages take precedence. Truck plate, ETD or load membership establishes Scheduled; generated load references do not establish readiness. A load is ready when every VIN is ready.
- Carrier paste previews prominently show changed existing ETD/ETA dates, old and new values, earlier/later movement, affected loads and VINs. New dates added to blank cells are normal planning updates. Equal timestamps in different timezone formats do not create risks. Blank cells preserve saved dates.
- After applying a paste, **Schedule changes** and the dashboard retain alerts until you **Mark followed up**. Expand each alert's VIN list to open individual records; the load reference opens the load. Followed-up alerts remain available in history.
- **All project loads** on the dashboard, carrier workspace and load workspace shows totals across all carriers, scheduled loads including ready loads, readiness and actual progress. Empty inferred groups retained after repartitioning are excluded; manual draft loads remain in the total and are counted as awaiting planning.

## Sheet columns

The header-only [packing list template](templates/packing-list.tsv) can be pasted into Google Sheets. These columns are recognised automatically:

| Your header | Stored field |
| --- | --- |
| Brand, VIN, Model, Reference / Appointment # | Vehicle identity and reference |
| Status | Original sheet status |
| Comments, Port Comment | Combined comments, separated by a newline |
| POL-COUNTRY, POL-CTY / POL-CITY, POL-ZIPCODE, POL-ADDRESS | Loading country, city, postcode, address |
| POD-COUNTRY, POD-CITY, POD-ZIPCODE, POD-ADDRESS | Delivery country, city, postcode, address |
| Dealer name | Dealer |
| ETD, ATD, ETA, ATA | Estimated and actual departure/arrival |
| Carrier, Truck plate | Carrier and truck registration |
| Price(EUR) | Unit transport cost in EUR |
| Unit revenue (EUR) | Revenue per unit in EUR |
| T1 | Yes, No, or not specified |

If your sheet has a single header `carrier Truck plate`, it maps to Carrier and preserves the entire cell. For separate values, use separate Carrier and Truck plate columns, or remap the column to Truck plate in the preview.

Both tab-separated clipboard data and CSV text are accepted. Quoted multiline comments are supported. VINs are normalised to uppercase and must be 17 letters/digits, without I, O, or Q. A checksum is not enforced because international VIN formats differ.

Dates accept `YYYY-MM-DD`, `DD/MM/YYYY` (default), or `MM/DD/YYYY` when selected in the preview, with optional `HH:mm`. ISO timestamps with explicit timezone offsets are also supported. Dates without an offset use the browser's timezone, displayed in the app. Impossible dates and arrival-before-departure are rejected. European and international decimal/currency formats are supported for prices; ambiguous amounts must be made explicit, for example `1.234,00` rather than `1.234`.

## Tracking rules

- A VIN is unique **within a project**. The same vehicle can appear in another project for a later transport or shunting operation.
- Re-importing an existing VIN updates supplied values. Blank cells preserve existing values, including actual milestones and load assignment. Importing it into a different named list moves it to that list; each unit has one current packing list.
- Imports are atomic. Invalid rows prevent the entire batch from being written. The expected project count is a planning target, not a hard limit.
- Operational status is inferred: ATA means **Delivered**, ATD means **In transit**, Reference / Appointment # means **Ready to go**, otherwise truck plate, a load or ETD means **Scheduled**. Recognised sheet statuses (Delivered/Completed, In transit/Departed/Loaded, Scheduled/Planned, Ready/Ready to go) are used when actual dates are absent. Unknown sheet statuses are retained for reference. Delivered vehicles without ATA remain visible and are counted as missing actual arrival.
- A unit can be assigned to one current load. Capacity, project ownership, duplicate selections, and already departed/delivered units are checked by the API.
- Assignment copies the load route, planned dates, carrier, and truck to the unit. Updating a load synchronises those fields to all its assigned units. Address details, comments, prices, T1, and actual dates stay with the unit.
- The manual **Remove from load** action clears ETD and ETA. A full-sheet update returning planned units to the pool keeps their saved dates. Departed/delivered loads are protected in both flows.
- Overdue means ETA has passed and the unit is not delivered.
- CSV exports include all project units and fields. Potential spreadsheet formulas in text are escaped.

## Storage and backups

SQLite stores data on the server in `data/tms.sqlite`, independent of browser storage. Reloading the browser or restarting the server retains projects and units. There are no invented real vehicle records and no required credentials.

```sh
npm run backup
```

This creates a consistent SQLite backup under `data/backups/`, even while the app is running. Keep backups or CSV exports somewhere durable before deleting or replacing the workspace. `data/`, backups, local tooling caches, and generated outputs are ignored by Git.

Optional runtime overrides: `PORT` (default 3000), `HOST` (default 127.0.0.1), `TMS_DB_PATH` (default `data/tms.sqlite`). They are not required to run the workspace version. This first version has no login/access control and is intended for this workspace. Shared hosting will need authentication, deployment, and a deliberate durable-storage setup. Google Sheets input is manual copy/paste; automatic synchronisation is not implemented.

## Validation

```sh
npm run build       # Type check and production bundle
npm test            # API/import tests, including 400-unit import and bulk editing
npm run test:e2e    # Browser workflows against a separate test database
```

The browser tests use the installed `/usr/bin/chromium` and `.local/e2e.sqlite` on port 3100. Set `CHROMIUM_PATH` if the browser lives elsewhere. They cover import, validation, repeat import, the generic Loading/Unloading sheet, shared details, saved mappings, bulk editing across pages, load creation/assignment, departure, arrival, editing, CSV export, persistence, project creation, sample data, and mobile navigation.

## Structure

- `client/src/`: dashboard, vehicle register, packing lists, imports, vehicle editing, and load planner.
- `server/`: Express API, SQLite schema, tracking/validation rules, server startup, and backup command.
- `tests/`: API/import and real-browser workflows.
- `templates/`: header-only template for your Google Sheet.

No external services are needed at runtime. Fonts are bundled locally. Dependencies come from the npm registry and are pinned by `package-lock.json`.
