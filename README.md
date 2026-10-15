# Ultraplast Smart Conveyor Planner & Estimator

A static web app (HTML + CSS + vanilla JavaScript, **no build step, no dependencies**) that helps a customer plan a
*preliminary* conveyor system and send the details to Ultraplast. It is **not** an engineering design tool and
**never shows prices**.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell (must stay at the repository root for GitHub Pages) |
| `styles.css` | Branding and responsive layout |
| `app.js` | UI: wizard, validation, results dashboard, enquiry form |
| `calculations.js` | Calculation engine (no DOM). Formulas F1-F10 documented at the top |
| `products.js` | **Editable product configuration** + company details |
| `config.js` | Deployment settings: enquiry endpoint, upload endpoint (no secrets) |
| `report.js` | JSON summary + built-in PDF writer (no library needed) |
| `enquiry.js` | Contact validation, submit, email draft, WhatsApp link |
| `costing.js` | Internal rate-card cost estimate (ships with no prices; see `docs/COSTING.md`) |
| `conveyor3d.js` | Interactive **3D conveyor** (drag to rotate, zoom, pan; true-scale geometry, dimensions, moving products) - no libraries |
| `schematic.js` | 2D plan-view SVG (the "Plan view" tab) |
| `sheetconfig.js` | Optional: reads product data from a Google Sheet (published CSV) |
| `google-sheets/` | `Code.gs` (saves enquiries into the sheet) + database template workbook |
| `simulation.js` | Animated running-conveyor simulation (products move along the route at your speed and spacing) |
| `examples/` | Sample project files (use "Load JSON") |
| `tests/` | Automated tests |
| `docs/VERIFICATION_CHECKLIST.md` | Company values that need engineering sign-off |

## How the conveyor builds as you type
The preview panel shows a **Build progress** checklist (floor, product, throughput, route, conveyor running). As soon as the
route, product and speed are known, the 3D conveyor (frame, guide rails, supports, rollers, motor, moving belt and products at their
entered size) starts running in the preview, and the results page shows the finished conveyor in a full 3D viewer with a dimension schedule.

### What is drawn to scale, and what is indicative
- **To scale from your entries:** floor, obstacle footprints, route length, curve radius and sweep, incline run / rise / slope, belt width, elevations, product length / width / height, product spacing and lanes.
- **Indicative only (drawn so it reads like a conveyor, always labelled):** side-frame section, guide rails, support legs and their spacing (until `engineering.legSpacingMm` is set), end rollers, motor, belt thickness, obstacle height (not asked for).
- Nothing in the 3D view is a structural, drive or tension design. Inlet height not entered -> drawn at an illustrative 900 mm and the page says so.

## Run locally
```bash
python3 -m http.server 8080      # then open http://localhost:8080
```
(or just double-click `index.html`).

## Testing
```bash
node tests/calculations.test.js   # calculation engine (no install needed, Node 14+)
node tests/simulation.test.js     # animation maths (spacing, delivered count, output rate)
node tests/costing.test.js        # rate-card cost maths, import validation, no default prices
node tests/conveyor3d.test.js     # 3D geometry accuracy (belt length/width/height, curve radii, rise, product size, legs)
node tests/sheets.test.js         # Google Sheet loader + Apps Script (mocked)
node tests/browser-sheet.js       # optional browser test with simulated Google endpoints
node tests/report.test.js         # JSON/PDF generation + enquiry service failure modes
node tests/browser-smoke.js       # optional: real browser, desktop + mobile (needs Playwright + Chromium)
```
The browser test saves screenshots to `tests/screenshots/`. Manual checklist before going live:
real phone (iOS Safari / Android Chrome), keyboard-only use, PDF opens in Acrobat, and a real submission to your form service.

## Configure
### Products and specifications - `products.js`
Edit values only after engineering verification. `null` means "unknown" and makes the app say *Engineering review required*.
Never add prices.

### Enquiry submission - `config.js`
GitHub Pages cannot receive data. Create a form service (Formspree, Web3Forms, Google Apps Script web-app, or your own
server) that accepts a JSON `POST`, and paste its **public** URL into `enquiry.endpoint`. Do **not** put secrets in this repo.
Until then the Submit button says plainly that nothing was sent, and the user can open an email draft instead.
The app shows success **only** if the service replies HTTP 2xx.

### Google Sheet database (optional)
See `docs/GOOGLE_SHEETS_SETUP.md`: product data can be edited in a Google Sheet, and enquiries can be saved as rows in it.

### WhatsApp
Disabled until you set `company.whatsappNumber` (digits with country code) **and** `whatsappVerified: true` in `products.js`.

### Uploads
Disabled unless `upload.endpoint` is set to a secure service.

## Deploy to GitHub Pages (step by step)
1. Sign in at https://github.com (create a free account if needed).
2. Click **+** (top right) -> **New repository**. Name it e.g. `conveyor-planner`. Choose **Public** (free GitHub Pages needs public unless you have a paid plan). Do **not** tick "Add a README". Click **Create repository**.
3. On the empty repo page click **uploading an existing file**.
4. Unzip the project on your computer. Open the folder, select **everything inside it** (`index.html`, `app.js`, `tests`, ...) and drag it into the GitHub page. `index.html` must be at the top level, not inside another folder. Hidden file `.nojekyll` should be included (if it is not, skip it - the site still works).
5. Write a commit message such as "Add conveyor planner" and click **Commit changes**.
6. Go to **Settings -> Pages**. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, then **Save**.
7. Wait 1-2 minutes and refresh. The site address appears at the top: `https://YOUR-USERNAME.github.io/conveyor-planner/`.
8. Open it, run an example, and test PDF/JSON download and the enquiry form.
9. To update later: open a file in GitHub -> pencil icon -> edit -> **Commit changes**; or drag new files over via **Add file -> Upload files**.

Command-line alternative:
```bash
cd ultraplast-conveyor-planner
git init -b main
git add .
git commit -m "Add conveyor planner"
git remote add origin https://github.com/YOUR-USERNAME/conveyor-planner.git
git push -u origin main
```
Optional custom address (e.g. `planner.ultraplastindia.com`): Settings -> Pages -> **Custom domain**, then add a `CNAME` DNS record pointing to `YOUR-USERNAME.github.io` at your DNS provider.

## Add it to ultraplastindia.com
The site appears to be WordPress. Easiest and safest:
1. Create a page "Conveyor Planner" and add a **Custom HTML** block containing:
```html
<iframe src="https://YOUR-USERNAME.github.io/conveyor-planner/" title="Ultraplast Conveyor Planner"
        style="width:100%;min-height:1400px;border:0" loading="lazy"></iframe>
```
2. Or simply link a menu button to the GitHub Pages / custom-domain address.
If the iframe is cut off, increase `min-height`. (The app does not post its height to the parent page; ask a developer if you want auto-resize.)
Hosting under a subdomain of your own domain is recommended so customers see an Ultraplast address.

## What the tool will and will not do
* Calculates: floor area, path length from real segment geometry (straight, curve = R x angle, incline = sqrt(run² + rise²)), fit on floor and obstacle clash, minimum speed / capacity / product load, product envelope width, and - only for a simple straight two-pulley layout with diameter or pitch+teeth - belt loop length (2C + πD).
* Never selects motor, torque, tension, shafts, sprockets, roller pitch, structure or capacities - always "Engineering review required".
* Every result carries a status: Customer-provided, Calculated estimate, Configuration-dependent, or Engineering review required.
* Customer details are never stored in the browser; they leave the page only when Submit is pressed and a configured service exists.
