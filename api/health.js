'use strict';

const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const key = process.env.STRIPE_SECRET_KEY || '';
  const priceId = process.env.STRIPE_PRICE_LAUNCH_INDIVIDUAL || '';

  const keyMode = key.startsWith('sk_live_') ? 'live'
    : key.startsWith('sk_test_') ? 'test'
    : 'missing';

  let priceCheck = null;
  if (key && priceId) {
    try {
      const stripe = new Stripe(key);
      const price = await stripe.prices.retrieve(priceId);
      priceCheck = { ok: true, active: price.active, currency: price.currency, unit_amount: price.unit_amount };
    } catch (err) {
      priceCheck = { ok: false, error: err.message };
    }
  } else {
    priceCheck = { ok: false, error: !key ? 'STRIPE_SECRET_KEY missing' : 'STRIPE_PRICE_LAUNCH_INDIVIDUAL missing' };
  }

  res.status(200).json({
    ok: true,
    key_mode: keyMode,
    price_id: priceId,
    price_check: priceCheck,
  });
};
