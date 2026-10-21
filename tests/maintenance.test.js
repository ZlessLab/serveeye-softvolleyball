'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const name = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
const runtime = ['api', 'lib', 'config'].flatMap(files).filter(name => name.endsWith('.js'));

test('all runtime environment names are documented without actual license secret', () => {
  const example = read('.env.example');
  const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]));
  for (const name of runtime) {
    for (const match of read(name).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      assert.ok(documented.has(match[1]), `${name}: missing ${match[1]}`);
    }
  }
  assert.match(example, /^LICENSE_CODE_SECRET=$/m);
  assert.match(example, /^STRIPE_PAYMENT_LINK_URL=$/m);
});

test('runtime external imports remain declared after removing unused nanoid', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.nanoid, undefined);
  for (const name of runtime) {
    for (const match of read(name).matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.') || require('node:module').isBuiltin(specifier)) continue;
      const dep = specifier.startsWith('@') ? specifier.split('/').slice(0,2).join('/') : specifier.split('/')[0];
      assert.ok(pkg.dependencies[dep], `${name}: missing dependency ${dep}`);
      assert.ok(require.resolve(specifier));
    }
  }
});

test('deployment exclusion keeps APIs, their relative imports, and web assets', () => {
  // Intentionally restricted to the simple root patterns used here. This is a
  // static safety check, not a replacement for an actual Vercel build/preview.
  const patterns = read('.vercelignore').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const excluded = name => patterns.some(pattern => {
    assert.match(pattern, /^[\w.*\/-]+$/, 'unsupported ignore pattern: update this checker');
    if (pattern.endsWith('/')) return name.startsWith(pattern);
    const re = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
    return re.test(name);
  });
  for (const name of ['README.md', 'FUNNEL-QA.md', 'supabase/schema.sql', 'mobile/ios/package.json', 'tests/maintenance.test.js', '.env', '.env.example', '.env.production', 'docs/archive/maintenance-history.md', 'server.js', 'output_supabase_additions.sql']) {
    assert.ok(excluded(name), `management file not excluded: ${name}`);
  }
  const publicAssets = ['index.html', 'demo.html', 'demo-flow.js', 'purchase-ui.js', 'soft-volleyball-score.html', 'purchase-complete.html', 'manifest.json', 'sw.js', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'package.json', 'vercel.json', ...files('legal'), ...files('icons-generated')];
  for (const name of [...runtime, ...publicAssets]) {
    assert.ok(!excluded(name), `required file excluded: ${name}`);
    assert.ok(fs.existsSync(path.join(root, name)), `required file missing: ${name}`);
  }
  for (const name of runtime) {
    for (const match of read(name).matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      const target = path.relative(root, require.resolve(path.resolve(root, path.dirname(name), match[1])));
      assert.ok(!excluded(target), `${name}: relative dependency excluded: ${target}`);
    }
  }
});

test('SQL definition has one canonical file and RPC recovery gap remains explicit', () => {
  assert.ok(!fs.existsSync(path.join(root, 'output_supabase_additions.sql')));
  const schema = read('supabase/schema.sql');
  for (const table of ['refunds', 'app_versions', 'feature_flags', 'organizations', 'organization_licenses']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  }
  assert.match(read('README.md'), /increment_campaign_sale/);
  assert.match(read('README.md'), /既存環境の値は継続使用/);
});
