const test = require('node:test');
const assert = require('node:assert/strict');
const inquiry = require('./inquiry-form');

const ACCEPTED_MESSAGE = 'The form was submitted successfully.';
const ACTIVATION = "This form needs Activation. We've sent you an email containing an 'Activate Form' link. Just click it and your form will be actived!";

test('string and boolean true with an acceptance message are accepted', function () {
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'true', message: ACCEPTED_MESSAGE }), 'accepted');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: true, message: ACCEPTED_MESSAGE }), 'accepted');
});

test('the string false is not accepted, even though it is truthy', function () {
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'false', message: 'Unable to submit form.' }), 'rejected');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'false', message: ACTIVATION }), 'rejected');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: false, message: ACTIVATION }), 'rejected');
});

test('an activation notice is not accepted even when the flag says true', function () {
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'true', message: ACTIVATION }), 'rejected');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: true, message: 'Please activate this form.' }), 'rejected');
});

test('HTTP success alone is not acceptance', function () {
  assert.equal(inquiry.classifyInquiryResponse(200, null), 'unreadable');
  assert.equal(inquiry.classifyInquiryResponse(200, {}), 'rejected');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'true', message: '' }), 'unreadable');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'true' }), 'unreadable');
  assert.equal(inquiry.classifyInquiryResponse(204, null), 'unreadable');
});

test('a success flag on an HTTP error is not acceptance', function () {
  assert.equal(inquiry.classifyInquiryResponse(500, { success: 'true', message: ACCEPTED_MESSAGE }), 'http-error');
  assert.equal(inquiry.classifyInquiryResponse(422, { success: 'false', message: 'nope' }), 'http-error');
  assert.equal(inquiry.classifyInquiryResponse(403, null), 'http-error');
});

test('other truthy success values are not acceptance', function () {
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'True', message: ACCEPTED_MESSAGE }), 'rejected');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 1, message: ACCEPTED_MESSAGE }), 'rejected');
  assert.equal(inquiry.classifyInquiryResponse(200, { success: 'yes', message: ACCEPTED_MESSAGE }), 'rejected');
});

test('routing constants stay on the contact inbox and the copy inbox', function () {
  assert.equal(inquiry.ENDPOINT, 'https://formsubmit.co/ajax/hello@creativemotionevents.com');
  assert.equal(inquiry.COPY_TO, 'cmeinquiries@mail.grokbot.com');
  assert.equal(inquiry.SUCCESS.includes('accepted'), true);
  assert.equal(/24 hours/.test(inquiry.NOT_ACCEPTED), false);
  assert.equal(/24 hours/.test(inquiry.NOT_REACHED), false);
  assert.equal(/24 hours/.test(inquiry.NOT_CONFIRMED), false);
});
