-- 2026-11-18 価格改定: 個人ライセンスを ¥980 に一本化する
-- 実行場所: Supabase Dashboard → SQL Editor
-- 何度実行しても安全（同じ値への更新のみ）
--
-- 内容:
--   1. plans の価格を launch_individual / standard_individual とも ¥980 に統一
--   2. launch_individual のキャンペーン（先着100本）を無効化
--      ※ config/plans.js 側でも campaign: null に変更済み。二重に止めておく。
--   3. launch_individual のプラン名を「個人ライセンス」に統一

UPDATE plans SET price_jpy = 980, name = '個人ライセンス'
WHERE slug = 'launch_individual';

UPDATE plans SET price_jpy = 980
WHERE slug = 'standard_individual';

UPDATE campaign_limits SET is_active = false
WHERE plan_id IN (SELECT id FROM plans WHERE slug = 'launch_individual');

-- 確認用:
-- SELECT slug, name, price_jpy FROM plans ORDER BY slug;
-- SELECT plan_id, max_count, sold_count, is_active FROM campaign_limits;
