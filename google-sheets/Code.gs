/**
 * Ultraplast Conveyor Planner - Google Apps Script that SAVES ENQUIRIES INTO THE SHEET.
 *
 * Setup: open the Google Sheet -> Extensions -> Apps Script -> paste this file -> Deploy -> New deployment
 *        -> type "Web app" -> Execute as: Me -> Who has access: Anyone -> Deploy -> copy the Web app URL
 *        into config.js (enquiry.endpoint). See docs/GOOGLE_SHEETS_SETUP.md.
 * Nothing secret is stored in the website. Re-deploy ("Manage deployments" -> edit -> New version) after any change here.
 */
var SHEET_NAME = 'Enquiries';
var HEADERS = ['Received (server time)', 'Name', 'Company', 'Email', 'Mobile', 'City', 'State', 'Timeline', 'Budget', 'Comments', 'Consent',
  'Project name', 'Conveyor type', 'Route length (m)', 'Throughput (/min)', 'Product', 'Floor L x W (m)', 'Status', 'Project JSON'];
var MAX_BODY = 200000;      // characters
var MAX_CELL = 45000;       // Sheets cell limit is 50,000

function doPost(e) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    locked = lock.tryLock(15000);
    if (!locked) return out_({ ok: false, error: 'busy' });
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BODY) return out_({ ok: false, error: 'bad_size' });
    var b = JSON.parse(raw), c = b.contact || {}, p = b.project || {}, r = p.results || {}, f = p.formState || {};
    var err = validate_(c); if (err) return out_({ ok: false, error: err });
    var sh = sheet_();
    sh.appendRow([
      new Date(), s_(c.name), s_(c.company), s_(c.email), s_(c.mobile), s_(c.city), s_(c.state), s_(c.timeline), s_(c.budgetRange), s_(c.comments, 2000), c.consentToContact ? 'YES' : 'NO',
      s_(f.projectName), s_(r.recommendation && r.recommendation.selectedName), r.path ? r.path.total_m : '', r.throughput ? r.throughput.ratePerMin : '', s_(f.productName),
      s_(f.floorLength + ' x ' + f.floorWidth), 'New', s_(JSON.stringify(p), MAX_CELL)
    ]);
    return out_({ ok: true });
  } catch (x) {
    return out_({ ok: false, error: 'server_error' });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet() { return out_({ ok: true, service: 'ultraplast-enquiry' }); }

function validate_(c) {
  if (!c.consentToContact) return 'no_consent';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c.email || ''))) return 'bad_email';
  if (String(c.name || '').length < 2 || String(c.company || '').length < 2) return 'missing_fields';
  if (!/^\+\d{8,15}$/.test(String(c.mobile || ''))) return 'bad_mobile';
  return null;
}
/** Text cell, truncated, with formula-injection guard (=, +, -, @ at the start become plain text). */
function s_(v, max) {
  if (v === null || v === undefined) return '';
  var t = String(v).slice(0, max || 500);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
function sheet_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold'); }
  return sh;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
