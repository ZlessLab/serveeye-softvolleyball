-- ============================================================
--  Zless 販売・ライセンス管理 DB スキーマ v2.0
--  対応アプリ: ServeEye（将来: ラインズマン・スコアラー・大会管理）
--  実行場所: Supabase ダッシュボード → SQL Editor → New Query
--  ※ Phase 3 時点では schema 定義のみ。シードデータは末尾を参照。
-- ============================================================


-- ── 1. products（アプリ単位） ────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,             -- 'serveeye' | 'linesman' | 'scorer'
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active',   -- 'active' | 'inactive'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. plans（価格プラン） ────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slug              TEXT        NOT NULL UNIQUE,       -- 'launch_individual' | 'standard_individual'
  name              TEXT        NOT NULL,
  price_jpy         INT         NOT NULL,
  max_devices       INT         NOT NULL DEFAULT 2,
  license_duration  INT         NULL,                  -- NULL=永続、日数で期限付き対応
  stripe_product_id TEXT        NOT NULL,
  stripe_price_id   TEXT        NOT NULL,
  is_available      BOOL        NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_product_id ON plans(product_id);
CREATE INDEX IF NOT EXISTS idx_plans_slug       ON plans(slug);


-- ── 3. campaign_limits（キャンペーン販売制御） ────────────────
-- is_active=false または sold_count>=max_count または end_date<now() で自動終了
CREATE TABLE IF NOT EXISTS campaign_limits (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID        NOT NULL UNIQUE REFERENCES plans(id) ON DELETE CASCADE,
  max_count  INT         NULL,                         -- NULL=本数制限なし
  sold_count INT         NOT NULL DEFAULT 0,
  end_date   TIMESTAMPTZ NULL,                         -- NULL=日付制限なし
  is_active  BOOL        NOT NULL DEFAULT true,        -- 手動ON/OFF
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 4. customers（購入者、メールアドレス単位） ────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT        NOT NULL UNIQUE,
  stripe_customer_id TEXT        UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);


-- ── 5. purchases（購入記録） ──────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID        NOT NULL REFERENCES customers(id),
  plan_id           UUID        NOT NULL REFERENCES plans(id),
  stripe_session_id TEXT        NOT NULL UNIQUE,       -- 冪等性チェック用
  stripe_payment_id TEXT,
  amount_jpy        INT         NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'refunded'
  purchased_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_customer_id       ON purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_session_id ON purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status            ON purchases(status);


-- ── 6. licenses（ライセンス） ─────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID        NOT NULL UNIQUE REFERENCES purchases(id),
  customer_id UUID        NOT NULL REFERENCES customers(id),
  plan_id     UUID        NOT NULL REFERENCES plans(id),
  code_hash   TEXT        NOT NULL UNIQUE,             -- SHA-256ハッシュ（元コードは保存しない）
  status      TEXT        NOT NULL DEFAULT 'active',   -- 'active' | 'suspended' | 'expired'
  expires_at  TIMESTAMPTZ NULL,                        -- NULL=永続
  max_devices INT         NOT NULL DEFAULT 2,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_licenses_code_hash   ON licenses(code_hash);
CREATE INDEX IF NOT EXISTS idx_licenses_status      ON licenses(status);


-- ── 7. license_devices（登録端末） ────────────────────────────
CREATE TABLE IF NOT EXISTS license_devices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id       UUID        NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  session_token    TEXT        NOT NULL UNIQUE,        -- 起動時照合トークン（64文字ランダム）
  fingerprint_hash TEXT        NOT NULL,               -- 端末フィンガープリントのSHA-256
  user_agent       TEXT,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- オフライン72h制御用
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_license_devices_license_id       ON license_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_session_token    ON license_devices(session_token);
CREATE INDEX IF NOT EXISTS idx_license_devices_fingerprint_hash ON license_devices(fingerprint_hash);


-- ── 8. coupons（クーポン・将来用） ───────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT        NOT NULL UNIQUE,
  discount_type  TEXT        NOT NULL,                 -- 'percent' | 'fixed_jpy'
  discount_value INT         NOT NULL,                 -- percent: 20 = 20% / fixed: 500 = 500円
  plan_id        UUID        REFERENCES plans(id),     -- NULL=全プラン対象
  max_uses       INT         NULL,                     -- NULL=無制限
  used_count     INT         NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ NULL,
  is_active      BOOL        NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 9. audit_logs（操作ログ・不正利用検知） ──────────────────
-- event_type:
--   login_success / login_failed / device_added /
--   device_limit_exceeded / license_suspended / device_revoked
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID        REFERENCES licenses(id),
  event_type TEXT        NOT NULL,
  ip_address TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_license_id  ON audit_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type  ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs(created_at DESC);


-- ── RLS 無効化（service_role key のみがアクセス。フロントから直接触らせない）──
ALTER TABLE products        DISABLE ROW LEVEL SECURITY;
ALTER TABLE plans           DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_limits DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers       DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchases       DISABLE ROW LEVEL SECURITY;
ALTER TABLE licenses        DISABLE ROW LEVEL SECURITY;
ALTER TABLE license_devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE coupons         DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs      DISABLE ROW LEVEL SECURITY;


-- ============================================================
--  初期シードデータ（Stripe ID を取得してから実行）
--  Supabase ダッシュボード → SQL Editor で個別に実行してください
-- ============================================================

-- Step 1: ServeEye を products に登録
-- INSERT INTO products (slug, name, description, status)
-- VALUES ('serveeye', 'ServeEye', '4人制ソフトバレーボール得点管理アプリ', 'active');

-- Step 2: リリース記念プランを登録（Stripe ID は実際の値に差し替える）
-- INSERT INTO plans (product_id, slug, name, price_jpy, max_devices, stripe_product_id, stripe_price_id, is_available)
-- SELECT id, 'launch_individual', 'リリース記念 個人ライセンス', 1980, 2,
--        'prod_XXXXXXXXXXXXXXXX', 'price_XXXXXXXXXXXXXXXX', true
-- FROM products WHERE slug = 'serveeye';

-- Step 3: 通常プランを登録
-- INSERT INTO plans (product_id, slug, name, price_jpy, max_devices, stripe_product_id, stripe_price_id, is_available)
-- SELECT id, 'standard_individual', '個人ライセンス（通常）', 2980, 2,
--        'prod_XXXXXXXXXXXXXXXX', 'price_XXXXXXXXXXXXXXXX', true
-- FROM products WHERE slug = 'serveeye';

-- Step 4: キャンペーン制限を登録（先着100本）
-- INSERT INTO campaign_limits (plan_id, max_count, is_active)
-- SELECT id, 100, true FROM plans WHERE slug = 'launch_individual';


-- ============================================================
--  管理用クエリ（ダッシュボードから随時実行）
-- ============================================================

-- 購入者・ライセンス状況一覧
-- SELECT c.email, pl.name AS plan, pu.amount_jpy, pu.status AS payment,
--        l.status AS license, l.max_devices, l.created_at
-- FROM purchases pu
-- JOIN customers c  ON pu.customer_id = c.id
-- JOIN plans pl     ON pu.plan_id     = pl.id
-- LEFT JOIN licenses l ON l.purchase_id = pu.id
-- ORDER BY pu.purchased_at DESC;

-- キャンペーン残り本数確認
-- SELECT pl.name, cl.max_count, cl.sold_count,
--        cl.max_count - cl.sold_count AS remaining, cl.is_active, cl.end_date
-- FROM campaign_limits cl
-- JOIN plans pl ON cl.plan_id = pl.id;

-- 特定メールの登録端末一覧
-- SELECT ld.fingerprint_hash, ld.user_agent, ld.last_verified_at
-- FROM license_devices ld
-- JOIN licenses l  ON ld.license_id = l.id
-- JOIN customers c ON l.customer_id = c.id
-- WHERE c.email = '対象メールアドレス';

-- ライセンス停止（不正利用時）
-- UPDATE licenses SET status = 'suspended' WHERE id = 'ライセンスUUID';

-- ライセンス再有効化
-- UPDATE licenses SET status = 'active' WHERE id = 'ライセンスUUID';

-- 端末リセット（ライセンスに紐づく全端末を削除）
-- DELETE FROM license_devices WHERE license_id = 'ライセンスUUID';

-- 特定端末のみ削除（端末上限超過サポート対応）
-- DELETE FROM license_devices WHERE id = '端末UUID';


-- ============================================================
--  追加テーブル v2.1
-- ============================================================


-- ── 10. refunds（返金履歴管理） ──────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      UUID        NOT NULL REFERENCES purchases(id),
  license_id       UUID        REFERENCES licenses(id),          -- 返金後にライセンス停止する場合に参照
  stripe_refund_id TEXT        UNIQUE,                           -- Stripe 返金ID（re_xxx）
  amount_jpy       INT         NOT NULL,
  reason           TEXT,        -- 'customer_request' | 'duplicate' | 'fraudulent' | 'other'
  status           TEXT        NOT NULL DEFAULT 'pending',       -- 'pending' | 'succeeded' | 'failed'
  note             TEXT,        -- 管理者メモ
  refunded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_purchase_id      ON refunds(purchase_id);
CREATE INDEX IF NOT EXISTS idx_refunds_license_id       ON refunds(license_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id ON refunds(stripe_refund_id);

ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;


-- ── 11. app_versions（アプリバージョン管理） ──────────────────
CREATE TABLE IF NOT EXISTS app_versions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version          TEXT        NOT NULL,         -- 'v1.0.0'
  release_notes    TEXT,
  required_plan    TEXT        NULL,             -- NULL=全プラン利用可 / 'standard_individual' など
  is_current       BOOL        NOT NULL DEFAULT false,          -- 現行バージョンフラグ
  is_forced_update BOOL        NOT NULL DEFAULT false,          -- true=旧バージョン起動をブロック
  released_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_app_versions_product_id ON app_versions(product_id);
CREATE INDEX IF NOT EXISTS idx_app_versions_is_current ON app_versions(product_id) WHERE is_current = true;

ALTER TABLE app_versions DISABLE ROW LEVEL SECURITY;


-- ── 12. feature_flags（機能ON/OFF管理） ──────────────────────
-- product_id=NULL → 全プロダクト共通フラグ
-- plan_id=NULL    → 全プラン対象
CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        REFERENCES products(id) ON DELETE CASCADE,
  plan_id     UUID        REFERENCES plans(id),
  flag_key    TEXT        NOT NULL,   -- 'tournament_mode' | 'dark_theme' | 'export_csv'
  is_enabled  BOOL        NOT NULL DEFAULT false,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_product_id ON feature_flags(product_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_flag_key   ON feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_plan_id    ON feature_flags(plan_id);

ALTER TABLE feature_flags DISABLE ROW LEVEL SECURITY;


-- ── 13. organizations（法人・団体ライセンス管理・将来用） ──────
CREATE TABLE IF NOT EXISTS organizations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,       -- '東京スポーツクラブ'
  slug               TEXT        UNIQUE,         -- 'tokyo-sports-club'
  contact_email      TEXT        NOT NULL,
  plan_id            UUID        REFERENCES plans(id),  -- チーム/大会ライセンスプラン
  stripe_customer_id TEXT        UNIQUE,
  max_members        INT         NOT NULL DEFAULT 10,
  status             TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'inactive'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_contact_email ON organizations(contact_email);
CREATE INDEX IF NOT EXISTS idx_organizations_plan_id       ON organizations(plan_id);

ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;


-- ── 13-b. organization_licenses（組織↔ライセンス 中間テーブル） ─
-- licenses テーブルを変更せず、組織とライセンスを紐づける
CREATE TABLE IF NOT EXISTS organization_licenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  license_id      UUID        NOT NULL UNIQUE   REFERENCES licenses(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_licenses_organization_id ON organization_licenses(organization_id);

ALTER TABLE organization_licenses DISABLE ROW LEVEL SECURITY;


-- ============================================================
--  追加テーブル 管理用クエリ
-- ============================================================

-- 返金一覧（購入者メール付き）
-- SELECT c.email, r.amount_jpy, r.reason, r.status, r.stripe_refund_id, r.refunded_at
-- FROM refunds r
-- JOIN purchases pu ON r.purchase_id = pu.id
-- JOIN customers c  ON pu.customer_id = c.id
-- ORDER BY r.refunded_at DESC;

-- 現行バージョン確認
-- SELECT p.slug, av.version, av.is_forced_update, av.released_at
-- FROM app_versions av
-- JOIN products p ON av.product_id = p.id
-- WHERE av.is_current = true;

-- 有効な feature_flags 一覧
-- SELECT p.slug AS product, pl.slug AS plan, ff.flag_key, ff.is_enabled
-- FROM feature_flags ff
-- LEFT JOIN products p  ON ff.product_id = p.id
-- LEFT JOIN plans pl    ON ff.plan_id    = pl.id
-- ORDER BY p.slug, ff.flag_key;

-- 組織のライセンス一覧
-- SELECT o.name, o.contact_email, l.status, l.max_devices, l.created_at
-- FROM organization_licenses ol
-- JOIN organizations o ON ol.organization_id = o.id
-- JOIN licenses l      ON ol.license_id      = l.id
-- WHERE o.slug = '組織のスラッグ';
