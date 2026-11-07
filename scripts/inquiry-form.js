/**
 * Contact inquiries use FormSubmit's documented HTML form POST.
 * A JSON fetch needs a CORS preflight. On Nov 7, 2026 that OPTIONS
 * request returned Cloudflare HTTP 522 and the POST was never sent.
 * The return URL carries a random attempt id, not the visitor's details.
 * It counts only when that id is still pending in this browser, and only once.
 * The redirect is not proof the message reached an inbox.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
  if (root) root.CMEInquiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ACTION = 'https://formsubmit.co/hello@creativemotionevents.com';
  var COPY_TO = 'cmeinquiries@mail.grokbot.com';
  var STORAGE_KEY = 'cme-contact-inquiry';
  var RETURN_BASE = 'https://creativemotionevents.com/contact/';
  var SUCCESS = 'Thank you. FormSubmit sent you back using the return address for this attempt. That is its usual redirect after it accepts a form for processing. This page cannot confirm that the message has arrived in an inbox. You can expect a response within 24 hours if it was delivered.';
  var UNCERTAIN = 'This page did not get confirmation of your last attempt. Your details are still here. Send again only if you want another inquiry, because the first one may already have been received.';
  var UNMATCHED = 'This return link does not match the attempt saved in this browser. Your saved details are still here. Send again only if you want another inquiry, because an earlier one may already have been received.';
  var UNMATCHED_EMPTY = 'This return link does not match an attempt saved in this browser. It does not confirm a submission.';
  var REPLAYED = 'This return link was already used. It does not confirm another submission.';
  var STORAGE_WRITE = "This browser couldn't save a copy of this form. If you send it, coming back may not restore these fields, and this page will not recognize that return. Choose Send anyway to post it anyway.";
  var STORAGE_READ = "This browser couldn't read the saved attempt. Nothing was restored, and this page cannot confirm a return.";
  var FOOT_READY = 'Creative Motion Events specializes in elevated event design and full-service production. After a message arrives, you can expect a response within 24 hours.';
  var FOOT_UNCERTAIN = 'Creative Motion Events specializes in elevated event design and full-service production. A second send is a separate inquiry.';
  var FOOT_STORAGE = 'No copy of the form was restored from this browser.';

  function validAttemptToken(token) {
    return typeof token === 'string' && /^[A-Za-z0-9]{20,32}$/.test(token);
  }

  function attemptsOf(stored) {
    if (!stored || typeof stored !== 'object' || !stored.attempts || typeof stored.attempts !== 'object') return {};
    return stored.attempts;
  }

  function pendingAttempts(stored) {
    var attempts = attemptsOf(stored);
    return Object.keys(attempts).filter(function (id) {
      var item = attempts[id];
      return item && item.id === id && item.pending === true && item.consumed !== true && validAttemptToken(id);
    }).sort(function (a, b) {
      return (attempts[b].created || 0) - (attempts[a].created || 0);
    });
  }

  function inquiryView(search, stored, options) {
    if (options && options.storageUnavailable) return 'storage-unavailable';
    var params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    var token = params.get('inquiry') || '';
    var attempts = attemptsOf(stored);
    var match = validAttemptToken(token) && attempts[token] && attempts[token].id === token ? attempts[token] : null;
    if (match && match.pending === true && match.consumed !== true) return 'matched';
    if (match && match.consumed === true) return 'replayed';
    if (token) return 'unmatched';
    if (pendingAttempts(stored).length) return 'uncertain';
    return 'ready';
  }

  function returnUrl(origin, id) {
    var base = RETURN_BASE;
    if (origin) base = String(origin).replace(/\/$/, '') + '/contact/';
    return base + '?inquiry=' + id;
  }

  function mount() {
    var form = document.getElementById('inquiryForm');
    if (!form || form.getAttribute('data-inquiry-bound') === 'true') return;
    form.setAttribute('data-inquiry-bound', 'true');
    if (form.getAttribute('action') !== ACTION) form.setAttribute('action', ACTION);
    if ((form.getAttribute('method') || '').toLowerCase() !== 'post') form.setAttribute('method', 'post');
    var statusEl = document.getElementById('inquiryStatus');
    var submitBtn = document.getElementById('inquirySubmit');
    var foot = document.getElementById('inquiryFoot');
    var another = document.getElementById('inquiryAnother');
    if (!statusEl || !submitBtn) return;

    var navigating = false;
    var sendWithoutSave = false;

    function field(id) { return document.getElementById(id); }
    function readStore() {
      try {
        var raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return { ok: true, data: { attempts: {} } };
        var data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || !data.attempts || typeof data.attempts !== 'object') {
          return { ok: false, data: null };
        }
        return { ok: true, data: data };
      } catch (err) {
        return { ok: false, data: null };
      }
    }
    function writeStore(data) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        var back = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
        return !!(back && back.attempts);
      } catch (err) {
        return false;
      }
    }
    function newToken() {
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var bytes = new Uint8Array(24);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      var out = '';
      for (var j = 0; j < bytes.length; j++) out += chars.charAt(bytes[j] % chars.length);
      return out;
    }
    function setError(id, message) {
      var input = field(id);
      var error = field(id + '-error');
      if (error) error.textContent = message || '';
      if (!input) return;
      if (message) {
        var described = [input.getAttribute('data-described'), id + '-error'].filter(Boolean).join(' ');
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', described);
      } else {
        input.removeAttribute('aria-invalid');
        var base = input.getAttribute('data-described');
        if (base) input.setAttribute('aria-describedby', base);
        else input.removeAttribute('aria-describedby');
      }
    }
    function validEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    function digits(value) {
      return (value.match(/\d/g) || []).length;
    }
    function link(href, text) {
      var anchor = document.createElement('a');
      anchor.href = href;
      anchor.textContent = text;
      return anchor;
    }
    function showStatus(kind, lead, footText) {
      var isAlert = kind !== 'success';
      statusEl.hidden = false;
      statusEl.classList.toggle('is-error', isAlert);
      statusEl.setAttribute('role', isAlert ? 'alert' : 'status');
      statusEl.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
      statusEl.replaceChildren();
      statusEl.append(document.createTextNode(lead));
      if (isAlert) {
        statusEl.append(document.createTextNode(' You can also email '));
        statusEl.append(link('mailto:hello@creativemotionevents.com', 'hello@creativemotionevents.com'));
        statusEl.append(document.createTextNode(' or call '));
        statusEl.append(link('tel:+13013377256', '301-337-7256'));
        statusEl.append(document.createTextNode('.'));
      }
      if (foot) {
        foot.hidden = false;
        foot.textContent = footText || (isAlert ? FOOT_UNCERTAIN : FOOT_READY);
      }
      if (another) another.hidden = isAlert;
      try { statusEl.focus(); } catch (err) {}
    }
    function readyFoot() {
      form.hidden = false;
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      if (!sendWithoutSave) submitBtn.textContent = 'Send inquiry';
      statusEl.hidden = true;
      statusEl.replaceChildren();
      if (another) another.hidden = true;
      if (foot) {
        foot.hidden = false;
        foot.textContent = FOOT_READY;
      }
    }
    function snapshot() {
      return {
        name: field('inquiry-name').value,
        email: field('inquiry-email').value,
        organization: field('inquiry-organization').value,
        phone: field('inquiry-phone').value,
        eventType: field('inquiry-event-type').value,
        eventDate: field('inquiry-date').value,
        guests: field('inquiry-guests').value,
        investment: field('inquiry-investment').value,
        vision: field('inquiry-vision').value
      };
    }
    function restore(fields) {
      if (!fields) return false;
      field('inquiry-name').value = fields.name || '';
      field('inquiry-email').value = fields.email || '';
      field('inquiry-organization').value = fields.organization || '';
      field('inquiry-phone').value = fields.phone || '';
      field('inquiry-event-type').value = fields.eventType || '';
      field('inquiry-date').value = fields.eventDate || '';
      field('inquiry-guests').value = fields.guests || '';
      field('inquiry-investment').value = fields.investment || '';
      field('inquiry-vision').value = fields.vision || '';
      return true;
    }
    function pageOrigin() {
      try {
        var host = location.hostname;
        if (host === 'creativemotionevents.com' || host === 'www.creativemotionevents.com' || host === '127.0.0.1' || host === 'localhost') {
          return location.origin;
        }
      } catch (err) {}
      return 'https://creativemotionevents.com';
    }
    function recordLead(item) {
      try {
        if (typeof gtag === 'function') {
          gtag('event', 'generate_lead', {
            event_type: item.fields ? item.fields.eventType : '',
            investment: item.fields ? item.fields.investment : '',
            form_name: 'contact_inquiry'
          });
        }
      } catch (err) {}
    }
    function saveAttempt(attempt) {
      var read = readStore();
      if (!read.ok) return false;
      var data = read.data;
      data.attempts[attempt.id] = attempt;
      return writeStore(data);
    }
    function consume(id) {
      var read = readStore();
      if (!read.ok) return { ok: false };
      var item = read.data.attempts[id];
      if (!item || item.id !== id || item.pending !== true || item.consumed === true) return { ok: true, applied: false };
      item.pending = false;
      item.consumed = true;
      item.leadRecorded = true;
      if (!writeStore(read.data)) return { ok: false };
      return { ok: true, applied: true, item: item };
    }
    function latestPending(data) {
      var ids = pendingAttempts(data);
      if (!ids.length) return null;
      return data.attempts[ids[0]];
    }
    function applyView() {
      var read = readStore();
      if (!read.ok) {
        form.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send inquiry';
        showStatus('alert', STORAGE_READ, FOOT_STORAGE);
        return;
      }
      var view = inquiryView(location.search, read.data);
      if (view === 'matched') {
        var token = new URLSearchParams(location.search).get('inquiry');
        var result = consume(token);
        if (!result.ok) {
          showStatus('alert', STORAGE_READ, FOOT_STORAGE);
          return;
        }
        if (!result.applied) {
          readyFoot();
          return;
        }
        recordLead(result.item);
        form.hidden = true;
        submitBtn.disabled = true;
        showStatus('success', SUCCESS, FOOT_READY);
        return;
      }
      form.hidden = false;
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      if (!sendWithoutSave) submitBtn.textContent = 'Send inquiry';
      if (view === 'replayed') {
        var replayed = attemptsOf(read.data)[new URLSearchParams(location.search).get('inquiry')];
        if (replayed) restore(replayed.fields);
        showStatus('alert', REPLAYED, FOOT_UNCERTAIN);
        return;
      }
      if (view === 'unmatched') {
        var pending = latestPending(read.data);
        if (pending) restore(pending.fields);
        showStatus('alert', pending ? UNMATCHED : UNMATCHED_EMPTY, pending ? FOOT_UNCERTAIN : FOOT_READY);
        return;
      }
      if (view === 'uncertain') {
        var saved = latestPending(read.data);
        if (saved) restore(saved.fields);
        showStatus('alert', UNCERTAIN, FOOT_UNCERTAIN);
        return;
      }
      readyFoot();
    }
    function validate() {
      var name = field('inquiry-name').value.trim();
      var email = field('inquiry-email').value.trim();
      var phone = field('inquiry-phone').value.trim();
      var eventType = field('inquiry-event-type').value;
      var guestCount = field('inquiry-guests').value;
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
      setError('inquiry-guests', guestCount ? '' : 'Choose an estimated guest count.');
      if (!guestCount) ok = false;
      setError('inquiry-investment', investment ? '' : 'Choose an anticipated investment.');
      if (!investment) ok = false;
      if (!ok) {
        var first = form.querySelector('[aria-invalid="true"]');
        if (first) first.focus();
      }
      return ok;
    }

    if (another) {
      another.addEventListener('click', function () {
        try {
          if (window.history && window.history.replaceState) window.history.replaceState({}, '', location.pathname);
        } catch (err) {}
        readyFoot();
        field('inquiry-name').focus();
      });
    }

    form.addEventListener('submit', function (event) {
      if (navigating) {
        event.preventDefault();
        return;
      }
      if (!validate()) {
        event.preventDefault();
        return;
      }
      if (field('inquiry-honey').value) {
        event.preventDefault();
        return;
      }
      var fields = snapshot();
      var id = newToken();
      var subject = field('inquiry-subject');
      var reply = field('inquiry-replyto');
      var next = field('inquiry-next');
      if (subject) subject.value = 'New Inquiry - ' + fields.name.replace(/[\r\n]+/g, ' ').trim() + ' - ' + fields.eventType;
      if (reply) reply.value = fields.email.trim();
      if (next) next.value = returnUrl(pageOrigin(), id);
      if (!sendWithoutSave) {
        var saved = saveAttempt({
          id: id,
          pending: true,
          consumed: false,
          leadRecorded: false,
          created: Date.now(),
          fields: fields
        });
        if (!saved) {
          event.preventDefault();
          sendWithoutSave = true;
          submitBtn.textContent = 'Send anyway';
          showStatus('alert', STORAGE_WRITE, FOOT_STORAGE);
          return;
        }
      }
      navigating = true;
      submitBtn.setAttribute('aria-busy', 'true');
      event.preventDefault();
      window.setTimeout(function () {
        HTMLFormElement.prototype.submit.call(form);
      }, 0);
    });

    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      navigating = false;
      applyView();
    });

    applyView();
  }

  return {
    mount: mount,
    inquiryView: inquiryView,
    validAttemptToken: validAttemptToken,
    pendingAttempts: pendingAttempts,
    returnUrl: returnUrl,
    ACTION: ACTION,
    COPY_TO: COPY_TO,
    SUCCESS: SUCCESS,
    UNCERTAIN: UNCERTAIN,
    UNMATCHED: UNMATCHED,
    REPLAYED: REPLAYED,
    STORAGE_WRITE: STORAGE_WRITE,
    STORAGE_READ: STORAGE_READ,
    RETURN_BASE: RETURN_BASE
  };
});
