/**
 * Browser checks for the contact inquiry form.
 * FormSubmit, Google Analytics, and Clarity are never contacted:
 * those requests are fulfilled locally or failed inside Chrome.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const ACCEPTED = { success: 'true', message: 'The form was submitted successfully.' };
const ACTIVATION = {
  success: 'false',
  message: "This form needs Activation. We've sent you an email containing an 'Activate Form' link. Just click it and your form will be actived!"
};

const shotsOnly = process.argv.includes('--shots-only');
const shotPrefix = (process.argv.find(function (arg) { return arg.startsWith('--prefix='); }) || '--prefix=').slice('--prefix='.length);

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (process.env.CONTACT_HTML && (pathname === '/contact/' || pathname === '/contact/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(process.env.CONTACT_HTML).pipe(res);
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, origin: 'http://127.0.0.1:' + server.address().port });
    });
  });
}

function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  const opened = new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) item.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else item.resolve(msg.result || {});
    } else if (msg.method) {
      listeners.forEach(function (fn) { fn(msg); });
    }
  });
  return opened.then(function () {
    return {
      send: function (method, params, sessionId) {
        const id = ++seq;
        return new Promise(function (resolve, reject) {
          pending.set(id, { resolve: resolve, reject: reject });
          const payload = { id: id, method: method, params: params || {} };
          if (sessionId) payload.sessionId = sessionId;
          ws.send(JSON.stringify(payload));
        });
      },
      on: function (fn) { listeners.push(fn); },
      close: function () { ws.close(); }
    };
  });
}

async function launchChrome() {
  const profile = fs.mkdtempSync('/tmp/cme-inquiry-chrome-');
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-extensions',
    '--remote-debugging-port=9333',
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });
  const version = await waitJson('http://127.0.0.1:9333/json/version');
  const browser = await cdpConnect(version.webSocketDebuggerUrl);
  return { chrome: chrome, browser: browser, profile: profile };
}

async function waitJson(url) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch (err) {}
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
  }
  throw new Error('Chrome debugging port did not open');
}

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const web = await startServer();
  const launched = await launchChrome();
  const browser = launched.browser;
  const posts = [];
  let continuedFormsubmit = 0;
  let behavior = { type: 'json', status: 200, body: ACCEPTED };
  const blockedHosts = [];

  const target = await browser.send('Target.createTarget', { url: 'about:blank' });
  const session = (await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
  function send(method, params) { return browser.send(method, params, session); }

  browser.on(function (msg) {
    if (msg.sessionId !== session || msg.method !== 'Fetch.requestPaused') return;
    const paused = msg.params;
    const url = paused.request.url;
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch (err) {}
    const local = hostname === '127.0.0.1' || hostname === 'localhost';
    const fonts = hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com';
    if (hostname === 'formsubmit.co') {
      if (paused.request.method === 'POST') {
        posts.push({ url: url, body: paused.request.postData || '' });
      }
      if (behavior.type === 'fail') {
        send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Failed' }).catch(function () {});
        return;
      }
      const headers = [
        { name: 'Access-Control-Allow-Origin', value: '*' },
        { name: 'Access-Control-Allow-Headers', value: 'content-type, accept' },
        { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
        { name: 'Cache-Control', value: 'no-store' }
      ];
      if (paused.request.method === 'OPTIONS') {
        send('Fetch.fulfillRequest', { requestId: paused.requestId, responseCode: 204, responseHeaders: headers, body: '' }).catch(function () {});
        return;
      }
      const raw = behavior.type === 'html' ? String(behavior.body || '') : JSON.stringify(behavior.body || {});
      headers.push({ name: 'Content-Type', value: behavior.type === 'html' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8' });
      send('Fetch.fulfillRequest', {
        requestId: paused.requestId,
        responseCode: behavior.status || 200,
        responseHeaders: headers,
        body: b64(raw)
      }).catch(function () {});
      return;
    }
    if (local || fonts) {
      send('Fetch.continueRequest', { requestId: paused.requestId }).catch(function () {});
      return;
    }
    blockedHosts.push(hostname);
    send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'BlockedByClient' }).catch(function () {});
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

  const report = [];
  function check(name, condition, detail) {
    report.push({ name: name, pass: !!condition, detail: detail || '' });
    if (!condition) console.error('FAIL', name, detail || '');
    else console.log('PASS', name);
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception));
    }
    return result.result ? result.result.value : undefined;
  }

  async function go() {
    posts.length = 0;
    await send('Page.navigate', { url: web.origin + '/contact/' });
    await evaluate(`new Promise(function(resolve){
      if (document.readyState === 'complete' && document.getElementById('inquiryForm')) resolve();
      else window.addEventListener('load', function(){ resolve(); });
    })`);
    await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 50); })`);
  }

  async function fill() {
    await evaluate(`(() => {
      const selectIndex = (id, index) => { document.getElementById(id).selectedIndex = index; };
      document.getElementById('inquiry-name').value = 'Amina Cole';
      document.getElementById('inquiry-email').value = 'amina@example.com';
      document.getElementById('inquiry-organization').value = 'North Hall';
      document.getElementById('inquiry-phone').value = '301-555-0100';
      selectIndex('inquiry-event-type', 1);
      document.getElementById('inquiry-date').value = 'June';
      selectIndex('inquiry-guests', 3);
      selectIndex('inquiry-investment', 3);
      document.getElementById('inquiry-vision').value = 'Gold tables under one long runner';
      document.getElementById('inquiry-honey').value = '';
    })()`);
  }

  async function submit() {
    await evaluate(`document.getElementById('inquiryForm').requestSubmit()`);
  }

  async function fireSubmit() {
    await evaluate(`document.getElementById('inquiryForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}))`);
  }

  async function waitForPosts(count) {
    const started = Date.now();
    while (posts.length < count) {
      if (Date.now() - started > 4000) break;
      await new Promise(function (resolve) { setTimeout(resolve, 20); });
    }
  }

  async function statusText() {
    return evaluate(`new Promise(function(resolve, reject){
      const start = Date.now();
      (function tick(){
        const el = document.getElementById('inquiryStatus');
        if (el && !el.hidden && el.textContent.trim()) return resolve({
          text: el.textContent,
          role: el.getAttribute('role'),
          live: el.getAttribute('aria-live'),
          hiddenForm: document.getElementById('inquiryForm').hidden,
          formDisplay: getComputedStyle(document.getElementById('inquiryForm')).display,
          name: document.getElementById('inquiry-name').value,
          email: document.getElementById('inquiry-email').value,
          vision: document.getElementById('inquiry-vision').value,
          date: document.getElementById('inquiry-date').value,
          foot: (document.getElementById('inquiryFoot') || {}).textContent || '',
          footHidden: document.getElementById('inquiryFoot') ? document.getElementById('inquiryFoot').hidden : null,
          mail: (el.querySelector('a[href^="mailto:"]') || {}).getAttribute ? el.querySelector('a[href^="mailto:"]').getAttribute('href') : '',
          tel: (el.querySelector('a[href^="tel:"]') || {}).getAttribute ? el.querySelector('a[href^="tel:"]').getAttribute('href') : ''
        });
        if (Date.now() - start > 4000) reject(new Error('status timeout'));
        setTimeout(tick, 20);
      })();
    })`);
  }

  async function leads() {
    return evaluate(`(window.dataLayer || []).filter(function(item){
      return item && item[0] === 'event' && item[1] === 'generate_lead' && item[2] && item[2].form_name === 'contact_inquiry';
    }).length`);
  }

  async function shot(name, width, height, mobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: width,
      height: height,
      deviceScaleFactor: 1,
      mobile: mobile
    });
    await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 80); })`);
    const box = await evaluate(`(() => {
      const fab = document.getElementById('fab');
      if (fab) fab.style.visibility = 'hidden';
      const el = document.getElementById('inquire');
      el.scrollIntoView({block:'start', behavior:'auto'});
      const rect = el.getBoundingClientRect();
      return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
    })()`);
    const image = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height), scale: 1 }
    });
    const file = path.join(ARTIFACTS, name);
    fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
    console.log('SHOT', file, box.width, box.height);
  }

  async function prepare(mode) {
    behavior = mode;
    await go();
    await fill();
  }

  if (shotsOnly) {
    await prepare({ type: 'json', status: 200, body: ACTIVATION });
    await submit();
    await statusText();
    await shot(shotPrefix + 'failure-desktop.png', 1280, 900, false);
    await shot(shotPrefix + 'failure-mobile.png', 390, 844, true);
    await prepare({ type: 'json', status: 200, body: ACCEPTED });
    await submit();
    await statusText();
    await shot(shotPrefix + 'success-desktop.png', 1280, 900, false);
    await shot(shotPrefix + 'success-mobile.png', 390, 844, true);
    console.log(JSON.stringify({ posts: posts.length, continuedFormsubmit: continuedFormsubmit, blockedHosts: blockedHosts }, null, 2));
    launched.chrome.kill('SIGKILL');
    web.server.close();
    browser.close();
    return;
  }

  await prepare({ type: 'json', status: 200, body: {} });
  const validation = await evaluate(`(() => {
    const name = document.getElementById('inquiry-name');
    name.value = '';
    document.getElementById('inquiry-email').value = 'not-an-email';
    document.getElementById('inquiry-phone').value = '123';
    document.getElementById('inquiry-event-type').selectedIndex = 0;
    document.getElementById('inquiry-guests').selectedIndex = 0;
    document.getElementById('inquiry-investment').selectedIndex = 0;
    document.getElementById('inquiry-vision').value = 'Keep this vision';
    document.getElementById('inquiryForm').requestSubmit();
    return {
      nameError: document.getElementById('inquiry-name-error').textContent,
      emailError: document.getElementById('inquiry-email-error').textContent,
      phoneError: document.getElementById('inquiry-phone-error').textContent,
      eventError: document.getElementById('inquiry-event-type-error').textContent,
      guestError: document.getElementById('inquiry-guests-error').textContent,
      investError: document.getElementById('inquiry-investment-error').textContent,
      vision: document.getElementById('inquiry-vision').value,
      statusHidden: document.getElementById('inquiryStatus').hidden,
      focus: document.activeElement && document.activeElement.id
    };
  })()`);
  await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 200); })`);
  check('validation does not post', posts.length === 0, 'posts ' + posts.length);
  check('validation keeps the vision field', validation.vision === 'Keep this vision', validation.vision);
  check('validation explains each required problem', validation.nameError && validation.emailError && validation.phoneError && validation.eventError && validation.guestError && validation.investError, JSON.stringify(validation));
  check('validation focuses the first invalid field', validation.focus === 'inquiry-name', validation.focus);
  check('validation does not show a send result', validation.statusHidden === true);

  await prepare({ type: 'json', status: 200, body: ACCEPTED });
  const beforeLeads = await leads();
  await evaluate(`(() => {
    const form = document.getElementById('inquiryForm');
    const fire = () => form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
    fire();
    fire();
  })()`);
  const accepted = await statusText();
  await fireSubmit();
  await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 200); })`);
  const leadCount = await leads();
  check('accepted string true shows the acceptance message', accepted.text === "Thank you. Your inquiry was accepted. You can expect a response within 24 hours.", accepted.text);
  check('accepted response posts once when submitted twice', posts.length === 1, 'posts ' + posts.length);
  check('accepted response does not post again', posts.length === 1, 'posts ' + posts.length);
  check('accepted values stay in the form', accepted.name === 'Amina Cole' && accepted.vision === 'Gold tables under one long runner' && accepted.date === 'June');
  check('accepted form is not left open for another send', accepted.hiddenForm === true && accepted.formDisplay === 'none', accepted.formDisplay);
  check('success status is polite', accepted.role === 'status' && accepted.live === 'polite', accepted.role + ' ' + accepted.live);
  check('lead analytics fires once for an accepted inquiry', leadCount === beforeLeads + 1, String(leadCount));
  const payload = JSON.parse(posts[0].body);
  check('post stays on the contact ajax endpoint', posts[0].url === 'https://formsubmit.co/ajax/hello@creativemotionevents.com', posts[0].url);
  check('copy inbox is unchanged', payload._cc === 'cmeinquiries@mail.grokbot.com', payload._cc);
  check('captcha stays off for ajax', payload._captcha === 'false', payload._captcha);
  check('reply-to is the visitor email', payload._replyto === 'amina@example.com');
  check('subject keeps the visitor and event type', payload._subject === 'New Inquiry - Amina Cole - Corporate gala or awards night', payload._subject);
  check('payload does not retarget the inbox', !JSON.stringify(payload).includes('eventsbyfaydmv@gmail.com'));

  await prepare({ type: 'json', status: 200, body: { success: true, message: 'The form was submitted successfully.' } });
  await submit();
  const boolOk = await statusText();
  check('boolean true is accepted', boolOk.text.indexOf('Your inquiry was accepted') !== -1, boolOk.text);

  await prepare({ type: 'json', status: 200, body: ACTIVATION });
  await submit();
  const rejected = await statusText();
  const rejectedLeads = await leads();
  check('provider rejection keeps every entry', rejected.hiddenForm === false && rejected.name === 'Amina Cole' && rejected.email === 'amina@example.com' && rejected.vision === 'Gold tables under one long runner' && rejected.date === 'June');
  check('provider rejection does not promise a 24 hour reply', rejected.text.indexOf('24 hours') === -1 && rejected.text.indexOf('not accepted') !== -1, rejected.text);
  check('provider rejection offers the same email and phone', rejected.mail === 'mailto:hello@creativemotionevents.com' && rejected.tel === 'tel:+13013377256', rejected.mail + ' ' + rejected.tel);
  check('provider rejection is an alert', rejected.role === 'alert' && rejected.live === 'assertive');
  check('provider rejection does not record a lead', rejectedLeads === 0, String(rejectedLeads));
  check('failure footnote does not claim the inquiry was submitted', rejected.foot.indexOf('After submitting') === -1 && rejected.foot.indexOf('not confirmed') !== -1, rejected.foot);
  const postsAfterReject = posts.length;
  await fireSubmit();
  await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 200); })`);
  check('a second submit during the retry gap does not post again', posts.length === postsAfterReject, 'posts ' + posts.length);
  await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 1100); })`);
  await submit();
  await waitForPosts(postsAfterReject + 1);
  check('a later retry posts one more time', posts.length === postsAfterReject + 1, 'posts ' + posts.length);

  await prepare({ type: 'json', status: 500, body: ACCEPTED });
  await submit();
  const httpError = await statusText();
  check('HTTP 500 with a success flag is not acceptance', httpError.text.indexOf('not accepted') !== -1 && httpError.hiddenForm === false && httpError.vision === 'Gold tables under one long runner', httpError.text);
  check('HTTP 500 does not record a lead', (await leads()) === 0);

  await prepare({ type: 'html', status: 200, body: '<!DOCTYPE html><title>Just a moment...</title>' });
  await submit();
  const unreadable = await statusText();
  check('unreadable HTTP 200 does not count as accepted', unreadable.text.indexOf('could not confirm') !== -1 && unreadable.vision === 'Gold tables under one long runner', unreadable.text);
  check('unreadable HTTP 200 does not record a lead', (await leads()) === 0);

  await prepare({ type: 'json', status: 200, body: { success: 'true', message: ACTIVATION.message } });
  await submit();
  const fake = await statusText();
  check('activation text with success true is not acceptance', fake.text.indexOf('not accepted') !== -1, fake.text);
  check('activation text does not record a lead', (await leads()) === 0);

  await prepare({ type: 'fail' });
  await submit();
  const offline = await statusText();
  check('network failure keeps the entries', offline.hiddenForm === false && offline.name === 'Amina Cole' && offline.vision === 'Gold tables under one long runner');
  check('network failure says the service was not reached', offline.text.indexOf('could not reach') !== -1 && offline.text.indexOf('24 hours') === -1, offline.text);
  check('network failure does not record a lead', (await leads()) === 0);

  await prepare({ type: 'json', status: 200, body: ACCEPTED });
  await evaluate(`window.gtag = function(){ throw new Error('analytics failed'); };`);
  await submit();
  const thrown = await statusText();
  check('an analytics failure still shows acceptance and does not post twice', thrown.text.indexOf('Your inquiry was accepted') !== -1 && posts.length === 1, thrown.text + ' posts ' + posts.length);

  await prepare({ type: 'json', status: 200, body: ACCEPTED });
  await evaluate(`document.getElementById('inquiry-honey').value = 'filled by accident';`);
  await submit();
  await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 200); })`);
  check('honeypot does not post and does not record a lead', posts.length === 0 && (await leads()) === 0, 'posts ' + posts.length);

  await prepare({ type: 'json', status: 200, body: ACTIVATION });
  await submit();
  await statusText();
  await evaluate(`new Promise(function(resolve){ setTimeout(resolve, 1200); })`);
  const settled = await evaluate(`(() => {
    const button = document.getElementById('inquirySubmit');
    return { text: button.textContent, disabled: button.disabled };
  })()`);
  check('after a rejection the button is ready for one retry', settled.text === 'Send inquiry' && settled.disabled === false, JSON.stringify(settled));
  await shot('contact-failure-desktop.png', 1280, 1000, false);
  await shot('contact-failure-mobile.png', 390, 844, true);
  await prepare({ type: 'json', status: 200, body: ACCEPTED });
  await submit();
  await statusText();
  await shot('contact-success-desktop.png', 1280, 1000, false);
  await shot('contact-success-mobile.png', 390, 844, true);

  check('no FormSubmit request was forwarded to the network', continuedFormsubmit === 0);
  const failed = report.filter(function (item) { return !item.pass; });
  fs.writeFileSync(path.join(ARTIFACTS, 'inquiry-browser-results.json'), JSON.stringify({
    passed: report.length - failed.length,
    failed: failed.length,
    report: report,
    blockedHosts: Array.from(new Set(blockedHosts))
  }, null, 2));
  console.log('RESULT', report.length - failed.length, 'passed', failed.length, 'failed');
  launched.chrome.kill('SIGKILL');
  web.server.close();
  browser.close();
  if (failed.length) process.exit(1);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
