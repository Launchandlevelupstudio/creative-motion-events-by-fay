const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const inquiry = require('./inquiry-form');

const id = 'abcdefghijABCDEFGHIJ12';
const echo = { Attempt: id, Source: 'Contact', 'Full name': 'Amina Cole' };

test('HTTP 200 echoing this attempt and source is provider acceptance', function () {
  assert.equal(inquiry.classifyFormsparkResponse(200, echo, id, 'Contact'), 'accepted');
});

test('HTTP 200 without this attempt echo is not acceptance', function () {
  assert.equal(inquiry.classifyFormsparkResponse(200, { success: true }, id, 'Contact'), 'unreadable');
  assert.equal(inquiry.classifyFormsparkResponse(200, { Attempt: id, Source: 'Annual Design Partnership' }, id, 'Contact'), 'unreadable');
  assert.equal(inquiry.classifyFormsparkResponse(200, [], id, 'Contact'), 'unreadable');
  assert.equal(inquiry.classifyFormsparkResponse(200, null, id, 'Contact'), 'unreadable');
});

test('documented rejection statuses are not acceptance', function () {
  assert.equal(inquiry.classifyFormsparkResponse(403, 'Rejected by spam protection', id, 'Contact'), 'rejected');
  assert.equal(inquiry.classifyFormsparkResponse(402, 'Workspace is out of submissions', id, 'Contact'), 'quota');
  assert.equal(inquiry.classifyFormsparkResponse(404, 'This form does not exist anymore', id, 'Contact'), 'http-error');
  assert.equal(inquiry.classifyFormsparkResponse(415, 'unsupported content type', id, 'Contact'), 'http-error');
});

test('validation keeps the original hint ids and puts them back when the error clears', function () {
  assert.equal(inquiry.mergeDescribedBy('inquiry-name-hint', 'inquiry-name-error', true), 'inquiry-name-hint inquiry-name-error');
  assert.equal(inquiry.mergeDescribedBy('inquiry-name-hint inquiry-name-error', 'inquiry-name-error', true), 'inquiry-name-hint inquiry-name-error');
  assert.equal(inquiry.mergeDescribedBy('inquiry-name-hint inquiry-name-error', 'inquiry-name-error', false), 'inquiry-name-hint');
  assert.equal(inquiry.mergeDescribedBy('', 'inquiry-name-error', false), '');
  assert.equal(inquiry.mergeDescribedBy('hint-a hint-b', 'inquiry-email-error', true), 'hint-a hint-b inquiry-email-error');
});

test('a saved copy counts only when the same entries can be read back', function () {
  var fields = { 'Full name': 'Amina Cole', 'Tell us about your vision': 'Keep this vision' };
  var draft = { source: 'Contact', ambiguous: true, kind: 'pending', fields: fields };
  assert.equal(inquiry.recoveryMatches(draft, 'Contact', 'pending', fields), true);
  assert.equal(inquiry.recoveryMatches({ source: 'Contact', ambiguous: true, kind: 'pending', fields: { 'Full name': 'Amina Cole' } }, 'Contact', 'pending', fields), false);
  assert.equal(inquiry.recoveryMatches({ source: 'Contact', ambiguous: true, kind: 'unreachable', fields: fields }, 'Contact', 'pending', fields), false);
  assert.equal(inquiry.recoveryMatches(null, 'Contact', 'pending', fields), false);
  assert.equal(inquiry.recoveryMatches('{', 'Contact', 'pending', fields), false);
});

test('both forms use the documented Formspark checkbox honeypot', function () {
  ['contact/index.html', 'annual-design-partnership/index.html', 'scripts/site.html'].forEach(function (file) {
    var html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    var fields = html.match(/<input\b[^>]*name="_honeypot"[^>]*>/g) || [];
    assert.ok(fields.length >= 1, file);
    fields.forEach(function (tag) {
      assert.match(tag, /type="checkbox"/);
      assert.match(tag, /style="display:none"/);
      assert.match(tag, /tabindex="-1"/);
      assert.match(tag, /autocomplete="off"/);
      assert.doesNotMatch(tag, /type="text"/);
    });
  });
});

test('only an ambiguous draft for this form can be restored', function () {
  var fields = { 'Full name': 'Amina Cole', 'Tell us about your vision': 'Keep this vision' };
  assert.equal(inquiry.readableDraft({ source: 'Contact', ambiguous: true, kind: 'unreachable', fields: fields }, 'Contact').kind, 'unreachable');
  assert.equal(inquiry.readableDraft({ source: 'Contact', ambiguous: true, kind: 'pending', fields: fields }, 'Contact').kind, 'pending');
  assert.equal(inquiry.readableDraft({ source: 'Contact', ambiguous: false, kind: 'accepted', fields: fields }, 'Contact'), null);
  assert.equal(inquiry.readableDraft({ source: 'Contact', ambiguous: true, kind: 'accepted', fields: fields }, 'Contact'), null);
  assert.equal(inquiry.readableDraft({ source: 'Annual Design Partnership', ambiguous: true, kind: 'unreachable', fields: fields }, 'Contact'), null);
  assert.equal(inquiry.readableDraft(null, 'Contact'), null);
});

test('the endpoint is the created Formspark form and the sender name has no address', function () {
  assert.equal(inquiry.ENDPOINT, 'https://submit-form.com/BhrPePdn2');
  assert.equal(inquiry.ENDPOINT.indexOf('formsubmit.co'), -1);
  assert.equal(inquiry.FROM_NAME.indexOf('@'), -1);
  assert.equal(inquiry.validAttemptToken(id), true);
  assert.equal(inquiry.validAttemptToken('accepted'), false);
});
