'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getActivePlan } = require('../../config/plans');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let plan;
  try {
    plan = getActivePlan();
  } catch {
    return res.status(200).json({ available: false, remaining: null, price_jpy: null });
  }

  if (!plan.campaign) {
    return res.status(200).json({ available: true, remaining: null, price_jpy: plan.price_jpy });
  }

  const { data: planRow } = await supabase
    .from('plans')
    .select('id')
    .eq('slug', plan.slug)
    .single();

  if (!planRow) {
    return res.status(200).json({ available: true, remaining: null, price_jpy: plan.price_jpy });
  }

  const { data: campaign } = await supabase
    .from('campaign_limits')
    .select('max_count, sold_count, is_active, end_date')
    .eq('plan_id', planRow.id)
    .single();

  if (!campaign) {
    return res.status(200).json({ available: true, remaining: null, price_jpy: plan.price_jpy });
  }

  const now = new Date();
  const expired = campaign.end_date && new Date(campaign.end_date) < now;
  const soldOut = campaign.max_count !== null && campaign.sold_count >= campaign.max_count;
  const available = campaign.is_active && !expired && !soldOut;
  const remaining = campaign.max_count !== null ? campaign.max_count - campaign.sold_count : null;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ available, remaining, price_jpy: plan.price_jpy });
};
