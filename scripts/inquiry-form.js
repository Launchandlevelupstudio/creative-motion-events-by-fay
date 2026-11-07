/**
 * Contact and Annual Design Partnership share one Formspark form.
 * Official AJAX contract (documentation.formspark.io/examples/ajax.html):
 * POST https://submit-form.com/{id} with Content-Type and Accept
 * application/json. An accepted submission is HTTP 200 and the submitted
 * fields as a JSON object. 403 is spam rejection. 402 means the workspace
 * is out of submissions. Recipients are dashboard settings, not form fields.
 * A 200 echo is provider acceptance, not proof of inbox delivery.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
  if (root) root.CMEInquiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ENDPOINT = 'https://submit-form.com/BhrPePdn2';
  var FROM_NAME = 'Creative Motion Events';

  function validAttemptToken(token) {
    return typeof token === 'string' && /^[A-Za-z0-9]{20,32}$/.test(token);
  }

  function classifyFormsparkResponse(status, body, attemptId, source) {
    var code = Number(status);
    if (code === 403) return 'rejected';
    if (code === 402) return 'quota';
    if (code !== 200) return 'http-error';
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'unreadable';
    if (!validAttemptToken(attemptId) || body.Attempt !== attemptId) return 'unreadable';
    if (body.Source !== source) return 'unreadable';
    return 'accepted';
  }

  function mount() {
    bind(document.getElementById('inquiryForm'), {
      source: 'Contact',
      subject: 'Contact inquiry',
      leadName: 'contact_inquiry',
      emailId: 'inquiry-email',
      honeypotId: 'inquiry-honeypot',
      statusId: 'inquiryStatus',
      buttonId: 'inquirySubmit',
      anotherId: 'inquiryAnother',
      footId: 'inquiryFoot',
      hideFormOnSuccess: true
    });
    bind(document.getElementById('partnershipInquiry'), {
      source: 'Annual Design Partnership',
      subject: 'Annual Design Partnership inquiry',
      leadName: 'annual-design-partnership',
      emailId: 'partnership-email',
      honeypotId: 'partnership-honeypot',
      statusId: 'partnershipStatus',
      buttonId: 'partnershipSubmit',
      hideFormOnSuccess: true
    });
  }

  function bind(form, config) {
    if (!form || form.getAttribute('data-formspark-bound') === 'true') return;
    form.setAttribute('data-formspark-bound', 'true');
    form.setAttribute('action', ENDPOINT);
    form.setAttribute('method', 'post');
    var statusEl = document.getElementById(config.statusId);
    var submitBtn = document.getElementById(config.buttonId) || form.querySelector('button[type="submit"]');
    var foot = config.footId ? document.getElementById(config.footId) : null;
    var another = config.anotherId ? document.getElementById(config.anotherId) : null;
    if (!statusEl || !submitBtn) return;

    var busy = false;
    var counted = {};

    function field(id) { return document.getElementById(id); }
    function setError(id, message) {
      var input = field(id);
      var error = field(id + '-error');
      if (!input || !error) return;
      error.textContent = message || '';
      if (message) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', id + '-error');
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }
    function validEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    function digits(value) {
      return (value.match(/\d/g) || []).length;
    }
    function showStatus(kind, text) {
      var isAlert = kind !== 'success';
      statusEl.hidden = false;
      statusEl.classList.toggle('is-error', isAlert);
      statusEl.classList.add('is-visible');
      statusEl.setAttribute('role', isAlert ? 'alert' : 'status');
      statusEl.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
      statusEl.textContent = text;
      if (foot && config.footId) {
        foot.hidden = false;
        foot.textContent = isAlert
          ? 'A second send is a separate submission.'
          : 'Creative Motion Events specializes in elevated event design and full-service production. After a message arrives, you can expect a response within 24 hours.';
      }
      if (another) another.hidden = isAlert;
      try { statusEl.focus(); } catch (err) {}
    }
    function validateContact() {
      var name = field('inquiry-name').value.trim();
      var email = field('inquiry-email').value.trim();
      var phone = field('inquiry-phone').value.trim();
      var eventType = field('inquiry-event-type').value;
      var guests = field('inquiry-guests').value;
      var investment = field('inquiry-investment').value;
      var ok = true;
      setError('inquiry-name', name ? '' : 'Enter your full name.');
      if (!name) ok = false;
      setError('inquiry-email', validEmail(email) ? '' : 'Enter a valid email address.');
      if (!validEmail(email)) ok = false;
      setError('inquiry-phone', (!phone || digits(phone) >= 7) ? '' : 'Enter a phone number with at least 7 digits, or leave it blank.');
      if (phone && digits(phone) < 7) ok = false;
      setError('inquiry-event-type', eventType ? '' : 'Choose an event type.');
      if (!eventType) ok = false;
      setError('inquiry-guests', guests ? '' : 'Choose an estimated guest count.');
      if (!guests) ok = false;
      setError('inquiry-investment', investment ? '' : 'Choose an anticipated investment.');
      if (!investment) ok = false;
      if (!ok) {
        var first = form.querySelector('[aria-invalid="true"]');
        if (first) first.focus();
      }
      return ok;
    }
    function validatePartnership() {
      var missing = form.querySelector('input[name="Contact Name"], input[name="Organization"], input[name="Work Email"], select[name="Events Per Year"]');
      var nodes = form.querySelectorAll('[required]');
      var first = null;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var bad = !String(el.value || '').trim() || (el.type === 'email' && !validEmail(el.value.trim()));
        if (bad) {
          el.setAttribute('aria-invalid', 'true');
          if (!first) first = el;
        } else {
          el.removeAttribute('aria-invalid');
        }
      }
      if (first) {
        first.focus();
        return false;
      }
      return true;
    }
    function honeypotFilled() {
      var honey = field(config.honeypotId);
      if (!honey) return false;
      if (honey.type === 'checkbox') return honey.checked;
      return !!String(honey.value || '').trim();
    }
    function collect(attemptId) {
      var data = {
        Source: config.source,
        Attempt: attemptId,
        _honeypot: '',
        _replyto: (field(config.emailId).value || '').trim(),
        _email: { subject: config.subject, from: FROM_NAME }
      };
      var nodes = form.querySelectorAll('input, select, textarea');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el.name || el.name === '_honeypot' || el.name.indexOf('_email') === 0 || el.type === 'submit' || el.type === 'button') continue;
        if (el.type === 'checkbox') continue;
        data[el.name] = el.value;
      }
      return data;
    }
    function token() {
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var bytes = new Uint8Array(24);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      var out = '';
      for (var j = 0; j < bytes.length; j++) out += chars.charAt(bytes[j] % chars.length);
      return out;
    }
    function finishSuccess() {
      if (config.hideFormOnSuccess) form.hidden = true;
      if (another) another.hidden = false;
      submitBtn.disabled = true;
    }
    function messageFor(kind, status) {
      if (kind === 'accepted') {
        return 'Formspark accepted this submission. This page cannot confirm that it reached an inbox. You can expect a response within 24 hours if it was delivered.';
      }
      if (kind === 'rejected') {
        return 'Formspark rejected this submission. Your details are still in the form. Send again only if you want another submission.';
      }
      if (kind === 'quota') {
        return 'Formspark did not accept this submission because the workspace is out of submissions. Your details are still in the form.';
      }
      if (kind === 'unreadable') {
        return 'Formspark replied, but the reply was not this submission. This page is not treating it as accepted. Your details are still in the form.';
      }
      if (kind === 'unreachable') {
        return 'This page did not get a reply from Formspark. It may not have received the submission. Your details are still in the form. Send again only if you want another submission, because the first one may already have been received.';
      }
      return 'Formspark did not accept this submission (HTTP ' + status + '). Your details are still in the form. Send again only if you want another submission.';
    }
    function recordLead(attemptId, data) {
      if (counted[attemptId]) return;
      counted[attemptId] = true;
      try {
        if (typeof gtag === 'function') {
          var payload = { form_name: config.leadName };
          if (data['Event type']) payload.event_type = data['Event type'];
          if (data['Anticipated investment']) payload.investment = data['Anticipated investment'];
          gtag('event', 'generate_lead', payload);
        }
      } catch (err) {}
    }

    if (another) {
      another.addEventListener('click', function () {
        form.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.getAttribute('data-label') || 'Send inquiry';
        statusEl.hidden = true;
        another.hidden = true;
        var first = form.querySelector('input:not([type="hidden"]):not([tabindex="-1"]), select, textarea');
        if (first) first.focus();
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy || form.hidden) return;
      var valid = config.emailId === 'inquiry-email' ? validateContact() : validatePartnership();
      if (!valid) return;
      if (honeypotFilled()) return;
      var attemptId = token();
      var data = collect(attemptId);
      busy = true;
      window.setTimeout(function () {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
      }, 0);
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (response) {
        return response.text().then(function (text) {
          var parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch (err) { parsed = null; }
          return { status: response.status, body: parsed };
        });
      }).then(function (result) {
        var kind = classifyFormsparkResponse(result.status, result.body, attemptId, config.source);
        if (kind === 'accepted') {
          recordLead(attemptId, data);
          showStatus('success', messageFor('accepted'));
          finishSuccess();
          return;
        }
        showStatus('alert', messageFor(kind, result.status));
        submitBtn.disabled = false;
      }).catch(function () {
        showStatus('alert', messageFor('unreachable'));
        submitBtn.disabled = false;
      }).then(function () {
        busy = false;
        submitBtn.removeAttribute('aria-busy');
      });
    });
  }

  return {
    mount: mount,
    classifyFormsparkResponse: classifyFormsparkResponse,
    validAttemptToken: validAttemptToken,
    ENDPOINT: ENDPOINT,
    FROM_NAME: FROM_NAME
  };
});
