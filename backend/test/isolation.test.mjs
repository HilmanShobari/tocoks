import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Checkout } from '../checkout.mjs';
import { createApp } from '../server.mjs';
import { loadCatalogs, loadMerchants, brandSlug } from '../config.mjs';

test('merchant config comes from explicit backend env, not legacy merchant JSON', async () => {
  const before = { ...process.env };
  try {
    delete process.env.AFIHUB_MERCHANT_ID; delete process.env.AFIHUB_WEBHOOK_SECRET; delete process.env.AFIHUB_CONVERSION_URL;
    assert.deepEqual(await loadMerchants(), {});
    process.env.AFIHUB_MERCHANT_ID = '11111111-1111-4111-8111-111111111111';
    process.env.AFIHUB_WEBHOOK_SECRET = 'test-secret';
    process.env.AFIHUB_CONVERSION_URL = 'https://example.test/api/v1/webhooks/custom';
    const configs = await loadMerchants();
    assert.deepEqual(Object.keys(configs), [brandSlug]);
    assert.equal(configs[brandSlug].merchant_id, process.env.AFIHUB_MERCHANT_ID);
    assert.equal(configs[brandSlug].secret_key, 'test-secret');
  } finally {
    for (const key of ['AFIHUB_MERCHANT_ID','AFIHUB_WEBHOOK_SECRET','AFIHUB_CONVERSION_URL']) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
});

test('single-brand HTTP backend rejects foreign checkout and foreign CORS origin before Xendit', async t => {
  const checkout = new Checkout({ dbPath: ':memory:', catalogs: await loadCatalogs(), merchants: async () => ({}), apiKey: 'xnd_development_test',
    fetchImpl: async () => { throw new Error('Xendit must never be called for another brand'); } });
  t.after(() => checkout.close());
  const server = createApp(checkout);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/v1/storefront/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand_slug: 'other' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, 'Brand tidak dikenal.');
  assert.equal((await fetch(base + '/health', { headers: { Origin: 'http://localhost:9999' } })).status, 403);
  const health = (await (await fetch(base + '/health')).json()).data;
  assert.equal(health.brand, brandSlug); assert.equal(health.catalogs, 1);
  assert.equal(checkout.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
});
