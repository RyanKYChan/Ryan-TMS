# RYAN · Transport operations

A mini TMS for vehicle spot transport and shunting, starting with a Maxus project of 400 expected units. Projects, customers, packing lists, and loads are reusable for future work.

## Open it on your Windows computer

ChatGPT's cloud environment page does not expose the web app. The server must run on your own computer, or the app needs a separate hosted deployment. Opening the HTML files directly does not start the API.

Install Node.js 24, extract the downloadable app ZIP, and double-click `START-TMS.cmd` in the extracted folder. It installs dependencies on first use and starts the built app. Edge opens after a successful readiness check. Keep the command window open while using the app. See `OPEN-ME.txt` for step-by-step instructions. The ZIP excludes workspace databases and starts with an empty real project.

The launcher can also be run using `npm run open` after dependencies and the production build are present. Browser launch is Windows-specific; other systems display a local address. The dashboard, import, and tracking logic are the same as the workspace version.

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

Use **Explore a sample project** to try the flow before real data arrives. Sample VINs, routes, carriers, and prices live in a separate, clearly labelled demo project. Real projects start empty.

## Sheet columns

The header-only [packing list template](templates/packing-list.tsv) can be pasted into Google Sheets. These columns are recognised automatically:

| Your header | Stored field |
| --- | --- |
| Brand, VIN, Model, Reference | Vehicle identity and reference |
| Status | Original sheet status |
| Comments, Port Comment | Combined comments, separated by a newline |
| POL-COUNTRY, POL-CTY / POL-CITY, POL-ZIPCODE, POL-ADDRESS | Loading country, city, postcode, address |
| POD-COUNTRY, POD-CITY, POD-ZIPCODE, POD-ADDRESS | Delivery country, city, postcode, address |
| Dealer name | Dealer |
| ETD, ATD, ETA, ATA | Estimated and actual departure/arrival |
| Carrier, Truck plate | Carrier and truck registration |
| Price(EUR) | Unit transport price in EUR |
| T1 | Yes, No, or not specified |

If your sheet has a single header `carrier Truck plate`, it maps to Carrier and preserves the entire cell. For separate values, use separate Carrier and Truck plate columns, or remap the column to Truck plate in the preview.

Both tab-separated clipboard data and CSV text are accepted. Quoted multiline comments are supported. VINs are normalised to uppercase and must be 17 letters/digits, without I, O, or Q. A checksum is not enforced because international VIN formats differ.

Dates accept `YYYY-MM-DD`, `DD/MM/YYYY` (default), or `MM/DD/YYYY` when selected in the preview, with optional `HH:mm`. ISO timestamps with explicit timezone offsets are also supported. Dates without an offset use the browser's timezone, displayed in the app. Impossible dates and arrival-before-departure are rejected. European and international decimal/currency formats are supported for prices; ambiguous amounts must be made explicit, for example `1.234,00` rather than `1.234`.

## Tracking rules

- A VIN is unique **within a project**. The same vehicle can appear in another project for a later transport or shunting operation.
- Re-importing an existing VIN updates supplied values. Blank cells preserve existing values, including actual milestones and load assignment. Importing it into a different named list moves it to that list; each unit has one current packing list.
- Imports are atomic. Invalid rows prevent the entire batch from being written. The expected project count is a planning target, not a hard limit.
- Operational status is inferred: ATA means **Delivered**, ATD means **In transit**, a load or ETD means **Scheduled**. Recognised sheet statuses (Delivered/Completed, In transit/Departed/Loaded, Scheduled/Planned) are used when actual dates are absent. Unknown sheet statuses are retained for reference. Delivered vehicles without ATA remain visible and are counted as missing actual arrival.
- A unit can be assigned to one current load. Capacity, project ownership, duplicate selections, and already departed/delivered units are checked by the API.
- Assignment copies the load route, planned dates, carrier, and truck to the unit. Updating a load synchronises those fields to all its assigned units. Address details, comments, prices, T1, and actual dates stay with the unit.
- Removing a unit from a load clears ETD and ETA. Departed/delivered units cannot be removed until their status and actual dates are corrected individually.
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
npm test            # 14 API/import tests, including 400 units
npm run test:e2e    # Browser workflows against a separate test database
```

The browser tests use the installed `/usr/bin/chromium` and `.local/e2e.sqlite` on port 3100. Set `CHROMIUM_PATH` if the browser lives elsewhere. They cover import, validation, repeat import, load creation/assignment, departure, arrival, editing, CSV export, persistence, project creation, sample data, and mobile navigation.

## Structure

- `client/src/`: dashboard, vehicle register, packing lists, imports, vehicle editing, and load planner.
- `server/`: Express API, SQLite schema, tracking/validation rules, server startup, and backup command.
- `tests/`: API/import and real-browser workflows.
- `templates/`: header-only template for your Google Sheet.

No external services are needed at runtime. Fonts are bundled locally. Dependencies come from the npm registry and are pinned by `package-lock.json`.
