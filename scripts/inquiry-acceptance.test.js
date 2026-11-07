const test = require('node:test');
const assert = require('node:assert/strict');
const inquiry = require('./inquiry-form');

const pending = { id: 'attempt-1', pending: true, done: false, leadRecorded: false };
const done = { id: 'attempt-1', pending: false, done: true, leadRecorded: true };

test('a redirect counts only together with this browser pending attempt', function () {
  assert.equal(inquiry.inquiryView('?inquiry=accepted', pending), 'redirected');
  assert.equal(inquiry.inquiryView('inquiry=accepted', pending), 'redirected');
});

test('the redirect URL alone is not acceptance', function () {
  assert.equal(inquiry.inquiryView('?inquiry=accepted', null), 'ready');
  assert.equal(inquiry.inquiryView('?inquiry=accepted', {}), 'ready');
  assert.equal(inquiry.inquiryView('?inquiry=accepted', { pending: true }), 'ready');
});

test('a pending attempt without the redirect is uncertain, not a new send', function () {
  assert.equal(inquiry.inquiryView('', pending), 'uncertain');
  assert.equal(inquiry.inquiryView('?inquiry=other', pending), 'uncertain');
});

test('a finished attempt stays on the redirect result', function () {
  assert.equal(inquiry.inquiryView('', done), 'redirected');
  assert.equal(inquiry.inquiryView('?inquiry=accepted', done), 'redirected');
});

test('the contact form posts to the documented FormSubmit address, not the ajax endpoint', function () {
  assert.equal(inquiry.ACTION, 'https://formsubmit.co/hello@creativemotionevents.com');
  assert.equal(inquiry.ACTION.indexOf('/ajax/'), -1);
  assert.equal(inquiry.COPY_TO, 'cmeinquiries@mail.grokbot.com');
  assert.equal(inquiry.CANONICAL_NEXT, 'https://creativemotionevents.com/contact/?inquiry=accepted');
  assert.equal(/inbox/.test(inquiry.SUCCESS), true);
  assert.equal(/cannot confirm/.test(inquiry.SUCCESS), true);
  assert.equal(/another inquiry/.test(inquiry.UNCERTAIN), true);
  assert.equal(/not sent/.test(inquiry.UNCERTAIN), false);
});
