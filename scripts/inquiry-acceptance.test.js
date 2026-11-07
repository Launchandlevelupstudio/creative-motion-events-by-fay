const test = require('node:test');
const assert = require('node:assert/strict');
const inquiry = require('./inquiry-form');

function attempt(id, extra) {
  return Object.assign({
    id: id,
    pending: true,
    consumed: false,
    leadRecorded: false,
    created: 1
  }, extra || {});
}

function store(map) {
  return { attempts: map };
}

const tabA = 'aaaaaaaaaaaaaaaaaaaa';
const tabB = 'bbbbbbbbbbbbbbbbbbbb';

test('a return counts only when its token matches a pending attempt', function () {
  var saved = store({
    [tabA]: attempt(tabA, { created: 1 }),
    [tabB]: attempt(tabB, { created: 2 })
  });
  assert.equal(inquiry.inquiryView('?inquiry=' + tabA, saved), 'matched');
  assert.equal(inquiry.inquiryView('?inquiry=' + tabB, saved), 'matched');
  assert.deepEqual(inquiry.pendingAttempts(saved), [tabB, tabA]);
});

test('a static accepted URL does not match a pending attempt', function () {
  var saved = store({ [tabA]: attempt(tabA) });
  assert.equal(inquiry.inquiryView('?inquiry=accepted', saved), 'unmatched');
  assert.equal(inquiry.inquiryView('?inquiry=accepted', null), 'unmatched');
});

test('a direct or unknown return URL is not acceptance', function () {
  assert.equal(inquiry.inquiryView('?inquiry=' + tabB, null), 'unmatched');
  assert.equal(inquiry.inquiryView('?inquiry=' + tabB, store({})), 'unmatched');
  assert.equal(inquiry.inquiryView('?inquiry=' + tabB, store({ [tabA]: attempt(tabA) })), 'unmatched');
});

test('a consumed attempt is a replay, not another success', function () {
  var saved = store({
    [tabA]: attempt(tabA, { pending: false, consumed: true, leadRecorded: true })
  });
  assert.equal(inquiry.inquiryView('?inquiry=' + tabA, saved), 'replayed');
});

test('one tab returning does not consume the other tab', function () {
  var saved = store({
    [tabA]: attempt(tabA, { pending: false, consumed: true, created: 1 }),
    [tabB]: attempt(tabB, { created: 2 })
  });
  assert.equal(inquiry.inquiryView('?inquiry=' + tabA, saved), 'replayed');
  assert.equal(inquiry.inquiryView('?inquiry=' + tabB, saved), 'matched');
  assert.equal(inquiry.inquiryView('', saved), 'uncertain');
});

test('no return token with a pending attempt stays uncertain', function () {
  assert.equal(inquiry.inquiryView('', store({ [tabA]: attempt(tabA) })), 'uncertain');
  assert.equal(inquiry.inquiryView('', store({})), 'ready');
});

test('storage failure is not treated as a confirmed return', function () {
  var saved = store({ [tabA]: attempt(tabA) });
  assert.equal(inquiry.inquiryView('?inquiry=' + tabA, saved, { storageUnavailable: true }), 'storage-unavailable');
  assert.equal(inquiry.inquiryView('', null, { storageUnavailable: true }), 'storage-unavailable');
});

test('the return address carries only the attempt token', function () {
  var url = inquiry.returnUrl('https://creativemotionevents.com', tabA);
  assert.equal(url, 'https://creativemotionevents.com/contact/?inquiry=' + tabA);
  assert.equal(url.indexOf('accepted'), -1);
  assert.equal(url.indexOf('@'), -1);
  assert.equal(inquiry.validAttemptToken(tabA), true);
  assert.equal(inquiry.validAttemptToken('accepted'), false);
  assert.equal(inquiry.ACTION, 'https://formsubmit.co/hello@creativemotionevents.com');
  assert.equal(inquiry.ACTION.indexOf('/ajax/'), -1);
  assert.equal(inquiry.COPY_TO, 'cmeinquiries@mail.grokbot.com');
  assert.equal(/cannot confirm/.test(inquiry.SUCCESS), true);
  assert.equal(/another inquiry/.test(inquiry.UNCERTAIN), true);
  assert.equal(/not sent/.test(inquiry.UNCERTAIN), false);
  assert.equal(/already used/.test(inquiry.REPLAYED), true);
  assert.equal(/couldn't save/.test(inquiry.STORAGE_WRITE), true);
  assert.equal(/Nothing was restored/.test(inquiry.STORAGE_READ), true);
});
