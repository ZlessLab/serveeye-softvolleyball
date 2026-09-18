'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../api/checkout/session');

test('accepts a Stripe-hosted payment link', () => {
  process.env.STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/test_example';
  assert.equal(
    _test.getConfiguredPaymentLink(),
    'https://buy.stripe.com/test_example'
  );
});

test('rejects a payment link hosted outside Stripe', () => {
  process.env.STRIPE_PAYMENT_LINK_URL = 'https://example.com/not-stripe';
  assert.throws(
    () => _test.getConfiguredPaymentLink(),
    /https:\/\/buy\.stripe\.com/
  );
});

test('keeps the existing checkout flow when no payment link is configured', () => {
  delete process.env.STRIPE_PAYMENT_LINK_URL;
  assert.equal(_test.getConfiguredPaymentLink(), null);
});
