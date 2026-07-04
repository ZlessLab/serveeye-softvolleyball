'use strict';

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { getActivePlan } = require('../../config/plans');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  let plan;
  try {
    plan = getActivePlan();
  } catch {
    return res.status(503).json({ error: 'No active plan' });
  }

  if (!plan.stripe_price_id) {
    return res.status(503).json({ error: 'Stripe price not configured' });
  }

  if (plan.campaign) {
    const { data: planRow } = await supabase
      .from('plans')
      .select('id')
      .eq('slug', plan.slug)
      .single();

    if (planRow) {
      const { data: campaign } = await supabase
        .from('campaign_limits')
        .select('max_count, sold_count, is_active, end_date')
        .eq('plan_id', planRow.id)
        .single();

      if (campaign) {
        const now = new Date();
        const expired = campaign.end_date && new Date(campaign.end_date) < now;
        const soldOut = campaign.max_count !== null && campaign.sold_count >= campaign.max_count;
        if (!campaign.is_active || expired || soldOut) {
          return res.status(409).json({ error: 'Campaign is no longer available' });
        }
      }
    }
  }

  const baseUrl = process.env.APP_BASE_URL || 'https://zless.jp';

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer_creation: 'always',
      metadata: { plan_slug: plan.slug },
      success_url: `${baseUrl}/purchase-complete.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/`,
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }

  return res.status(200).json({ url: session.url });
};
