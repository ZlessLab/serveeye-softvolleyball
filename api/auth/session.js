'use strict';

const { createClient } = require('@supabase/supabase-js');

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

/**
 * 起動時のセッション再確認用エンドポイント。
 * アプリが保持する session_token でライセンスの有効性を再チェックする。
 * 無料体験ライセンスの有効期限切れを、起動時に検出するために使う。
 * （オフライン時はアプリ側で猶予し、次回オンライン時に再確認する）
 */
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { session_token } = body;
  if (!session_token) {
    return res.status(400).json({ error: 'session_token is required' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: device } = await supabase
    .from('license_devices')
    .select('id, license_id')
    .eq('session_token', String(session_token))
    .single();

  if (!device) return res.status(401).json({ error: 'Invalid session' });

  const { data: license } = await supabase
    .from('licenses')
    .select('id, status, expires_at, plans(slug)')
    .eq('id', device.license_id)
    .single();

  if (!license) return res.status(401).json({ error: 'Invalid session' });
  if (license.status !== 'active') return res.status(403).json({ error: 'License is not active' });
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
    return res.status(403).json({ error: 'License expired', expires_at: license.expires_at });
  }

  await supabase
    .from('license_devices')
    .update({ last_verified_at: new Date().toISOString() })
    .eq('id', device.id);

  return res.status(200).json({
    ok: true,
    plan_slug: license.plans?.slug || null,
    expires_at: license.expires_at || null,
  });
};
