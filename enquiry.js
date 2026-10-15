/*
 * enquiry.js — ENQUIRY INTEGRATION (validation + submit + email / WhatsApp fallbacks)
 * ---------------------------------------------------------------------------
 * Rules enforced here:
 *  - success is reported ONLY when the remote service answers with an HTTP 2xx (and
 *    the optional successField, if configured, is truthy);
 *  - nothing is stored in localStorage;
 *  - no secrets live in this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPEnquiry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function validateContact(c) {
    var e = {};
    c = c || {};
    var t = function (k) { return String(c[k] === undefined || c[k] === null ? '' : c[k]).trim(); };
    if (t('name').length < 2) e.name = 'Enter your name.';
    if (t('company').length < 2) e.company = 'Enter your company name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t('email'))) e.email = 'Enter a valid work email.';
    var digits = t('mobile').replace(/[\s\-()]/g, '');
    if (!/^\+\d{8,15}$/.test(digits)) e.mobile = 'Enter the mobile number with country code, e.g. +91 98XXXXXXXX.';
    if (t('city').length < 2) e.city = 'Enter your city.';
    if (t('state').length < 2) e.state = 'Enter your state.';
    if (!t('timeline')) e.timeline = 'Choose a project timeline.';
    if (!c.consent) e.consent = 'Please tick the consent box so Ultraplast may contact you.';
    return e;
  }

  /** @returns Promise<{status:'sent'|'not_configured'|'failed', message:string}> */
  function submit(payload, cfg, fetchImpl) {
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    cfg = cfg || {};
    if (!cfg.endpoint) return Promise.resolve({ status: 'not_configured', message: 'The online enquiry service is not connected yet. Your enquiry has NOT been sent. Use the email or phone options below.' });
    if (!f) return Promise.resolve({ status: 'failed', message: 'This browser cannot send the enquiry. Your enquiry has NOT been sent.' });
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null, timedOut = false;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { timedOut = true; if (ctl) ctl.abort(); resolve({ status: 'failed', message: 'The enquiry service did not respond in time. Your enquiry has NOT been sent. Please try again or use email.' }); }, cfg.timeoutMs || 15000);
    });
    var req = Promise.resolve().then(function () {
      return f(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': cfg.sendAs === 'text' ? 'text/plain;charset=utf-8' : 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer' });
    }).then(function (resp) {
      if (!resp || !resp.ok) return { status: 'failed', message: 'The enquiry service returned an error' + (resp && resp.status ? ' (HTTP ' + resp.status + ')' : '') + '. Your enquiry has NOT been sent.' };
      if (cfg.successField) {
        return resp.json().then(function (j) {
          return j && j[cfg.successField] ? { status: 'sent', message: 'Enquiry received by the service.' } : { status: 'failed', message: 'The service did not confirm receipt. Your enquiry has NOT been sent.' };
        }, function () { return { status: 'failed', message: 'The service reply could not be read. Delivery is NOT confirmed.' }; });
      }
      return { status: 'sent', message: 'Enquiry received by the service.' };
    }).catch(function () {
      return timedOut ? null : { status: 'failed', message: 'Network error. Your enquiry has NOT been sent. Please check your connection or use email.' };
    });
    return Promise.race([req, timeout]).then(function (r) { clearTimeout(timer); return r || { status: 'failed', message: 'The enquiry service did not respond in time. Your enquiry has NOT been sent.' }; });
  }

  function enquiryPayload(contact, summary) {
    return {
      source: 'ultraplast-conveyor-planner',
      submittedAt: new Date().toISOString(),
      contact: {
        name: String(contact.name).trim(), company: String(contact.company).trim(), email: String(contact.email).trim(),
        mobile: String(contact.mobile).replace(/[\s\-()]/g, ''), city: String(contact.city).trim(), state: String(contact.state).trim(),
        timeline: contact.timeline, budgetRange: contact.budget || null, comments: String(contact.comments || '').trim(), consentToContact: !!contact.consent
      },
      project: summary
    };
  }

  function shortText(model, contact) {
    var lines = ['Conveyor enquiry via Ultraplast Planner', 'Project: ' + model.project];
    if (model.type) lines.push('Suggested type: ' + model.type);
    if (model.path) lines.push('Route length: ' + model.path);
    if (model.rate) lines.push('Throughput: ' + model.rate);
    if (model.product) lines.push('Product: ' + model.product);
    if (contact && contact.name) lines.push('From: ' + contact.name + (contact.company ? ', ' + contact.company : ''));
    lines.push('(Project JSON/PDF attached separately.)');
    return lines.join('\n');
  }
  function mailtoUrl(to, subject, body) {
    var u = 'mailto:' + encodeURIComponent(to).replace('%40', '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    return u.length > 1900 ? u.slice(0, 1900) : u;
  }
  /** Returns null unless the number has been explicitly verified in products.js */
  function whatsappUrl(company, text) {
    if (!company || !company.whatsappVerified || !company.whatsappNumber) return null;
    var num = String(company.whatsappNumber).replace(/\D/g, '');
    if (num.length < 8) return null;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  }

  return { validateContact: validateContact, submit: submit, enquiryPayload: enquiryPayload, shortText: shortText, mailtoUrl: mailtoUrl, whatsappUrl: whatsappUrl };
});
