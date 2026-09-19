'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LICENSE_CODE_SECRET = 'serveeye-test-secret-that-is-longer-than-32-characters';

const { _test } = require('../api/webhook');

test('same Stripe session always derives the same license code', () => {
  const first = _test.deriveLicenseCode('cs_test_same_session');
  const second = _test.deriveLicenseCode('cs_test_same_session');

  assert.equal(first, second);
  assert.match(first, /^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){3}$/);
});

test('different Stripe sessions derive different license codes', () => {
  assert.notEqual(
    _test.deriveLicenseCode('cs_test_session_a'),
    _test.deriveLicenseCode('cs_test_session_b')
  );
});

test('license hash ignores hyphens and letter case', () => {
  assert.equal(
    _test.hashCode('ABCD-EFGH-JKLM-NPQR'),
    _test.hashCode('abcdefghjklmnpqr')
  );
});

test('derived license detection distinguishes legacy random codes', () => {
  const code = _test.deriveLicenseCode('cs_test_new_session');
  assert.equal(_test.isDerivedLicense({ code_hash: _test.hashCode(code) }, code), true);
  assert.equal(
    _test.isDerivedLicense({ code_hash: _test.hashCode('ABCD-EFGH-JKLM-NPQR') }, code),
    false
  );
});

test('campaign count increases only for a newly created live-mode license', () => {
  assert.equal(_test.shouldIncrementCampaign({ livemode: true }, true), true);
  assert.equal(_test.shouldIncrementCampaign({ livemode: false }, true), false);
  assert.equal(_test.shouldIncrementCampaign({ livemode: true }, false), false);
});
