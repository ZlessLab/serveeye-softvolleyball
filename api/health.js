'use strict';

const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const rawKey = process.env.STRIPE_SECRET_KEY;
  const key = rawKey || '';

  const keyMode = key.startsWith('sk_live_') ? 'live'
    : key.startsWith('sk_test_') ? 'test'
    : 'missing';

  const priceId = process.env.STRIPE_PRICE_LAUNCH_INDIVIDUAL || '';

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
    key_defined: rawKey !== undefined,
    key_length: rawKey !== undefined ? rawKey.length : 0,
    key_preview: rawKey !== undefined ? JSON.stringify(rawKey.substring(0, 15)) : null,
    key_mode: keyMode,
    price_id_length: priceId.length,
    price_id_preview: priceId ? JSON.stringify(priceId.substring(0, 20)) : null,
    price_check: priceCheck,
    deployed_at: new Date().toISOString(),
  });
};
