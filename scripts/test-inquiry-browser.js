/**
 * Contact form checks against a local mock of FormSubmit.
 * Requests to formsubmit.co are answered here and never forwarded.
 * Analytics hosts are blocked. No live submission is made.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const NATIVE = 'https://formsubmit.co/hello@creativemotionevents.com';

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
  return { chrome: chrome, browser: browser };
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const web = await startServer();
  const launched = await launchChrome();
  const browser = launched.browser;
  const posts = [];
  let options = 0;
  let continued = 0;
  let mode = 'redirect';
  const blocked = [];

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
      if (paused.request.method === 'OPTIONS') {
        options += 1;
        send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Failed' }).catch(function () {});
        return;
      }
      if (paused.request.method === 'POST') {
        posts.push({ url: url, body: paused.request.postData || '', headers: paused.request.headers || {} });
        if (mode === 'hold') {
          send('Fetch.fulfillRequest', {
            requestId: paused.requestId,
            responseCode: 522,
            responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
            body: Buffer.from('<!doctype html><title>522</title><p>Connection timed out</p>', 'utf8').toString('base64')
          }).catch(function () {});
          return;
        }
        const params = new URLSearchParams(paused.request.postData || '');
        const next = params.get('_next') || (web.origin + '/contact/');
        send('Fetch.fulfillRequest', {
          requestId: paused.requestId,
          responseCode: 303,
          responseHeaders: [{ name: 'Location', value: next }],
          body: ''
        }).catch(function () {});
        return;
      }
      send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Failed' }).catch(function () {});
      return;
    }
    if (local || fonts) {
      send('Fetch.continueRequest', { requestId: paused.requestId }).catch(function () {});
      return;
    }
    blocked.push(hostname);
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
      throw new Error((result.exceptionDetails.text || 'eval error') + ' ' + JSON.stringify(result.exceptionDetails.exception || ''));
    }
    return result.result ? result.result.value : undefined;
  }

  async function go(path) {
    await send('Page.navigate', { url: web.origin + path });
    const started = Date.now();
    while (Date.now() - started < 8000) {
      try {
        const ready = await evaluate(`document.readyState === 'complete' && !!document.getElementById('inquiryForm')`);
        if (ready) return;
      } catch (err) {}
      await sleep(40);
    }
    throw new Error('page did not load ' + path);
  }

  async function fill() {
    await evaluate(`(() => {
      document.getElementById('inquiry-name').value = 'Amina Cole';
      document.getElementById('inquiry-email').value = 'amina@example.com';
      document.getElementById('inquiry-organization').value = 'North Hall';
      document.getElementById('inquiry-phone').value = '301-555-0100';
      document.getElementById('inquiry-event-type').selectedIndex = 1;
      document.getElementById('inquiry-date').value = 'June';
      document.getElementById('inquiry-guests').selectedIndex = 3;
      document.getElementById('inquiry-investment').selectedIndex = 3;
      document.getElementById('inquiry-vision').value = 'Gold tables under one long runner';
      document.getElementById('inquiry-honey').value = '';
    })()`);
  }

  async function leads() {
    return evaluate(`(window.dataLayer || []).filter(function(item){
      return item && item[0] === 'event' && item[1] === 'generate_lead' && item[2] && item[2].form_name === 'contact_inquiry';
    }).length`);
  }

  async function waitText(snippet) {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      try {
        const text = await evaluate(`document.body ? document.body.innerText : ''`);
        if (text && text.indexOf(snippet) !== -1) return text;
      } catch (err) {}
      await sleep(40);
    }
    throw new Error('missing text ' + snippet);
  }

  async function shot(name, width, height, mobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: width, height: height, deviceScaleFactor: 1, mobile: mobile
    });
    await sleep(80);
    await evaluate(`(() => {
      const status = document.getElementById('inquiryStatus');
      const header = document.querySelector('header');
      const fab = document.getElementById('fab');
      const another = document.getElementById('inquiryAnother');
      const headerH = header ? header.getBoundingClientRect().height : 0;
      const fabTop = fab ? fab.getBoundingClientRect().top : window.innerHeight;
      const topLimit = headerH + 12;
      const bottomLimit = Math.min(window.innerHeight - 12, fabTop - 8);
      const rect = status.getBoundingClientRect();
      let bottom = rect.bottom;
      if (another && !another.hidden) bottom = Math.max(bottom, another.getBoundingClientRect().bottom);
      const minDelta = bottom - bottomLimit;
      const maxDelta = rect.top - topLimit;
      const delta = minDelta > maxDelta ? maxDelta : minDelta;
      window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'instant' });
    })()`);
    await sleep(40);
    const image = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(ARTIFACTS, name);
    fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
    console.log('SHOT', file, width, height, 'png', fs.readFileSync(file).readUInt32BE(16), fs.readFileSync(file).readUInt32BE(20));
  }

  mode = 'redirect';
  await go('/contact/');
  await evaluate(`(() => {
    document.getElementById('inquiry-email').value = 'not-an-email';
    document.getElementById('inquiry-phone').value = '123';
    document.getElementById('inquiry-vision').value = 'Keep this vision';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(250);
  const validation = await evaluate(`({
    name: document.getElementById('inquiry-name-error').textContent,
    email: document.getElementById('inquiry-email-error').textContent,
    phone: document.getElementById('inquiry-phone-error').textContent,
    event: document.getElementById('inquiry-event-type-error').textContent,
    guests: document.getElementById('inquiry-guests-error').textContent,
    investment: document.getElementById('inquiry-investment-error').textContent,
    vision: document.getElementById('inquiry-vision').value,
    focus: document.activeElement && document.activeElement.id
  })`);
  check('validation does not post', posts.length === 0, 'posts ' + posts.length);
  check('validation explains the problems and keeps the vision', validation.name && validation.email && validation.phone && validation.event && validation.guests && validation.investment && validation.vision === 'Keep this vision' && validation.focus === 'inquiry-name', JSON.stringify(validation));

  await go('/contact/?inquiry=accepted');
  const bare = await evaluate(`({
    hidden: document.getElementById('inquiryForm').hidden,
    text: document.getElementById('inquiryStatus').textContent,
    leads: (window.dataLayer || []).filter(function(item){ return item && item[1] === 'generate_lead'; }).length
  })`);
  check('a direct accepted URL does not count a lead', bare.hidden === false && bare.text.indexOf('does not match') !== -1 && bare.leads === 0, JSON.stringify(bare));
  await go('/contact/?inquiry=zzzzzzzzzzzzzzzzzzzz');
  const direct = await evaluate(`document.getElementById('inquiryStatus').textContent`);
  check('an unknown return token does not confirm a submission', direct.indexOf('does not confirm a submission') !== -1, direct);

  await fill();
  await evaluate(`document.getElementById('inquiry-honey').value = 'bot'; document.getElementById('inquiryForm').requestSubmit();`);
  await sleep(250);
  check('honeypot does not post', posts.length === 0, 'posts ' + posts.length);

  await go('/contact/');
  await fill();
  const before = posts.length;
  await evaluate(`(() => {
    const form = document.getElementById('inquiryForm');
    form.requestSubmit();
    form.requestSubmit();
  })()`);
  await waitText('cannot confirm that the message has arrived');
  check('a double submit sends one native post', posts.length === before + 1, 'posts ' + posts.length);
  check('the post is not the ajax endpoint and has no preflight', posts[0].url === NATIVE && posts[0].url.indexOf('/ajax/') === -1 && options === 0, posts[0].url + ' options ' + options);
  const body = new URLSearchParams(posts[0].body);
  const contentType = JSON.stringify(posts[0].headers);
  check('the body keeps the copy inbox and captcha false', body.get('_cc') === 'cmeinquiries@mail.grokbot.com' && body.get('_captcha') === 'false' && body.get('_template') === 'table', posts[0].body);
  check('the body is form fields, not a JSON fetch', contentType.toLowerCase().indexOf('application/json') === -1 && body.get('_replyto') === 'amina@example.com', contentType + ' ' + posts[0].body.slice(0, 180));
  check('the subject and renamed fields are in the form body', body.get('_subject') === 'New Inquiry - Amina Cole - Corporate gala or awards night' && body.get('Full name') === 'Amina Cole' && body.get('Email') === 'amina@example.com' && body.get('Tell us about your vision') === 'Gold tables under one long runner');
  const nextUrl = body.get('_next') || '';
  const returnToken = (nextUrl.split('inquiry=')[1] || '').split('&')[0];
  check('the return URL is this attempt token and not the visitor details', /^[A-Za-z0-9]{20,32}$/.test(returnToken) && nextUrl.indexOf('accepted') === -1 && nextUrl.indexOf('amina') === -1 && nextUrl.indexOf('Cole') === -1, nextUrl);
  const success = await evaluate(`({
    display: getComputedStyle(document.getElementById('inquiryForm')).display,
    text: document.getElementById('inquiryStatus').textContent,
    role: document.getElementById('inquiryStatus').getAttribute('role'),
    another: document.getElementById('inquiryAnother').hidden
  })`);
  check('the redirect hides the form and does not claim inbox delivery', success.display === 'none' && success.text.indexOf('cannot confirm') !== -1 && success.text.indexOf('within 24 hours if it was delivered') !== -1, success.text);
  check('one lead is recorded for that redirect', (await leads()) === 1);
  await shot('viewport-success-desktop.png', 1280, 900, false);
  await shot('viewport-success-mobile.png', 390, 844, true);
  await go('/contact/?inquiry=' + returnToken);
  const replayed = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    display: getComputedStyle(document.getElementById('inquiryForm')).display,
    leads: (window.dataLayer || []).filter(function(item){ return item && item[1] === 'generate_lead' && item[2] && item[2].form_name === 'contact_inquiry'; }).length
  })`);
  check('replaying the return URL does not count another lead or show a new success', replayed.leads === 0 && replayed.display !== 'none' && replayed.text.indexOf('already used') !== -1 && posts.length === before + 1, replayed.text);

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const held = posts.length;
  await evaluate(`sessionStorage.setItem('cme-contact-inquiry', JSON.stringify({ attempts: {
    aaaaaaaaaaaaaaaaaaaa: {
      id: 'aaaaaaaaaaaaaaaaaaaa', pending: true, consumed: false, leadRecorded: false, created: 1,
      fields: { name: 'Amina Cole', email: 'amina@example.com', organization: 'North Hall', phone: '301-555-0100', eventType: 'Corporate gala or awards night', eventDate: 'June', guests: '50–100', investment: '$12,000–$20,000', vision: 'Gold tables under one long runner' }
    },
    bbbbbbbbbbbbbbbbbbbb: {
      id: 'bbbbbbbbbbbbbbbbbbbb', pending: true, consumed: false, leadRecorded: false, created: 2,
      fields: { name: 'Other Tab', email: 'other@example.com', organization: '', phone: '', eventType: 'Conference or meeting', eventDate: '', guests: 'Under 25', investment: 'Not sure yet', vision: 'Second tab' }
    }
  }}));`);
  await go('/contact/?inquiry=accepted');
  const stale = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    display: getComputedStyle(document.getElementById('inquiryForm')).display,
    name: document.getElementById('inquiry-name').value,
    leads: (window.dataLayer || []).filter(function(item){ return item && item[1] === 'generate_lead' && item[2] && item[2].form_name === 'contact_inquiry'; }).length
  })`);
  check('a static accepted URL with a pending attempt does not count a lead', stale.display !== 'none' && stale.leads === 0 && stale.text.indexOf('does not match') !== -1 && stale.name === 'Other Tab', stale.text);
  await go('/contact/?inquiry=aaaaaaaaaaaaaaaaaaaa');
  const firstTab = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    display: getComputedStyle(document.getElementById('inquiryForm')).display,
    leads: (window.dataLayer || []).filter(function(item){ return item && item[1] === 'generate_lead' && item[2] && item[2].form_name === 'contact_inquiry'; }).length,
    otherPending: JSON.parse(sessionStorage.getItem('cme-contact-inquiry')).attempts.bbbbbbbbbbbbbbbbbbbb.pending
  })`);
  check('one tab return consumes only that attempt', firstTab.display === 'none' && firstTab.leads === 1 && firstTab.text.indexOf('this attempt') !== -1 && firstTab.otherPending === true, JSON.stringify(firstTab));
  await go('/contact/');
  const uncertain = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    role: document.getElementById('inquiryStatus').getAttribute('role'),
    name: document.getElementById('inquiry-name').value,
    email: document.getElementById('inquiry-email').value,
    vision: document.getElementById('inquiry-vision').value,
    date: document.getElementById('inquiry-date').value,
    display: getComputedStyle(document.getElementById('inquiryForm')).display,
    leads: (window.dataLayer || []).filter(function(item){ return item && item[1] === 'generate_lead' && item[2] && item[2].form_name === 'contact_inquiry'; }).length
  })`);
  check('coming back without the redirect keeps the remaining attempt and does not claim it failed or succeeded', uncertain.display !== 'none' && uncertain.name === 'Other Tab' && uncertain.email === 'other@example.com' && uncertain.vision === 'Second tab' && uncertain.text.indexOf('did not get confirmation') !== -1 && uncertain.text.indexOf('another inquiry') !== -1 && uncertain.text.indexOf('not sent') === -1 && uncertain.role === 'alert', uncertain.text);
  check('showing that uncertainty does not post or record a lead', posts.length === held && uncertain.leads === 0, 'posts ' + posts.length);
  await shot('viewport-uncertain-desktop.png', 1280, 900, false);
  await shot('viewport-uncertain-mobile.png', 390, 844, true);

  mode = 'redirect';
  const again = posts.length;
  await evaluate(`document.getElementById('inquiryForm').requestSubmit();`);
  await waitText('cannot confirm that the message has arrived');
  check('a later explicit send is one more post, not an automatic retry', posts.length === again + 1, 'posts ' + posts.length);
  await go('/contact/');
  await fill();
  await evaluate(`(() => {
    const store = window.sessionStorage;
    store.setItem = function () { throw new Error('storage blocked'); };
  })()`);
  const blockedPosts = posts.length;
  await evaluate(`document.getElementById('inquiryForm').requestSubmit();`);
  await sleep(300);
  const storageWarn = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    button: document.getElementById('inquirySubmit').textContent,
    name: document.getElementById('inquiry-name').value
  })`);
  check('a storage failure stays on the page and does not pretend the fields were saved', posts.length === blockedPosts && storageWarn.button === 'Send anyway' && storageWarn.text.indexOf("couldn't save") !== -1 && storageWarn.text.indexOf('may not restore') !== -1 && storageWarn.name === 'Amina Cole', JSON.stringify(storageWarn));
  await evaluate(`document.getElementById('inquiryForm').requestSubmit();`);
  await waitText('does not match');
  check('Send anyway posts once and that unrecognized return does not count a lead', posts.length === blockedPosts + 1 && (await leads()) === 0, 'posts ' + posts.length + ' leads ' + (await leads()));
  check('no FormSubmit request was forwarded', continued === 0 && options === 0, 'options ' + options);

  fs.writeFileSync(path.join(ARTIFACTS, 'inquiry-browser-results.json'), JSON.stringify({
    passed: report.filter(function (item) { return item.pass; }).length,
    failed: report.filter(function (item) { return !item.pass; }).length,
    report: report,
    blockedHosts: Array.from(new Set(blocked)),
    posts: posts.length,
    options: options
  }, null, 2));
  console.log('RESULT', report.filter(function (item) { return item.pass; }).length, 'passed', report.filter(function (item) { return !item.pass; }).length, 'failed');
  launched.chrome.kill('SIGKILL');
  web.server.close();
  browser.close();
  if (report.some(function (item) { return !item.pass; })) process.exit(1);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
