'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ ok: true, env: !!process.env.STRIPE_SECRET_KEY });
};
