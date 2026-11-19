import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Checkout } from '../checkout.mjs';
import { createApp } from '../server.mjs';
import { loadCatalogs, brandSlug } from '../config.mjs';

const catalogs = {
  'nara-atelier': { slug: 'nara-atelier', origin: 'http://localhost:3010', products: [{ id: 'hijab', name: 'Hijab', price: 249000 }] },
  'pendar-beauty': { slug: 'pendar-beauty', origin: 'http://localhost:3011', products: [{ id: 'serum', name: 'Serum', price: 129000 }] },
};
const configs = {
  'nara-atelier': { merchant_id: randomUUID(), secret_key: 'nara-secret' },
  'pendar-beauty': { merchant_id: randomUUID(), secret_key: 'pendar-secret' },
};
function input(slug = 'nara-atelier') {
  return { brand_slug: slug, items: [{ product_id: slug === 'nara-atelier' ? 'hijab' : 'serum', quantity: 1 }],
    customer: { name: 'Test Buyer', email: 'test@example.test', phone: '08123456789', address: 'Test address' },
    checkout_key: randomUUID(), order_token: randomUUID(), session_token: 'click_nara', return_url: catalogs[slug].origin + '/checkout/result' };
}
function fixture(t, opts = {}) {
  const invoices = new Map();
  const delivered = [];
  let creates = 0;
  let unavailable = false;
  let configured = configs;
  let afihubStatus = opts.afihubStatus || 0;
  const fetchImpl = async (url, options) => {
    if (url.startsWith('https://api.xendit.co/')) {
      assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('xnd_development_test:').toString('base64'));
      if (options.method === 'POST') {
        creates++;
        const request = JSON.parse(options.body);
        assert.equal(request.should_send_email, false);
        const invoice = { id: 'invoice_' + request.external_id, external_id: request.external_id, invoice_url: 'https://checkout.xendit.co/test', amount: request.amount, currency: 'IDR', status: 'PENDING' };
        invoices.set(invoice.id, invoice);
        return Response.json(invoice);
      }
      const path = new URL(url);
      if (path.search) return Response.json([...invoices.values()].filter(invoice => invoice.external_id === path.searchParams.get('external_id')));
      return Response.json(invoices.get(decodeURIComponent(path.pathname.split('/').at(-1))));
    }
    assert.equal(url, 'https://afihub.test/api/v1/webhooks/custom');
    if (unavailable || afihubStatus) return Response.json({}, { status: afihubStatus || 503 });
    const payload = JSON.parse(options.body);
    const config = Object.values(configured).find(config => config.merchant_id === payload.merchant_id);
    const expected = createHmac('sha256', config.secret_key).update(options.body).digest('hex');
    assert.equal(options.headers['X-AfiHub-Signature'], 'sha256=' + expected);
    assert.equal(options.headers['X-AfiHub-Timestamp'], payload.timestamp);
    delivered.push(payload);
    return Response.json({ success: true, data: { status: payload.status === 'refunded' ? 'rejected' : payload.session_token ? 'pending' : 'organic', conversion_id: 'conversion_test' } });
  };
  const checkout = new Checkout({ dbPath: opts.dbPath || ':memory:', catalogs, merchants: async () => configured,
    apiKey: 'xnd_development_test', callbackToken: 'callback-secret', adminToken: 'admin-secret',
    afihubUrl: 'https://afihub.test/api/v1/webhooks/custom', fetchImpl });
  if (!opts.manualClose) t.after(() => checkout.close());
  return { checkout, invoices, delivered, get creates() { return creates; },
    set unavailable(value) { unavailable = value; }, set afihubStatus(value) { afihubStatus = value; }, set configured(value) { configured = value; }, fetchImpl };
}
function paid(f, id) {
  const order = f.checkout.get(id);
  const invoice = f.invoices.get(order.invoice_id);
  Object.assign(invoice, { status: 'PAID', paid_amount: invoice.amount });
  return invoice;
}

test('server calculates catalog price, shipping and excludes shipping from signed commission amount', async t => {
  const f = fixture(t); const request = input(); request.items[0].unit_price = 1; request.amount = 1;
  const result = await f.checkout.create(request);
  assert.equal(result.total, 264000); assert.equal(f.delivered.length, 0);
  f.checkout.callback(paid(f, result.order_id), 'callback-secret');
  await f.checkout.tick();
  assert.equal(f.delivered[0].amount, 249000);
  assert.equal(f.delivered[0].items[0].unit_price, 249000);
  assert.equal(f.delivered[0].session_token, 'click_nara');
  assert.equal(f.delivered[0].merchant_id, configs['nara-atelier'].merchant_id);
});

test('simultaneous checkout retries and reconciliation create only one invoice', async t => {
  const f = fixture(t); const request = input();
  const results = await Promise.all([f.checkout.create(request), f.checkout.create(request), f.checkout.tick()]);
  assert.equal(results[0].order_id, results[1].order_id);
  assert.equal(f.creates, 1);
  await assert.rejects(f.checkout.create({ ...request, customer: { ...request.customer, name: 'Changed' } }), /different|berbeda/);
  await assert.rejects(f.checkout.create({ ...request, order_token: randomUUID() }), /Token/);
});

test('forged redirect does not pay an order; only authenticated provider status does', async t => {
  const f = fixture(t); const request = input(); const result = await f.checkout.create(request);
  assert.equal((await f.checkout.status(result.order_id, request.brand_slug, request.order_token)).status, 'pending');
  paid(f, result.order_id);
  // Status check is throttled per 15 s; simulate the next check window.
  const stored = f.checkout.get(result.order_id); stored.last_status_check_at = 0; f.checkout.save(stored);
  assert.equal((await f.checkout.status(result.order_id, request.brand_slug, request.order_token)).status, 'paid');
  await f.checkout.tick(); assert.equal(f.delivered.length, 1);
});

test('callbacks require correct token, invoice identity, currency and paid amount', async t => {
  const f = fixture(t); const result = await f.checkout.create(input()); const invoice = paid(f, result.order_id);
  for (const [payload, token] of [[invoice, 'wrong'], [{ ...invoice, id: 'wrong' }, 'callback-secret'],
    [{ ...invoice, amount: 1 }, 'callback-secret'], [{ ...invoice, currency: 'USD' }, 'callback-secret'],
    [{ ...invoice, paid_amount: 1 }, 'callback-secret']]) assert.throws(() => f.checkout.callback(payload, token));
  assert.equal(f.checkout.get(result.order_id).status, 'pending');
  assert.equal(f.checkout.db.prepare('SELECT count(*) AS n FROM outbox').get().n, 0);
});

test('duplicate and out-of-order callbacks never duplicate commission events or regress payment', async t => {
  const f = fixture(t); const result = await f.checkout.create(input()); const invoice = paid(f, result.order_id);
  f.checkout.callback(invoice, 'callback-secret'); f.checkout.callback(invoice, 'callback-secret');
  f.checkout.callback({ ...invoice, status: 'EXPIRED' }, 'callback-secret');
  await f.checkout.tick(); await f.checkout.tick();
  assert.equal(f.checkout.get(result.order_id).status, 'paid'); assert.equal(f.delivered.length, 1);
});

test('orders and tokens are isolated between brands', async t => {
  const f = fixture(t); const a = input(); const b = input('pendar-beauty');
  const orderA = await f.checkout.create(a); const orderB = await f.checkout.create(b);
  await assert.rejects(f.checkout.status(orderA.order_id, b.brand_slug, a.order_token), /tidak ditemukan/);
  await assert.rejects(f.checkout.status(orderA.order_id, a.brand_slug, b.order_token), /tidak ditemukan/);
  f.checkout.callback(paid(f, orderB.order_id), 'callback-secret'); await f.checkout.tick();
  assert.equal(f.delivered[0].merchant_id, configs[b.brand_slug].merchant_id);
  assert.equal(JSON.stringify(orderA).includes(a.customer.email), false);
});

test('unknown products, quantities, duplicate items and foreign redirect are rejected', async t => {
  const f = fixture(t);
  for (const change of [ { items: [{ product_id: 'unknown', quantity: 1 }] }, { items: [{ product_id: 'hijab', quantity: 0 }] },
    { items: [{ product_id: 'hijab', quantity: 1.5 }] }, { items: [{ product_id: 'hijab', quantity: 1 }, { product_id: 'hijab', quantity: 2 }] },
    { return_url: 'https://evil.test/checkout/result' }, { session_token: '<script>' } ]) await assert.rejects(f.checkout.create({ ...input(), ...change }));
  assert.equal(f.creates, 0);
});

test('live payment keys are rejected by dummy checkout', async t => {
  const f = fixture(t); f.checkout.apiKey = 'xnd_production_forbidden';
  await assert.rejects(f.checkout.create(input()), /TEST/);
  assert.equal(f.creates, 0);
});

test('Afihub outage keeps events durable and retries without creating a new order', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'afihub-checkout-test-'));
  const f = fixture(t, { dbPath: join(directory, 'orders.sqlite') });
  const request = input(); const result = await f.checkout.create(request);
  f.checkout.callback(paid(f, result.order_id), 'callback-secret'); f.unavailable = true;
  await f.checkout.tick(); assert.equal(f.checkout.publicOrder(f.checkout.get(result.order_id)).afihub_sync, 'pending');
  const restored = new Checkout({ dbPath: join(directory, 'orders.sqlite'), catalogs, merchants: async () => configs,
    apiKey: 'xnd_development_test', afihubUrl: 'https://afihub.test/api/v1/webhooks/custom', fetchImpl: f.fetchImpl });
  t.after(() => restored.close());
  assert.equal(restored.authorizeOrder(result.order_id, request.brand_slug, request.order_token).status, 'paid');
  f.unavailable = false; restored.db.prepare('UPDATE outbox SET next_attempt=0').run(); await restored.tick();
  assert.equal(f.delivered.length, 1); assert.equal(f.creates, 1);
  t.after(() => rm(directory, { recursive: true, force: true }));
});

test('unconfigured merchant stays queued until credentials become available', async t => {
  const f = fixture(t); f.configured = {}; const result = await f.checkout.create(input());
  f.checkout.callback(paid(f, result.order_id), 'callback-secret'); await f.checkout.tick();
  assert.equal(f.checkout.db.prepare('SELECT last_error FROM outbox').get().last_error, 'merchant_not_configured');
  f.configured = configs; f.checkout.db.prepare('UPDATE outbox SET next_attempt=0').run(); await f.checkout.tick();
  assert.equal(f.delivered.length, 1);
});

test('completion and refund are server-only, preserve paid-before-refund ordering, and are idempotent', async t => {
  const f = fixture(t); const result = await f.checkout.create(input());
  assert.throws(() => f.checkout.updateStatus(result.order_id, 'nara-atelier', 'completed', 'admin-secret'), /dibayar/);
  f.checkout.callback(paid(f, result.order_id), 'callback-secret');
  assert.throws(() => f.checkout.updateStatus(result.order_id, 'nara-atelier', 'refunded', ''), /Akses/);
  f.checkout.updateStatus(result.order_id, 'nara-atelier', 'fulfilled', 'admin-secret');
  f.checkout.callback(paid(f, result.order_id), 'callback-secret');
  assert.equal(f.checkout.get(result.order_id).status, 'fulfilled');
  f.checkout.updateStatus(result.order_id, 'nara-atelier', 'completed', 'admin-secret');
  assert.throws(() => f.checkout.updateStatus(result.order_id, 'nara-atelier', 'fulfilled', 'admin-secret'), /mundur/);
  f.checkout.updateStatus(result.order_id, 'nara-atelier', 'refunded', 'admin-secret');
  f.checkout.updateStatus(result.order_id, 'nara-atelier', 'refunded', 'admin-secret');
  await f.checkout.tick(); await f.checkout.tick(); await f.checkout.tick(); await f.checkout.tick(); await f.checkout.tick();
  assert.deepEqual(f.delivered.map(event => event.event), ['order.paid', 'order.fulfilled', 'order.completed', 'order.refunded']);
  f.checkout.callback(paid(f, result.order_id), 'callback-secret');
  assert.equal(f.checkout.get(result.order_id).status, 'refunded');
});

test('HTTP checkout and private status work; wrong origins and unauthenticated reads fail', async t => {
  const f = fixture(t); const server = createApp(f.checkout);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = input();
  const response = await fetch(base + '/api/v1/storefront/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3010' }, body: JSON.stringify(request) });
  assert.equal(response.status, 200); const { data } = await response.json();
  assert.equal(data.total, 264000);
  const path = '/api/v1/storefront/orders/' + data.order_id + '?brand_slug=nara-atelier';
  assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + path, { headers: { Authorization: 'Bearer ' + request.order_token } })).status, 200);
  assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://evil.test' } })).status, 403);
  const noAuth = await fetch(base + '/api/v1/webhooks/xendit/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paid(f, data.order_id)) });
  assert.equal(noAuth.status, 401);
});

test('only this brand catalog loads with unique product IDs and server prices', async () => {
  const actual = await loadCatalogs(); assert.deepEqual(Object.keys(actual), [brandSlug]);
  for (const catalog of Object.values(actual)) {
    assert.ok(catalog.products.length > 0);
    assert.equal(new Set(catalog.products.map(product => product.id)).size, catalog.products.length);
    for (const product of catalog.products) assert.ok(Number.isSafeInteger(product.price) && product.price > 0);
  }
});

test('SDK persists click ID before invoice and keeps historical item identity on replay', async t => {
  const f = fixture(t); const request = input(); const result = await f.checkout.create(request);
  assert.equal(f.checkout.get(result.order_id).afihub_click_id, request.session_token);
  const old = f.checkout.get(result.order_id); delete old.afihub_click_id; f.checkout.save(old);
  paid(f, result.order_id); await f.checkout.tick();
  assert.equal(f.delivered[0].session_token, request.session_token);
  assert.equal(f.delivered[0].items[0].line_item_key, 'hijab::0');
});
test('SDK nonretryable 401 is blocked until configuration fix and worker reopen', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tocoks-sdk-blocked-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'orders.sqlite');
  const f = fixture(t, { dbPath: path, afihubStatus: 401, manualClose: true });
  const result = await f.checkout.create(input()); paid(f, result.order_id); await f.checkout.tick();
  assert.equal(f.checkout.db.prepare('SELECT last_error FROM outbox').get().last_error, 'http_401_requires_fix');
  f.afihubStatus = 0; await f.checkout.tick(); assert.equal(f.delivered.length, 0);
  const retry = new Checkout({ dbPath: path, catalogs, merchants: async()=>configs, apiKey:'xnd_development_test', afihubUrl:'https://afihub.test/api/v1/webhooks/custom', fetchImpl:f.fetchImpl });
  try { await retry.tick(); assert.equal(f.delivered.length, 1); assert.equal(retry.db.prepare('SELECT delivered FROM outbox').get().delivered,1); }
  finally { retry.close(); f.checkout.close(); }
});
