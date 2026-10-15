# Google Sheet database - setup guide

The planner can use **one Google Sheet** for two jobs. Both are optional; without them the site works with the values built into `products.js`.

| Job | Direction | Tabs | How it connects |
|---|---|---|---|
| **Product data** (specifications, company contact details) | Sheet -> website | `Engineering`, `Families`, `Company` | Tabs are *published to the web as CSV*; the page reads them when it opens |
| **Customer enquiries** | Website -> Sheet | `Enquiries` | A small Google Apps Script (`google-sheets/Code.gs`) adds one row per submitted enquiry |

> **Important:** never publish the `Enquiries` tab. It holds customer names, emails and phone numbers.

---

## Part 1 - Create the sheet (5 minutes)
1. Go to https://sheets.google.com and click **Blank spreadsheet**. Name it e.g. *Ultraplast Planner Database*.
2. **File -> Import -> Upload**, choose `google-sheets/Ultraplast-Planner-Database-Template.xlsx` from the project.
3. Import location: **Replace spreadsheet** -> **Import data**.
4. You now have tabs: `Engineering`, `Families`, `Company`, `Enquiries`, `READ ME`.

## Part 2 - Product data: sheet -> website
### What to edit
* **Engineering** - `key`, `value`, `verified`. Keys: `moduleLengthMm`, `legSpacingMm`, `widthAllowancePerSideMm`, `maxInclineDeg`, `maxSpeedMPerMin`. A blank value means "engineering review required" (the safe default). A filled value lets the planner calculate frame count, leg count, minimum conveyor width, etc.
* **Families** - one row per belt/chain family: width range, pitch list (separate with `;`), sprocket teeth, pin diameter, minimum side-flex radius, and which conveyor categories use it (`usedByCategories`).
* **Company** - enquiry email, phone numbers (separate with `;`), address, hours, WhatsApp number and `whatsappVerified`.
* Column **verified**: write `YES` only after an Ultraplast engineer has checked the value. The page tells customers how many values are not yet verified.
* Blank cell = keep the built-in value. A wrong value (text where a number is expected, negative number) is **ignored** and the built-in value stays.
* Do **not** type prices or secrets: published tabs are readable by anyone with the link.

### Publish the three tabs
1. In the sheet click **File -> Share -> Publish to web**.
2. On the **Link** tab, in the first drop-down choose **Engineering** (not "Entire document"). In the second drop-down choose **Comma-separated values (.csv)**.
3. Click **Publish** -> OK. Copy the link.
4. Repeat for **Families** and **Company**.
5. Open `config.js` (edit on GitHub with the pencil icon) and paste the three links:
```js
sheets: {
  engineeringCsv: 'https://docs.google.com/spreadsheets/d/e/....../pub?gid=...&single=true&output=csv',
  familiesCsv:    'https://docs.google.com/spreadsheets/d/e/....../pub?gid=...&single=true&output=csv',
  companyCsv:     'https://docs.google.com/spreadsheets/d/e/....../pub?gid=...&single=true&output=csv',
  timeoutMs: 6000
},
```
6. Commit. Open your site: the footer should say **"Product data: Google Sheet (Engineering, Families, Company)"**.

After this, staff only edit the sheet - no GitHub needed. Google refreshes published tabs within a few minutes; reload the page to see changes.

## Part 3 - Enquiries: website -> sheet
1. In the same Google Sheet: **Extensions -> Apps Script**.
2. Delete the sample code, paste the whole of `google-sheets/Code.gs`, click **Save**.
3. Click **Deploy -> New deployment**. Click the gear next to "Select type" -> **Web app**.
4. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**.
5. Click **Authorize access**, choose your Google account. If Google says "app isn't verified": **Advanced -> Go to (project name) -> Allow**. (This is your own script.)
6. Copy the **Web app URL** (ends with `/exec`). Open it in a browser tab - you should see `{"ok":true,"service":"ultraplast-enquiry"}`.
7. In `config.js` set:
```js
enquiry: {
  endpoint: 'PASTE-THE-/exec-URL-HERE',
  timeoutMs: 15000,
  sendAs: 'text',        // required for Apps Script
  successField: 'ok'     // the page says "received" only when the script returns ok:true
},
```
8. Commit, open the site, run a test project, fill the enquiry form and **Submit**. A new row should appear in the `Enquiries` tab with the contact details, project summary and full project JSON. The page shows success only after the script confirms it saved the row.

If you later edit `Code.gs`: **Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy** (the URL stays the same).

## What the script protects against
* Rejects requests without consent, with a bad email / mobile number (must start with `+` and country code) or that are oversized.
* Text starting with `=`, `+`, `-` or `@` is stored as plain text so a customer cannot plant a spreadsheet formula.
* A lock prevents two simultaneous enquiries from overwriting each other.
* Nothing secret is stored on the website. The /exec URL is public, so anyone could try to post spam; keep the sheet private and delete junk rows. For stronger protection later, put a CAPTCHA-protected service in front.

## Privacy and access
* Share the Google Sheet only with named staff (**Share** button). Anyone who can edit the `Company` tab controls the email / WhatsApp number shown to customers.
* Customer data is personal data: agree retention and deletion rules, and keep the consent wording approved by management.

## Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| Footer says "built-in values used" | A tab link is wrong, or the tab is not published as **CSV**. Re-publish and re-copy the link |
| Value in sheet has no effect | Cell is not a valid positive number, or the key name is misspelled. Open the browser console (F12) to read the warning |
| Frame/leg quantity still "To be engineered" | `moduleLengthMm` / `legSpacingMm` blank or invalid |
| Submit says "NOT been sent" | `endpoint` empty or wrong; `sendAs` not `'text'`; deployment access not **Anyone**; or the script returned an error (open the /exec URL; check Apps Script -> Executions) |
| Row missing although page said "received" | Should not happen: success requires the script's `ok:true`. Check you are looking at the `Enquiries` tab of the right sheet |
| Changes to Code.gs not working | Create a **New version** deployment (see above) |

## Not tested against real Google
These steps were tested with simulated Google replies (automated tests in `tests/sheets.test.js` and `tests/browser-sheet.js`), not against your live Google account. Do one real end-to-end test after setup.
