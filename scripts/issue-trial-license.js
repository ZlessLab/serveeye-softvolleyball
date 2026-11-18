/**
 * 無料体験ライセンス発行スクリプト
 *
 * 使い方:
 *   node scripts/issue-trial-license.js --email user@example.com [--days 30]
 *
 * 必要な環境変数（.env.local があれば自動で読み込む）:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, LICENSE_CODE_SECRET
 *
 * 動作:
 *   - 事前に supabase/add_trial_plan.sql で trial プランを登録しておくこと
 *   - customers をメールアドレスで upsert し、purchases に金額0の体験レコードを作り、
 *     licenses に expires_at 付きのライセンスを発行する
 *   - ライセンスコードは購入時と同じ導出ロジック（api/webhook.js の deriveLicenseCode）で
 *     生成するので、アプリ側の認証（/api/auth/verify）はそのまま通る
 *   - 同じメールアドレスで再実行すると、新しい体験ライセンスをもう1つ発行する
 *     （コードは毎回変わる。渡し間違いに注意）
 *
 * 出力されたコードとメールアドレスの組み合わせを、DMなどで申込者へ渡す。
 * コードの原文はDBに保存されない（ハッシュのみ）ので、発行直後に控えること。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { _test } = require('../api/webhook');
const { deriveLicenseCode, hashCode } = _test;

// .env.local があれば読み込む（既存の依存だけで処理する）
(function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') args.email = argv[++i];
    else if (argv[i] === '--days') args.days = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const { email, days } = parseArgs(process.argv.slice(2));
  if (!email || !email.includes('@')) {
    console.error('使い方: node scripts/issue-trial-license.js --email user@example.com [--days 30]');
    process.exit(1);
  }
  const trialDays = Number.isInteger(days) && days > 0 ? days : 30;

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, LICENSE_CODE_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !LICENSE_CODE_SECRET) {
    console.error('環境変数が不足しています: SUPABASE_URL / SUPABASE_SERVICE_KEY / LICENSE_CODE_SECRET');
    console.error('.env.local に置くか、環境変数として渡してください（値は表示しません）。');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // trial プラン取得
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, max_devices, license_duration')
    .eq('slug', 'trial')
    .single();
  if (planError || !plan) {
    console.error('trial プランが見つかりません。先に supabase/add_trial_plan.sql を Supabase で実行してください。');
    process.exit(1);
  }

  // 顧客 upsert（メールアドレス単位）
  const normalizedEmail = email.toLowerCase().trim();
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .upsert({ email: normalizedEmail }, { onConflict: 'email' })
    .select('id')
    .single();
  if (customerError || !customer) {
    console.error('customers の upsert に失敗しました:', customerError?.message);
    process.exit(1);
  }

  // 体験用の purchases レコード（stripe_session_id は一意な合成ID）
  const sessionId = 'trial_' + crypto.randomUUID();
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      customer_id: customer.id,
      plan_id: plan.id,
      stripe_session_id: sessionId,
      stripe_payment_id: null,
      amount_jpy: 0,
      status: 'completed',
    })
    .select('id')
    .single();
  if (purchaseError || !purchase) {
    console.error('purchases の作成に失敗しました:', purchaseError?.message);
    process.exit(1);
  }

  // ライセンス発行（コードは sessionId から決定的に導出。有効期限付き）
  const licenseCode = deriveLicenseCode(sessionId);
  const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  const { error: licenseError } = await supabase.from('licenses').insert({
    purchase_id: purchase.id,
    customer_id: customer.id,
    plan_id: plan.id,
    code_hash: hashCode(licenseCode),
    status: 'active',
    expires_at: expiresAt.toISOString(),
    max_devices: plan.max_devices ?? 2,
    delivered_at: new Date().toISOString(),
  });
  if (licenseError) {
    console.error('licenses の作成に失敗しました:', licenseError.message);
    process.exit(1);
  }

  console.log('無料体験ライセンスを発行しました');
  console.log('  メールアドレス:', normalizedEmail);
  console.log('  ライセンスコード:', licenseCode);
  console.log('  有効期限:', expiresAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }), `(${trialDays}日間)`);
  console.log('  最大端末数:', plan.max_devices ?? 2);
  console.log('※ コードの原文はDBに保存されません。この表示をそのまま申込者へ渡してください。');
}

main().catch((err) => {
  console.error('予期しないエラー:', err.message);
  process.exit(1);
});
