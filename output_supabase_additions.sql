CREATE TABLE IF NOT EXISTS refunds (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      UUID        NOT NULL REFERENCES purchases(id),
  license_id       UUID        REFERENCES licenses(id),
  stripe_refund_id TEXT        UNIQUE,
  amount_jpy       INT         NOT NULL,
  reason           TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  note             TEXT,
  refunded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_purchase_id      ON refunds(purchase_id);
CREATE INDEX IF NOT EXISTS idx_refunds_license_id       ON refunds(license_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id ON refunds(stripe_refund_id);

ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS app_versions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version          TEXT        NOT NULL,
  release_notes    TEXT,
  required_plan    TEXT        NULL,
  is_current       BOOL        NOT NULL DEFAULT false,
  is_forced_update BOOL        NOT NULL DEFAULT false,
  released_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_app_versions_product_id ON app_versions(product_id);
CREATE INDEX IF NOT EXISTS idx_app_versions_is_current ON app_versions(product_id) WHERE is_current = true;

ALTER TABLE app_versions DISABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        REFERENCES products(id) ON DELETE CASCADE,
  plan_id     UUID        REFERENCES plans(id),
  flag_key    TEXT        NOT NULL,
  is_enabled  BOOL        NOT NULL DEFAULT false,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_product_id ON feature_flags(product_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_flag_key   ON feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_plan_id    ON feature_flags(plan_id);

ALTER TABLE feature_flags DISABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS organizations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  slug               TEXT        UNIQUE,
  contact_email      TEXT        NOT NULL,
  plan_id            UUID        REFERENCES plans(id),
  stripe_customer_id TEXT        UNIQUE,
  max_members        INT         NOT NULL DEFAULT 10,
  status             TEXT        NOT NULL DEFAULT 'active',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_contact_email ON organizations(contact_email);
CREATE INDEX IF NOT EXISTS idx_organizations_plan_id       ON organizations(plan_id);

ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS organization_licenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  license_id      UUID        NOT NULL UNIQUE REFERENCES licenses(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_licenses_organization_id ON organization_licenses(organization_id);

ALTER TABLE organization_licenses DISABLE ROW LEVEL SECURITY;
