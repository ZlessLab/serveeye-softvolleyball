'use strict';

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function hashCode(raw) {
  return crypto.createHash('sha256').update(raw.replace(/-/g, '').toUpperCase()).digest('hex');
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { email, code, fingerprint } = body;
  if (!email || !code || !fingerprint) {
    return res.status(400).json({ error: 'email, code, fingerprint are required' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const codeHash = hashCode(String(code));

  // ライセンス検索
  const { data: license } = await supabase
    .from('licenses')
    .select('id, customer_id, status, max_devices, plans(slug)')
    .eq('code_hash', codeHash)
    .single();

  if (!license) return res.status(401).json({ error: 'Invalid license code' });
  if (license.status !== 'active') return res.status(403).json({ error: 'License is not active' });

  // メール照合
  const { data: customer } = await supabase
    .from('customers').select('email').eq('id', license.customer_id).single();

  if (!customer || customer.email.toLowerCase() !== String(email).toLowerCase().trim()) {
    return res.status(401).json({ error: 'Email does not match' });
  }

  const fpHash = crypto.createHash('sha256').update(String(fingerprint)).digest('hex');
  const planSlug = license.plans?.slug || 'launch_individual';

  // 同一端末なら既存トークン返却
  const { data: existing } = await supabase
    .from('license_devices')
    .select('id, session_token')
    .eq('license_id', license.id)
    .eq('fingerprint_hash', fpHash)
    .single();

  if (existing) {
    await supabase
      .from('license_devices')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('id', existing.id);
    return res.status(200).json({ ok: true, session_token: existing.session_token, plan_slug: planSlug });
  }

  // 端末数チェック
  const { count } = await supabase
    .from('license_devices')
    .select('id', { count: 'exact', head: true })
    .eq('license_id', license.id);

  if (count >= license.max_devices) {
    await supabase.from('audit_logs').insert({
      license_id: license.id,
      event_type: 'device_limit_exceeded',
      metadata: { email, fingerprint_hash: fpHash },
    });
    return res.status(403).json({ error: 'Device limit reached', max_devices: license.max_devices });
  }

  // 新規端末登録
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await supabase.from('license_devices').insert({
    license_id:      license.id,
    session_token:   sessionToken,
    fingerprint_hash: fpHash,
    user_agent:      req.headers['user-agent'] || '',
    last_verified_at: new Date().toISOString(),
  });

  await supabase.from('audit_logs').insert({
    license_id: license.id,
    event_type: 'device_added',
    metadata: { email },
  });

  return res.status(200).json({ ok: true, session_token: sessionToken, plan_slug: planSlug });
};
