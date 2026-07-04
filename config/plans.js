/**
 * Zless 販売プラン定義
 *
 * Stripe の商品ID・価格ID はすべて環境変数から読み込む。
 * コードを変更せずに Vercel 環境変数を更新するだけで
 * 価格・プラン・アクティブプランを切り替えられる。
 *
 * ACTIVE_PLAN_ID を変更するだけで launch_individual ↔ standard_individual を切り替え可能。
 */

'use strict';

const plans = {
  launch_individual: {
    slug: 'launch_individual',
    name: 'リリース記念 個人ライセンス',
    price_jpy: 1980,
    max_devices: 2,
    license_duration: null,           // null = 永続
    stripe_product_id: process.env.STRIPE_PRODUCT_LAUNCH_INDIVIDUAL || null,
    stripe_price_id:   process.env.STRIPE_PRICE_LAUNCH_INDIVIDUAL   || null,
    is_available: true,
    campaign: {
      max_count: 100,                 // 先着100本
      end_date:  null,               // null = 日付制限なし
    },
  },

  standard_individual: {
    slug: 'standard_individual',
    name: '個人ライセンス',
    price_jpy: 2980,
    max_devices: 2,
    license_duration: null,
    stripe_product_id: process.env.STRIPE_PRODUCT_STANDARD_INDIVIDUAL || null,
    stripe_price_id:   process.env.STRIPE_PRICE_STANDARD_INDIVIDUAL   || null,
    is_available: true,
    campaign: null,
  },

  // ── 将来追加予定（is_available: false の間は販売ロジックに乗らない） ──

  team_license: {
    slug: 'team_license',
    name: 'チームライセンス',
    price_jpy: null,                  // TBD
    max_devices: 10,
    license_duration: null,
    stripe_product_id: process.env.STRIPE_PRODUCT_TEAM || null,
    stripe_price_id:   process.env.STRIPE_PRICE_TEAM   || null,
    is_available: false,
    campaign: null,
  },

  tournament_license: {
    slug: 'tournament_license',
    name: '大会ライセンス',
    price_jpy: null,                  // TBD
    max_devices: 50,
    license_duration: null,
    stripe_product_id: process.env.STRIPE_PRODUCT_TOURNAMENT || null,
    stripe_price_id:   process.env.STRIPE_PRICE_TOURNAMENT   || null,
    is_available: false,
    campaign: null,
  },

  suite_license: {
    slug: 'suite_license',
    name: 'Zless Sports Suite',
    price_jpy: null,                  // TBD
    max_devices: null,               // 無制限
    license_duration: null,
    stripe_product_id: process.env.STRIPE_PRODUCT_SUITE || null,
    stripe_price_id:   process.env.STRIPE_PRICE_SUITE   || null,
    is_available: false,
    campaign: null,
  },
};

/** 現在販売中のプランID。Vercel環境変数 ACTIVE_PLAN_ID を変えるだけで切り替え可能 */
const activePlanId = process.env.ACTIVE_PLAN_ID || 'launch_individual';

/** 現在販売中のプラン定義を返す */
function getActivePlan() {
  const plan = plans[activePlanId];
  if (!plan || !plan.is_available) {
    throw new Error(`Active plan "${activePlanId}" is not available`);
  }
  return plan;
}

/** slug でプランを取得する */
function getPlanBySlug(slug) {
  return plans[slug] || null;
}

module.exports = { plans, activePlanId, getActivePlan, getPlanBySlug };
