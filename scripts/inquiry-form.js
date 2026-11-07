/**
 * Contact inquiries use FormSubmit's documented HTML form POST.
 * A JSON fetch needs a CORS preflight. On Nov 7, 2026 that OPTIONS
 * request returned Cloudflare HTTP 522 and the POST was never sent.
 * A document POST does not send that preflight. Landing on _next is
 * FormSubmit's documented redirect after it accepts a submission for
 * processing. It is not proof the message reached an inbox.
 * This page does not submit again unless the visitor chooses to.
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
  var CANONICAL_NEXT = 'https://creativemotionevents.com/contact/?inquiry=accepted';
  var SUCCESS = 'Thank you. FormSubmit sent you back to this page after the submission. That is its usual redirect after it accepts a form for processing. This page cannot confirm that the message has arrived in an inbox. You can expect a response within 24 hours if it was delivered.';
  var UNCERTAIN = 'This page did not get confirmation of your last attempt. Your details are still here. Send again only if you want another inquiry, because the first one may already have been received.';
  var UNCERTAIN_FOOT = 'Creative Motion Events specializes in elevated event design and full-service production. A second send is a separate inquiry.';

  function inquiryView(search, stored) {
    var params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    var redirected = params.get('inquiry') === 'accepted';
    var record = stored && typeof stored === 'object' ? stored : null;
    var id = record && typeof record.id === 'string' && record.id ? record.id : '';
    if (id && (record.done === true || (redirected && record.pending === true))) return 'redirected';
    if (id && record.pending === true) return 'uncertain';
    return 'ready';
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

    function field(id) { return document.getElementById(id); }
    function readStore() {
      try {
        var raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return null;
      }
    }
    function writeStore(record) {
      try {
        if (!record) sessionStorage.removeItem(STORAGE_KEY);
        else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      } catch (err) {}
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
    function showStatus(kind, lead) {
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
        foot.hidden = !isAlert;
        if (isAlert) foot.textContent = UNCERTAIN_FOOT;
      }
      if (another) another.hidden = isAlert;
      try { statusEl.focus(); } catch (err) {}
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
      if (!fields) return;
      field('inquiry-name').value = fields.name || '';
      field('inquiry-email').value = fields.email || '';
      field('inquiry-organization').value = fields.organization || '';
      field('inquiry-phone').value = fields.phone || '';
      field('inquiry-event-type').value = fields.eventType || '';
      field('inquiry-date').value = fields.eventDate || '';
      field('inquiry-guests').value = fields.guests || '';
      field('inquiry-investment').value = fields.investment || '';
      field('inquiry-vision').value = fields.vision || '';
    }
    function nextUrl() {
      try {
        var host = location.hostname;
        if (host === 'creativemotionevents.com' || host === 'www.creativemotionevents.com' || host === '127.0.0.1' || host === 'localhost') {
          return location.origin + '/contact/?inquiry=accepted';
        }
      } catch (err) {}
      return CANONICAL_NEXT;
    }
    function recordLead(record) {
      if (!record || record.leadRecorded) return;
      record.leadRecorded = true;
      try {
        if (typeof gtag === 'function') {
          gtag('event', 'generate_lead', {
            event_type: record.fields ? record.fields.eventType : '',
            investment: record.fields ? record.fields.investment : '',
            form_name: 'contact_inquiry'
          });
        }
      } catch (err) {}
    }
    function applyView() {
      var record = readStore();
      var view = inquiryView(location.search, record);
      if (view === 'redirected') {
        record.pending = false;
        record.done = true;
        recordLead(record);
        writeStore(record);
        form.hidden = true;
        submitBtn.disabled = true;
        showStatus('success', SUCCESS);
        return;
      }
      form.hidden = false;
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = 'Send inquiry';
      if (view === 'uncertain') {
        restore(record.fields);
        showStatus('uncertain', UNCERTAIN);
        return;
      }
      statusEl.hidden = true;
      statusEl.replaceChildren();
      if (another) another.hidden = true;
      if (foot) {
        foot.hidden = false;
        foot.textContent = 'Creative Motion Events specializes in elevated event design and full-service production. After a message arrives, you can expect a response within 24 hours.';
      }
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
        writeStore(null);
        form.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send inquiry';
        statusEl.hidden = true;
        another.hidden = true;
        if (foot) {
          foot.hidden = false;
          foot.textContent = 'Creative Motion Events specializes in elevated event design and full-service production. After a message arrives, you can expect a response within 24 hours.';
        }
        try {
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', location.pathname);
          }
        } catch (err) {}
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
      navigating = true;
      var fields = snapshot();
      var subject = field('inquiry-subject');
      var reply = field('inquiry-replyto');
      var next = field('inquiry-next');
      if (subject) subject.value = 'New Inquiry - ' + fields.name.replace(/[\r\n]+/g, ' ').trim() + ' - ' + fields.eventType;
      if (reply) reply.value = fields.email.trim();
      if (next) next.value = nextUrl();
      writeStore({
        id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        pending: true,
        done: false,
        leadRecorded: false,
        fields: fields
      });
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
    ACTION: ACTION,
    COPY_TO: COPY_TO,
    SUCCESS: SUCCESS,
    UNCERTAIN: UNCERTAIN,
    CANONICAL_NEXT: CANONICAL_NEXT
  };
});
