'use strict';

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendLicenseEmail } = require('../lib/mailer');

module.exports.config = { api: { bodyParser: false } };

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateLicenseCode() {
  const bytes = crypto.randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function hashCode(raw) {
  return crypto.createHash('sha256').update(raw.replace(/-/g, '').toUpperCase()).digest('hex');
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session   = event.data.object;
  const sessionId = session.id;
  const email     = session.customer_details?.email;
  const planSlug  = session.metadata?.plan_slug || 'launch_individual';

  if (!email) {
    console.error('No email in session:', sessionId);
    return res.status(200).json({ received: true });
  }

  // 冪等性チェック
  const { data: existing } = await supabase
    .from('purchases').select('id').eq('stripe_session_id', sessionId).single();
  if (existing) return res.status(200).json({ received: true });

  // プラン取得
  const { data: plan } = await supabase
    .from('plans').select('id, price_jpy, max_devices').eq('slug', planSlug).single();
  if (!plan) {
    console.error('Plan not found:', planSlug);
    return res.status(200).json({ received: true });
  }

  // 顧客 upsert
  const { data: customer } = await supabase
    .from('customers')
    .upsert({ email, stripe_customer_id: session.customer }, { onConflict: 'email' })
    .select('id').single();
  if (!customer) return res.status(500).json({ error: 'DB error: customer' });

  // 購入記録
  const { data: purchase } = await supabase
    .from('purchases')
    .insert({
      customer_id:       customer.id,
      plan_id:           plan.id,
      stripe_session_id: sessionId,
      stripe_payment_id: session.payment_intent,
      amount_jpy:        plan.price_jpy,
      status:            'completed',
    })
    .select('id').single();
  if (!purchase) return res.status(500).json({ error: 'DB error: purchase' });

  // ライセンス生成
  const licenseCode = generateLicenseCode();
  const { error: licErr } = await supabase.from('licenses').insert({
    purchase_id: purchase.id,
    customer_id: customer.id,
    plan_id:     plan.id,
    code_hash:   hashCode(licenseCode),
    status:      'active',
    max_devices: plan.max_devices,
  });
  if (licErr) {
    console.error('License insert error:', licErr.message);
    return res.status(500).json({ error: 'DB error: license' });
  }

  // キャンペーン sold_count インクリメント
  const { data: cl } = await supabase
    .from('campaign_limits').select('id, sold_count').eq('plan_id', plan.id).single();
  if (cl) {
    await supabase
      .from('campaign_limits')
      .update({ sold_count: cl.sold_count + 1 })
      .eq('id', cl.id);
  }

  // メール送信（失敗してもライセンス発行は完了）
  try {
    await sendLicenseEmail({ to: email, licenseCode });
  } catch (err) {
    console.error('Email error:', err.message);
  }

  return res.status(200).json({ received: true });
};
