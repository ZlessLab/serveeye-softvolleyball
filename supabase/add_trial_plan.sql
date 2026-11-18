-- 無料体験プラン（trial）を plans テーブルに追加する
-- 実行場所: Supabase Dashboard → SQL Editor
-- 何度実行しても安全（slug が既にあれば何もしない）
--
-- 前提: products テーブルに slug = 'serveeye' の行が存在すること（本番構築時に登録済みのはず）
-- 注意: stripe_product_id / stripe_price_id は NOT NULL のためダミー値を入れる。
--       体験プランは Stripe を経由しないので、この値が実際に使われることはない。

INSERT INTO plans (product_id, slug, name, price_jpy, max_devices, license_duration, stripe_product_id, stripe_price_id, is_available)
SELECT id, 'trial', '無料体験ライセンス', 0, 2, 30, 'trial_no_stripe', 'trial_no_stripe', false
FROM products
WHERE slug = 'serveeye'
ON CONFLICT (slug) DO NOTHING;

-- 確認用: 追加されていれば1行返る
-- SELECT slug, name, price_jpy, max_devices, license_duration, is_available FROM plans WHERE slug = 'trial';
