/**
 * Mocked Formspark checks. submit-form.com and analytics are never forwarded.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const ENDPOINT = 'https://submit-form.com/BhrPePdn2';

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.ico')) return 'image/x-icon';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
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
    } else if (msg.method) listeners.forEach(function (fn) { fn(msg); });
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
    try { const res = await fetch(url); if (res.ok) return res.json(); } catch (err) {}
    await new Promise(function (r) { setTimeout(r, 100); });
  }
  throw new Error('Chrome debugging port did not open');
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const web = await startServer();
  const profile = fs.mkdtempSync('/tmp/cme-formspark-chrome-');
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--disable-extensions', '--remote-debugging-port=9335',
    '--force-device-scale-factor=1', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  const version = await waitJson('http://127.0.0.1:9335/json/version');
  const browser = await cdpConnect(version.webSocketDebuggerUrl);
  const posts = [];
  let continued = 0;
  let mode = 'echo';
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
    if (hostname === 'submit-form.com' || hostname === 'formsubmit.co') {
      if (paused.request.method === 'OPTIONS') {
        send('Fetch.fulfillRequest', {
          requestId: paused.requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
            { name: 'Access-Control-Allow-Headers', value: 'content-type, accept' }
          ],
          body: ''
        }).catch(function () {});
        return;
      }
      if (paused.request.method === 'POST' && url.indexOf(ENDPOINT) === 0) {
        const body = paused.request.postData || '';
        posts.push({ url: url, body: body });
        if (mode === 'reject') {
          send('Fetch.fulfillRequest', {
            requestId: paused.requestId, responseCode: 403,
            responseHeaders: [
              { name: 'Content-Type', value: 'text/plain; charset=utf-8' },
              { name: 'Access-Control-Allow-Origin', value: '*' }
            ],
            body: Buffer.from('Rejected by spam protection', 'utf8').toString('base64')
          }).catch(function () {});
          return;
        }
        if (mode === 'fail') {
          send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Failed' }).catch(function () {});
          return;
        }
        let echo = {};
        try { echo = JSON.parse(body); } catch (err) { echo = { bad: true }; }
        send('Fetch.fulfillRequest', {
          requestId: paused.requestId, responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' }
          ],
          body: Buffer.from(JSON.stringify(echo), 'utf8').toString('base64')
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
    console.log(condition ? 'PASS' : 'FAIL', name, detail || '');
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result ? result.result.value : undefined;
  }
  async function go(path) {
    await send('Page.navigate', { url: web.origin + path });
    const started = Date.now();
    while (Date.now() - started < 8000) {
      try {
        const ready = await evaluate('document.readyState === "complete" && !!document.body');
        if (ready) return;
      } catch (err) {}
      await sleep(40);
    }
    throw new Error('load failed');
  }
  async function waitText(snippet) {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      try {
        const text = await evaluate('document.body ? document.body.innerText : ""');
        if (text && text.indexOf(snippet) !== -1) return text;
      } catch (err) {}
      await sleep(40);
    }
    throw new Error('missing ' + snippet);
  }
  function overlapExpr(selector) {
    return `(() => {
      function box(el){ const r = el.getBoundingClientRect(); return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,display:getComputedStyle(el).display}; }
      const a = document.querySelector(${JSON.stringify(selector)});
      const b = document.getElementById('fab');
      if (!a || !b) return {overlaps:null};
      const A = box(a), B = box(b);
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      return {overlaps: w > 0 && h > 0, width: Math.max(0, Math.round(w)), height: Math.max(0, Math.round(h)), fabDisplay: B.display};
    })()`;
  }
  function leadsExpr(name) {
    return `(window.dataLayer || []).filter(function(item){
      return item && item[0] === 'event' && item[1] === 'generate_lead' && item[2] && item[2].form_name === ${JSON.stringify(name)};
    }).length`;
  }
  function frameExpr() {
    return `(() => {
      function box(el){ const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}; }
      function shown(el){ return !!(el && !el.hidden && getComputedStyle(el).display !== 'none'); }
      function overlaps(a, b){
        if (!a || !b) return false;
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      }
      const header = document.querySelector('header');
      const fab = document.getElementById('fab');
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
      const fabBox = shown(fab) ? box(fab) : null;
      function place(el){
        if (!shown(el)) return { present: false };
        const r = box(el);
        return {
          present: true,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          belowHeader: r.top >= headerBottom - 1,
          aboveFab: !fabBox || r.bottom <= fabBox.top + 1,
          inViewport: r.top >= -1 && r.bottom <= window.innerHeight + 1,
          overlapsFab: overlaps(r, fabBox),
          overlapsHeader: r.top < headerBottom - 1 && r.bottom > headerBottom + 1
        };
      }
      const form = document.getElementById('inquiryForm');
      const partner = document.getElementById('partnershipInquiry');
      const label = (shown(partner) && partner.querySelector('label')) || (shown(form) && form.querySelector('label')) || null;
      return {
        headerBottom: Math.round(headerBottom),
        status: place(document.querySelector('#inquiryStatus.is-visible, #partnershipStatus.is-visible')),
        another: place(document.getElementById('inquiryAnother')),
        foot: place(document.getElementById('inquiryFoot')),
        back: place(document.querySelector('.partner-return')),
        label: place(label)
      };
    })()`;
  }
  async function shot(name, width, height, mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: width, height: height, deviceScaleFactor: 1, mobile: mobile });
    await sleep(120);
    await evaluate(`(() => {
      function shown(el){ return !!(el && !el.hidden && getComputedStyle(el).display !== 'none'); }
      const header = document.querySelector('header');
      const fab = document.getElementById('fab');
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
      const fabTop = shown(fab) ? fab.getBoundingClientRect().top : window.innerHeight;
      const clearTop = headerBottom + 12;
      const clearBottom = Math.min(window.innerHeight - 8, fabTop - 10);
      const nodes = [];
      function add(el){ if (shown(el)) nodes.push(el); }
      const partner = document.getElementById('partnershipInquiry');
      const form = document.getElementById('inquiryForm');
      if (shown(partner)) add(partner.querySelector('label'));
      add(document.querySelector('#inquiryStatus.is-visible, #partnershipStatus.is-visible'));
      add(document.getElementById('inquiryAnother'));
      add(document.getElementById('inquiryFoot'));
      add(document.querySelector('.partner-return'));
      if (!nodes.length) return;
      let top = Infinity, bottom = -Infinity;
      nodes.forEach(function (el) {
        const r = el.getBoundingClientRect();
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      });
      const minDelta = bottom - clearBottom;
      const maxDelta = top - clearTop;
      const delta = (bottom - top) <= (clearBottom - clearTop)
        ? (minDelta > 0 ? minDelta : (maxDelta < 0 ? maxDelta : 0))
        : maxDelta;
      window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'instant' });
      const blockers = document.querySelectorAll('p, h1, h2, h3, label, .lines, .note');
      for (let pass = 0; pass < 4; pass++) {
        let cut = 0;
        blockers.forEach(function (el) {
          if (!shown(el)) return;
          const r = el.getBoundingClientRect();
          if (r.height < 8 || r.height > 480) return;
          if (r.top < headerBottom - 1 && r.bottom > headerBottom + 1) cut = Math.max(cut, r.bottom);
        });
        if (!cut) break;
        const nudge = cut - headerBottom + 8;
        let frameTop = Infinity, frameBottom = -Infinity;
        nodes.forEach(function (el) {
          const r = el.getBoundingClientRect();
          frameTop = Math.min(frameTop, r.top);
          frameBottom = Math.max(frameBottom, r.bottom);
        });
        const room = frameTop - (headerBottom + 4);
        const applied = Math.min(nudge, room);
        if (applied < 2) break;
        window.scrollTo({ top: window.scrollY + applied, behavior: 'instant' });
      }
      const lines = document.querySelector('.contact .lines');
      if (shown(lines)) {
        const line = lines.getBoundingClientRect();
        if (line.top < headerBottom + 6 && line.bottom > headerBottom) {
          const need = headerBottom + 6 - line.top;
          let frameBottom = -Infinity;
          nodes.forEach(function (el) { frameBottom = Math.max(frameBottom, el.getBoundingClientRect().bottom); });
          if (frameBottom + need <= clearBottom - 4) window.scrollTo({ top: Math.max(0, window.scrollY - need), behavior: 'instant' });
        }
      }
      if (shown(form) && !shown(partner)) {
        const labels = form.querySelectorAll('label');
        for (let i = 0; i < labels.length; i++) {
          const r = labels[i].getBoundingClientRect();
          if (r.top < headerBottom - 1 && r.bottom > headerBottom + 1) {
            window.scrollTo({ top: window.scrollY + r.bottom - headerBottom + 4, behavior: 'instant' });
          }
        }
      }
    })()`);
    await sleep(40);
    const image = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(ARTIFACTS, name);
    fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
    console.log('SHOT', file, fs.readFileSync(file).readUInt32BE(16), fs.readFileSync(file).readUInt32BE(20));
  }
  async function fullShot(name, width, height, mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: width, height: height, deviceScaleFactor: 1, mobile: mobile });
    await sleep(150);
    await evaluate('window.scrollTo(0, 0)');
    const metrics = await send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize || metrics.contentSize;
    const image = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: Math.ceil(content.width), height: Math.ceil(content.height), scale: 1 }
    });
    const file = path.join(ARTIFACTS, name);
    fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
    console.log('FULL', file, fs.readFileSync(file).readUInt32BE(16), fs.readFileSync(file).readUInt32BE(20));
  }
  function clearOfChrome(frame, names) {
    return names.every(function (name) {
      const item = frame[name];
      if (!item || !item.present) return false;
      return item.belowHeader && item.inViewport && !item.overlapsFab && !item.overlapsHeader;
    });
  }

  mode = 'echo';
  await go('/contact/');
  await evaluate(`(() => {
    document.getElementById('inquiry-name').setAttribute('aria-describedby', 'inquiry-name-hint');
    document.getElementById('inquiry-vision').value = 'Keep this vision';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(200);
  const validation = await evaluate(`({
    name: document.getElementById('inquiry-name-error').textContent,
    vision: document.getElementById('inquiry-vision').value,
    described: document.getElementById('inquiry-name').getAttribute('aria-describedby'),
    invalid: document.getElementById('inquiry-name').getAttribute('aria-invalid')
  })`);
  check('contact validation does not post and keeps the vision', posts.length === 0 && validation.name && validation.vision === 'Keep this vision', validation.name);
  check('an invalid field keeps its original hint and adds the error', validation.described === 'inquiry-name-hint inquiry-name-error' && validation.invalid === 'true', validation.described);
  await evaluate(`(() => {
    document.getElementById('inquiry-name').value = 'Amina Cole';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(150);
  const restoredHint = await evaluate(`({
    described: document.getElementById('inquiry-name').getAttribute('aria-describedby'),
    invalid: document.getElementById('inquiry-name').getAttribute('aria-invalid'),
    posts: ${posts.length}
  })`);
  check('clearing the error puts the original hint back', restoredHint.described === 'inquiry-name-hint' && !restoredHint.invalid && posts.length === 0, JSON.stringify(restoredHint));

  await evaluate(`(() => {
    document.getElementById('inquiry-name').value = 'Amina Cole';
    document.getElementById('inquiry-email').value = 'amina@example.com';
    document.getElementById('inquiry-phone').value = '301-555-0100';
    document.getElementById('inquiry-event-type').selectedIndex = 1;
    document.getElementById('inquiry-date').value = 'June';
    document.getElementById('inquiry-guests').selectedIndex = 3;
    document.getElementById('inquiry-investment').selectedIndex = 3;
    document.getElementById('inquiry-honeypot').checked = true;
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(200);
  check('a checked honeypot does not post', posts.length === 0);

  await evaluate(`(() => {
    const store = window.sessionStorage;
    window.__cmeSet = store.setItem.bind(store);
    window.__cmeGet = store.getItem.bind(store);
    store.getItem = function (key) {
      if (String(key).indexOf('cme-inquiry-draft:') === 0) return '{';
      return window.__cmeGet(key);
    };
    document.getElementById('inquiry-honeypot').checked = false;
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(200);
  const malformed = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    button: document.getElementById('inquirySubmit').textContent,
    proceed: document.getElementById('inquirySubmit').getAttribute('data-proceed')
  })`);
  check('a malformed saved copy does not send and asks before posting', posts.length === 0 && malformed.proceed === 'storage' && malformed.button === 'Send anyway' && malformed.text.indexOf('Nothing was sent') !== -1 && malformed.text.indexOf('Formspark accepted') === -1, JSON.stringify(malformed));
  await evaluate(`(() => {
    window.sessionStorage.getItem = window.__cmeGet;
    window.sessionStorage.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
    document.getElementById('inquirySubmit').removeAttribute('data-proceed');
    document.getElementById('inquirySubmit').textContent = 'Send inquiry';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(250);
  const blocked = await evaluate(`({
    text: document.getElementById('inquiryStatus').textContent,
    button: document.getElementById('inquirySubmit').textContent,
    hidden: document.getElementById('inquiryForm').hidden,
    leads: ${leadsExpr('contact_inquiry')}
  })`);
  check('blocked storage warns before sending and does not claim acceptance', posts.length === 0 && blocked.button === 'Send anyway' && blocked.hidden === false && blocked.leads === 0 && blocked.text.indexOf('Nothing was sent') !== -1 && blocked.text.indexOf('Send anyway') !== -1 && blocked.text.indexOf('Formspark accepted') === -1, JSON.stringify(blocked));
  await sleep(400);
  check('a storage warning does not retry the send', posts.length === 0);
  await evaluate(`window.sessionStorage.setItem = window.__cmeSet;`);

  await evaluate(`(() => {
    document.getElementById('inquiry-honeypot').checked = false;
    const form = document.getElementById('inquiryForm');
    form.requestSubmit();
    try { form.requestSubmit(); } catch (err) {}
  })()`);
  await waitText('Formspark accepted this submission');
  check('one accepted contact post', posts.length === 1 && posts[0].url === ENDPOINT);
  const sent = JSON.parse(posts[0].body);
  check('contact payload keeps labels, source, honeypot, and subject', sent.Source === 'Contact' && sent['Full name'] === 'Amina Cole' && sent.Email === 'amina@example.com' && sent['Tell us about your vision'] === 'Keep this vision' && sent._honeypot === '' && sent._email.subject === 'Contact inquiry' && sent._email.from === 'Creative Motion Events' && sent._replyto === 'amina@example.com' && !sent._cc && !sent._captcha && !sent._next);
  check('the echo matched this attempt and counted one lead', (await evaluate(leadsExpr('contact_inquiry'))) === 1 && sent.Attempt === JSON.parse(posts[0].body).Attempt);
  const hidden = await evaluate(`getComputedStyle(document.getElementById('inquiryForm')).display`);
  check('accepted contact form is hidden', hidden === 'none');
  const afterAccept = posts.length;
  await evaluate(`(() => { try { document.getElementById('inquiryForm').requestSubmit(); } catch (err) {} })()`);
  await sleep(200);
  check('a hidden accepted form does not post again', posts.length === afterAccept, 'posts ' + posts.length);
  await shot('viewport-formspark-contact-success-desktop.png', 1280, 900, false);
  await shot('viewport-formspark-contact-success-mobile.png', 390, 844, true);
  const contactFrame390 = await evaluate(frameExpr());
  check('contact confirmation, action, and footnote are clear of the header and chat at 390', clearOfChrome(contactFrame390, ['status', 'another', 'foot']), JSON.stringify(contactFrame390));
  await shot('viewport-formspark-contact-success-320.png', 320, 844, true);
  const contactFrame320 = await evaluate(frameExpr());
  check('contact confirmation, action, and footnote are clear of the header and chat at 320', clearOfChrome(contactFrame320, ['status', 'another', 'foot']), JSON.stringify(contactFrame320));

  mode = 'reject';
  const beforeReject = posts.length;
  await go('/contact/');
  await evaluate(`(() => {
    document.getElementById('inquiry-name').value = 'Amina Cole';
    document.getElementById('inquiry-email').value = 'amina@example.com';
    document.getElementById('inquiry-event-type').selectedIndex = 1;
    document.getElementById('inquiry-date').value = 'June';
    document.getElementById('inquiry-guests').selectedIndex = 3;
    document.getElementById('inquiry-investment').selectedIndex = 3;
    document.getElementById('inquiry-vision').value = 'Keep this vision';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await waitText('Formspark rejected this submission');
  const rejected = await evaluate(`({
    name: document.getElementById('inquiry-name').value,
    vision: document.getElementById('inquiry-vision').value,
    leads: ${leadsExpr('contact_inquiry')}
  })`);
  check('rejection keeps the contact entries and does not count a lead', posts.length === beforeReject + 1 && rejected.name === 'Amina Cole' && rejected.vision === 'Keep this vision' && rejected.leads === 0, JSON.stringify(rejected) + ' posts ' + posts.length);
  await shot('viewport-formspark-contact-rejected-desktop.png', 1280, 900, false);
  await shot('viewport-formspark-contact-rejected-mobile.png', 390, 844, true);
  const contactReject390 = await evaluate(frameExpr());
  check('contact rejection status and footnote are clear of the header and chat at 390', clearOfChrome(contactReject390, ['status', 'foot']), JSON.stringify(contactReject390));
  await shot('viewport-formspark-contact-rejected-320.png', 320, 844, true);
  const contactRejectFrame = await evaluate(frameExpr());
  check('contact rejection status and footnote are clear of the header and chat at 320', clearOfChrome(contactRejectFrame, ['status', 'foot']), JSON.stringify(contactRejectFrame));

  mode = 'fail';
  const beforeFail = posts.length;
  await evaluate(`document.getElementById('inquiryForm').requestSubmit();`);
  await waitText('did not get a reply from Formspark');
  check('a network failure does not post again by itself and keeps the vision', posts.length === beforeFail + 1 && (await evaluate(`document.getElementById('inquiry-vision').value`)) === 'Keep this vision');
  await sleep(400);
  check('the network failure is not retried automatically', posts.length === beforeFail + 1);
  const beforeReload = posts.length;
  await go('/contact/');
  await waitText('did not get a reply from Formspark');
  await sleep(300);
  const reloaded = await evaluate(`({
    name: document.getElementById('inquiry-name').value,
    vision: document.getElementById('inquiry-vision').value,
    hidden: document.getElementById('inquiryForm').hidden,
    text: document.getElementById('inquiryStatus').textContent,
    leads: ${leadsExpr('contact_inquiry')}
  })`);
  check('reload after an unanswered send restores the entries without sending or claiming acceptance', posts.length === beforeReload && reloaded.name === 'Amina Cole' && reloaded.vision === 'Keep this vision' && reloaded.hidden === false && reloaded.text.indexOf('Formspark accepted') === -1 && reloaded.text.indexOf('did not get a reply') !== -1 && reloaded.leads === 0, JSON.stringify(reloaded) + ' posts ' + posts.length);
  await evaluate(`sessionStorage.setItem('cme-inquiry-draft:Contact', JSON.stringify({ source: 'Contact', ambiguous: false, kind: 'accepted', fields: { 'Full name': 'Planted Success', 'Tell us about your vision': 'nope' } }))`);
  await go('/contact/');
  await sleep(250);
  const ignored = await evaluate(`({
    name: document.getElementById('inquiry-name').value,
    text: document.body.innerText,
    leads: ${leadsExpr('contact_inquiry')}
  })`);
  check('a stored acceptance record does not restore entries or show success', posts.length === beforeReload && ignored.name === '' && ignored.text.indexOf('Formspark accepted') === -1 && ignored.text.indexOf('Planted Success') === -1 && ignored.leads === 0, ignored.name);

  mode = 'echo';
  await go('/annual-design-partnership/');
  await evaluate(`(() => {
    document.querySelector('#partnershipInquiry [name="Contact Name"]').value = 'Amina Cole';
    document.querySelector('#partnershipInquiry [name="Organization"]').value = 'North Hall';
    document.getElementById('partnership-email').value = 'amina@example.com';
    document.querySelector('#partnershipInquiry [name="Events Per Year"]').selectedIndex = 2;
    document.querySelector('#partnershipInquiry [name="Upcoming Event Types / Details"]').value = 'Three fall galas';
    document.getElementById('partnership-honeypot').checked = true;
    document.getElementById('partnershipInquiry').requestSubmit();
  })()`);
  await sleep(200);
  check('a checked partnership honeypot does not post', posts.length === beforeFail + 1);
  await evaluate(`(() => {
    document.getElementById('partnership-honeypot').checked = false;
    const form = document.getElementById('partnershipInquiry');
    form.requestSubmit();
    try { form.requestSubmit(); } catch (err) {}
  })()`);
  await waitText('Formspark accepted this submission');
  const partner = JSON.parse(posts[posts.length - 1].body);
  check('partnership posts once to the same endpoint with its source', posts.length === beforeFail + 2 && partner.Source === 'Annual Design Partnership' && partner['Work Email'] === 'amina@example.com' && partner['Contact Name'] === 'Amina Cole' && partner._honeypot === '' && partner._email.subject === 'Annual Design Partnership inquiry' && !partner._cc && !partner._captcha);
  check('partnership lead is counted once', (await evaluate(leadsExpr('annual-design-partnership'))) === 1);
  check('partnership form is hidden after acceptance', (await evaluate(`getComputedStyle(document.getElementById('partnershipInquiry')).display`)) === 'none');
  await shot('viewport-formspark-partnership-success-desktop.png', 1280, 900, false);
  await shot('viewport-formspark-partnership-success-mobile.png', 390, 844, true);
  await shot('viewport-formspark-partnership-success-320.png', 320, 844, true);
  const partnerOkFrame = await evaluate(frameExpr());
  check('partnership confirmation is clear of the header and chat at 320', clearOfChrome(partnerOkFrame, ['status', 'back']), JSON.stringify(partnerOkFrame));

  mode = 'reject';
  await go('/annual-design-partnership/');
  await evaluate(`(() => {
    document.querySelector('#partnershipInquiry [name="Contact Name"]').value = 'Amina Cole';
    document.querySelector('#partnershipInquiry [name="Organization"]').value = 'North Hall';
    document.getElementById('partnership-email').value = 'amina@example.com';
    document.querySelector('#partnershipInquiry [name="Events Per Year"]').selectedIndex = 2;
    document.getElementById('partnershipInquiry').requestSubmit();
  })()`);
  await waitText('Formspark rejected this submission');
  const partnerKept = await evaluate(`document.querySelector('#partnershipInquiry [name="Contact Name"]').value`);
  check('partnership rejection keeps the name and does not count a lead', partnerKept === 'Amina Cole' && (await evaluate(leadsExpr('annual-design-partnership'))) === 0);
  await shot('viewport-formspark-partnership-rejected-desktop.png', 1280, 900, false);
  await shot('viewport-formspark-partnership-rejected-mobile.png', 390, 844, true);
  const photo = await evaluate(`(() => {
    const img = document.querySelector('.partner-inquiry-photo');
    if (!img) return null;
    const style = getComputedStyle(img);
    return { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: img.clientWidth, height: img.clientHeight, fit: style.objectFit, position: style.objectPosition };
  })()`);
  check('partnership photo rule is recorded for the full-page capture', !!photo && photo.naturalWidth > 0, JSON.stringify(photo));
  fs.writeFileSync(path.join(ARTIFACTS, 'partnership-photo-metrics.json'), JSON.stringify(photo, null, 2));
  const partnerFrame390 = await evaluate(frameExpr());
  check('partnership label, error, and return link are clear of the header and chat at 390', clearOfChrome(partnerFrame390, ['label', 'status', 'back']), JSON.stringify(partnerFrame390));
  await shot('viewport-formspark-partnership-rejected-320.png', 320, 844, true);
  const partnerFrame320 = await evaluate(frameExpr());
  check('partnership label, error, and return link are clear of the header and chat at 320', clearOfChrome(partnerFrame320, ['label', 'status', 'back']), JSON.stringify(partnerFrame320));
  await fullShot('fullpage-formspark-partnership-rejected-desktop.png', 1280, 900, false);
  await fullShot('fullpage-formspark-partnership-rejected-mobile.png', 390, 844, true);

  check('no provider request was forwarded', continued === 0);
  const failed = report.filter(function (item) { return !item.pass; });
  fs.writeFileSync(path.join(ARTIFACTS, 'formspark-browser-results.json'), JSON.stringify({ passed: report.length - failed.length, failed: failed.length, report: report }, null, 2));
  console.log('RESULT', report.length - failed.length, 'passed', failed.length, 'failed');
  chrome.kill('SIGKILL');
  web.server.close();
  browser.close();
  if (failed.length) process.exit(1);
}

main().catch(function (err) { console.error(err); process.exit(1); });
