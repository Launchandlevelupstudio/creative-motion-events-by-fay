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
  async function shot(name, width, height, mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: width, height: height, deviceScaleFactor: 1, mobile: mobile });
    await sleep(100);
    await evaluate(`(() => {
      const status = document.querySelector('#inquiryStatus.is-visible, #partnershipStatus.is-visible, #inquiryStatus:not([hidden]), #partnershipStatus:not([hidden])');
      const el = document.getElementById('inquiryStatus') && !document.getElementById('inquiryStatus').hidden
        ? document.getElementById('inquiryStatus')
        : document.getElementById('partnershipStatus');
      if (!el) return;
      const header = document.querySelector('header');
      const fab = document.getElementById('fab');
      const headerH = header ? header.getBoundingClientRect().height : 0;
      const fabTop = fab ? fab.getBoundingClientRect().top : window.innerHeight;
      const topLimit = headerH + 12;
      const bottomLimit = Math.min(window.innerHeight - 12, fabTop - 8);
      const rect = el.getBoundingClientRect();
      const another = document.getElementById('inquiryAnother');
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
    console.log('SHOT', file, fs.readFileSync(file).readUInt32BE(16), fs.readFileSync(file).readUInt32BE(20));
  }

  mode = 'echo';
  await go('/contact/');
  await evaluate(`(() => {
    document.getElementById('inquiry-vision').value = 'Keep this vision';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(200);
  const validation = await evaluate(`({
    name: document.getElementById('inquiry-name-error').textContent,
    vision: document.getElementById('inquiry-vision').value
  })`);
  check('contact validation does not post and keeps the vision', posts.length === 0 && validation.name && validation.vision === 'Keep this vision', validation.name);

  await evaluate(`(() => {
    document.getElementById('inquiry-name').value = 'Amina Cole';
    document.getElementById('inquiry-email').value = 'amina@example.com';
    document.getElementById('inquiry-phone').value = '301-555-0100';
    document.getElementById('inquiry-event-type').selectedIndex = 1;
    document.getElementById('inquiry-date').value = 'June';
    document.getElementById('inquiry-guests').selectedIndex = 3;
    document.getElementById('inquiry-investment').selectedIndex = 3;
    document.getElementById('inquiry-honeypot').value = 'bot';
    document.getElementById('inquiryForm').requestSubmit();
  })()`);
  await sleep(200);
  check('a filled honeypot does not post', posts.length === 0);

  await evaluate(`(() => {
    document.getElementById('inquiry-honeypot').value = '';
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
  const contactChat390 = await evaluate(overlapExpr('#inquiryAnother'));
  check('chat does not cover Send another inquiry at 390', contactChat390.overlaps === false, JSON.stringify(contactChat390));
  await shot('viewport-formspark-contact-success-320.png', 320, 844, true);
  const contactChat320 = await evaluate(overlapExpr('#inquiryAnother'));
  check('chat does not cover Send another inquiry at 320', contactChat320.overlaps === false, JSON.stringify(contactChat320));

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

  mode = 'fail';
  const beforeFail = posts.length;
  await evaluate(`document.getElementById('inquiryForm').requestSubmit();`);
  await waitText('did not get a reply from Formspark');
  check('a network failure does not post again by itself and keeps the vision', posts.length === beforeFail + 1 && (await evaluate(`document.getElementById('inquiry-vision').value`)) === 'Keep this vision');
  await sleep(400);
  check('the network failure is not retried automatically', posts.length === beforeFail + 1);

  mode = 'echo';
  await go('/annual-design-partnership/');
  await evaluate(`(() => {
    document.querySelector('#partnershipInquiry [name="Contact Name"]').value = 'Amina Cole';
    document.querySelector('#partnershipInquiry [name="Organization"]').value = 'North Hall';
    document.getElementById('partnership-email').value = 'amina@example.com';
    document.querySelector('#partnershipInquiry [name="Events Per Year"]').selectedIndex = 2;
    document.querySelector('#partnershipInquiry [name="Upcoming Event Types / Details"]').value = 'Three fall galas';
    const form = document.getElementById('partnershipInquiry');
    form.requestSubmit(); form.requestSubmit();
  })()`);
  await waitText('Formspark accepted this submission');
  const partner = JSON.parse(posts[posts.length - 1].body);
  check('partnership posts once to the same endpoint with its source', posts.length === beforeFail + 2 && partner.Source === 'Annual Design Partnership' && partner['Work Email'] === 'amina@example.com' && partner['Contact Name'] === 'Amina Cole' && partner._email.subject === 'Annual Design Partnership inquiry' && !partner._cc && !partner._captcha);
  check('partnership lead is counted once', (await evaluate(leadsExpr('annual-design-partnership'))) === 1);
  check('partnership form is hidden after acceptance', (await evaluate(`getComputedStyle(document.getElementById('partnershipInquiry')).display`)) === 'none');
  await shot('viewport-formspark-partnership-success-desktop.png', 1280, 900, false);
  await shot('viewport-formspark-partnership-success-mobile.png', 390, 844, true);

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
  const partnerChat390 = await evaluate(overlapExpr('#partnershipStatus'));
  check('chat does not cover the partnership error at 390', partnerChat390.overlaps === false, JSON.stringify(partnerChat390));
  await shot('viewport-formspark-partnership-rejected-320.png', 320, 844, true);
  const partnerChat320 = await evaluate(overlapExpr('#partnershipStatus'));
  check('chat does not cover the partnership error at 320', partnerChat320.overlaps === false, JSON.stringify(partnerChat320));

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
