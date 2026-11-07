/**
 * Contact inquiry submission.
 * FormSubmit's AJAX flag is boolean true or the exact string "true".
 * The string "false" is truthy in JavaScript and is not acceptance.
 * An HTTP 2xx response is not acceptance by itself, and acceptance is not
 * proof the message reached an inbox.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
  if (root) root.CMEInquiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ENDPOINT = 'https://formsubmit.co/ajax/hello@creativemotionevents.com';
  var COPY_TO = 'cmeinquiries@mail.grokbot.com';
  var SUCCESS = 'Thank you. Your inquiry was accepted. You can expect a response within 24 hours.';
  var NOT_ACCEPTED = 'We could not send your inquiry. It was not accepted, and your details are still in the form.';
  var NOT_CONFIRMED = 'We could not confirm that your inquiry was accepted. Your details are still in the form.';
  var NOT_REACHED = 'We could not reach the inquiry service just now. Your details are still in the form.';
  var FAILURE_FOOT = 'Creative Motion Events specializes in elevated event design and full-service production. This attempt was not confirmed, so you should not expect a reply from it.';
  var RETRY_GAP_MS = 1000;

  function classifyInquiryResponse(status, body) {
    var code = Number(status);
    var httpOk = code >= 200 && code < 300;
    if (!httpOk) return 'http-error';
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'unreadable';
    var explicit = body.success === true || body.success === 'true';
    var message = body.message == null ? '' : String(body.message).trim();
    if (!explicit) return 'rejected';
    if (!message) return 'unreadable';
    if (/activat/i.test(message)) return 'rejected';
    if (/^(false|error|failed)$/i.test(message)) return 'rejected';
    if (/not sent|could not|unable to|something went wrong|invalid/i.test(message)) return 'rejected';
    return 'accepted';
  }

  function mount() {
    var form = document.getElementById('inquiryForm');
    if (!form || form.getAttribute('data-inquiry-bound') === 'true') return;
    form.setAttribute('data-inquiry-bound', 'true');
    var statusEl = document.getElementById('inquiryStatus');
    var submitBtn = document.getElementById('inquirySubmit');
    var foot = document.getElementById('inquiryFoot');
    if (!statusEl || !submitBtn) return;

    var phase = 'idle';
    var allowAt = 0;
    var leadRecorded = false;

    function field(id) { return document.getElementById(id); }
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
      var isError = kind !== 'success';
      statusEl.hidden = false;
      statusEl.classList.toggle('is-error', isError);
      statusEl.setAttribute('role', isError ? 'alert' : 'status');
      statusEl.setAttribute('aria-live', isError ? 'assertive' : 'polite');
      statusEl.replaceChildren();
      if (!isError) {
        statusEl.textContent = lead;
      } else {
        statusEl.append(document.createTextNode(lead + ' Email '));
        statusEl.append(link('mailto:hello@creativemotionevents.com', 'hello@creativemotionevents.com'));
        statusEl.append(document.createTextNode(' or call '));
        statusEl.append(link('tel:+13013377256', '301-337-7256'));
        statusEl.append(document.createTextNode(', or try again.'));
      }
      if (foot) {
        if (isError) {
          foot.hidden = false;
          foot.textContent = FAILURE_FOOT;
        } else {
          foot.hidden = true;
        }
      }
      form.setAttribute('aria-describedby', 'inquiryStatus');
      statusEl.focus();
      try { statusEl.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch (err) {}
    }
    function recordLead(eventType, investment) {
      if (leadRecorded) return;
      leadRecorded = true;
      try {
        if (typeof gtag === 'function') {
          gtag('event', 'generate_lead', {
            event_type: eventType,
            investment: investment,
            form_name: 'contact_inquiry'
          });
        }
      } catch (err) {}
    }
    function releaseForRetry() {
      if (phase !== 'sending') return;
      phase = 'idle';
      allowAt = Date.now() + RETRY_GAP_MS;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Send inquiry';
      submitBtn.removeAttribute('aria-busy');
      form.removeAttribute('aria-busy');
      window.setTimeout(function () {
        if (phase !== 'idle') return;
        submitBtn.disabled = false;
      }, RETRY_GAP_MS);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (phase === 'sending' || phase === 'accepted') return;
      if (Date.now() < allowAt) return;

      var name = field('inquiry-name').value.trim();
      var email = field('inquiry-email').value.trim();
      var phone = field('inquiry-phone').value.trim();
      var organization = field('inquiry-organization').value.trim();
      var eventType = field('inquiry-event-type').value;
      var eventDate = field('inquiry-date').value;
      var guestCount = field('inquiry-guests').value;
      var investment = field('inquiry-investment').value;
      var vision = field('inquiry-vision').value.trim();
      var honey = field('inquiry-honey').value;
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
        return;
      }

      if (honey) {
        phase = 'accepted';
        form.hidden = true;
        submitBtn.disabled = true;
        showStatus('success', SUCCESS);
        return;
      }

      phase = 'sending';
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      form.setAttribute('aria-busy', 'true');
      submitBtn.textContent = 'Sending...';
      statusEl.hidden = true;

      var payload = {
        _subject: 'New Inquiry - ' + name.replace(/[\r\n]+/g, ' ') + ' - ' + eventType,
        _replyto: email,
        _cc: COPY_TO,
        _template: 'table',
        _captcha: 'false',
        _honey: '',
        'Full name': name,
        'Email': email,
        'Phone': phone,
        'Organization/Company': organization,
        'Event type': eventType,
        'Event date': eventDate,
        'Estimated guest count': guestCount,
        'Anticipated investment': investment,
        'Tell us about your vision': vision
      };

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json().then(function (data) {
          return { status: response.status, body: data };
        }, function () {
          return { status: response.status, body: null };
        });
      }).then(function (result) {
        var kind = classifyInquiryResponse(result.status, result.body);
        if (kind === 'accepted') {
          recordLead(eventType, investment);
          phase = 'accepted';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sent';
          submitBtn.removeAttribute('aria-busy');
          form.removeAttribute('aria-busy');
          form.hidden = true;
          showStatus('success', SUCCESS);
          return;
        }
        if (kind === 'rejected' || kind === 'http-error') showStatus('error', NOT_ACCEPTED);
        else showStatus('error', NOT_CONFIRMED);
        releaseForRetry();
      }).catch(function () {
        if (phase !== 'sending') return;
        showStatus('error', NOT_REACHED);
        releaseForRetry();
      });
    });
  }

  return {
    mount: mount,
    classifyInquiryResponse: classifyInquiryResponse,
    ENDPOINT: ENDPOINT,
    COPY_TO: COPY_TO,
    SUCCESS: SUCCESS,
    NOT_ACCEPTED: NOT_ACCEPTED,
    NOT_CONFIRMED: NOT_CONFIRMED,
    NOT_REACHED: NOT_REACHED,
    RETRY_GAP_MS: RETRY_GAP_MS
  };
});
