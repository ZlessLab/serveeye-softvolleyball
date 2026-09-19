'use strict';

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendLicenseEmail } = require('../lib/mailer');

module.exports.config = { api: { bodyParser: false } };

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const PAID_CHECKOUT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const STRIPE_API_VERSION = '2026-07-29.dahlia';

function deriveLicenseCode(sessionId) {
  const secret = process.env.LICENSE_CODE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('LICENSE_CODE_SECRET must be at least 32 characters');
  }

  const bytes = crypto.createHmac('sha256', secret).update(sessionId).digest();
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

function isDerivedLicense(license, licenseCode) {
  return Boolean(license?.code_hash) && license.code_hash === hashCode(licenseCode);
}

function shouldIncrementCampaign(event, licenseCreated) {
  return Boolean(event?.livemode && licenseCreated);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function getOrCreatePurchase(supabase, { session, email, plan }) {
  const { data: existing, error: existingError } = await supabase
    .from('purchases')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return { purchase: existing, created: false };

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .upsert({ email, stripe_customer_id: session.customer }, { onConflict: 'email' })
    .select('id')
    .single();
  if (customerError || !customer) throw customerError || new Error('Customer upsert failed');

  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      customer_id: customer.id,
      plan_id: plan.id,
      stripe_session_id: session.id,
      stripe_payment_id: session.payment_intent,
      amount_jpy: session.amount_total,
      status: 'completed',
    })
    .select('id')
    .single();

  if (purchaseError) {
    if (purchaseError.code === '23505') {
      const { data: racedPurchase, error: racedError } = await supabase
        .from('purchases')
        .select('id')
        .eq('stripe_session_id', session.id)
        .single();
      if (racedError || !racedPurchase) throw racedError || purchaseError;
      return { purchase: racedPurchase, created: false };
    }
    throw purchaseError;
  }

  return { purchase, created: true, customerId: customer.id };
}

async function getOrCreateLicense(supabase, { purchase, customerId, plan, licenseCode }) {
  const { data: existing, error: existingError } = await supabase
    .from('licenses')
    .select('id, code_hash, delivered_at')
    .eq('purchase_id', purchase.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return { license: existing, created: false };

  if (!customerId) {
    const { data: purchaseRow, error: purchaseError } = await supabase
      .from('purchases')
      .select('customer_id')
      .eq('id', purchase.id)
      .single();
    if (purchaseError || !purchaseRow) throw purchaseError || new Error('Purchase lookup failed');
    customerId = purchaseRow.customer_id;
  }

  const { data: license, error: licenseError } = await supabase
    .from('licenses')
    .insert({
      purchase_id: purchase.id,
      customer_id: customerId,
      plan_id: plan.id,
      code_hash: hashCode(licenseCode),
      status: 'active',
      max_devices: plan.max_devices,
    })
    .select('id, code_hash, delivered_at')
    .single();

  if (licenseError) {
    if (licenseError.code === '23505') {
      const { data: racedLicense, error: racedError } = await supabase
        .from('licenses')
        .select('id, code_hash, delivered_at')
        .eq('purchase_id', purchase.id)
        .single();
      if (racedError || !racedLicense) throw racedError || licenseError;
      return { license: racedLicense, created: false };
    }
    throw licenseError;
  }

  return { license, created: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
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

  if (!PAID_CHECKOUT_EVENTS.has(event.type)) {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== 'paid') {
    return res.status(200).json({ received: true, awaiting_payment: true });
  }

  const email = session.customer_details?.email?.trim().toLowerCase();
  const planSlug = session.metadata?.plan_slug;
  if (!email || !planSlug) {
    console.error('Checkout data missing:', session.id);
    return res.status(500).json({ error: 'Checkout data missing' });
  }

  try {
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, price_jpy, max_devices, is_available')
      .eq('slug', planSlug)
      .single();
    if (planError || !plan) throw planError || new Error('Plan not found');
    if (!plan.is_available) throw new Error('Plan is not available');

    if (session.currency !== 'jpy' || session.amount_total !== plan.price_jpy) {
      throw new Error(`Checkout amount mismatch for ${session.id}`);
    }

    const licenseCode = deriveLicenseCode(session.id);
    const purchaseResult = await getOrCreatePurchase(supabase, { session, email, plan });
    const licenseResult = await getOrCreateLicense(supabase, {
      purchase: purchaseResult.purchase,
      customerId: purchaseResult.customerId,
      plan,
      licenseCode,
    });

    if (!isDerivedLicense(licenseResult.license, licenseCode)) {
      // 旧版はランダム生成コードだったため、元のコードを安全に復元できない。
      // 過去のイベント再送では新しいコードを上書き送信せず、Stripeの再試行だけ停止する。
      console.warn(`Legacy license already exists for ${session.id}`);
      return res.status(200).json({ received: true, legacy_license: true });
    }

    // サンドボックス決済は本番の「先着100本」に含めない。
    if (shouldIncrementCampaign(event, licenseResult.created)) {
      const { error: campaignError } = await supabase.rpc('increment_campaign_sale', {
        target_plan_id: plan.id,
      });
      // 残数表示の更新失敗で、購入者へのライセンス送付まで止めない。
      if (campaignError) console.error('Campaign increment failed:', campaignError.message);
    }

    if (!licenseResult.license.delivered_at) {
      await sendLicenseEmail({ to: email, licenseCode });
      const { error: deliveryError } = await supabase
        .from('licenses')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', licenseResult.license.id);
      if (deliveryError) throw deliveryError;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook fulfillment error:', err.message);
    return res.status(500).json({ error: 'Fulfillment failed' });
  }
};

module.exports._test = { deriveLicenseCode, hashCode, isDerivedLicense, shouldIncrementCampaign };
