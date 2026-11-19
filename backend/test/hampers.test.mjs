import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Checkout } from '../checkout.mjs';
import { loadCatalogs, brandSlug, defaultStoreUrl } from '../config.mjs';

const merchant = { merchant_id: randomUUID(), secret_key: 'tocoks-secret' };

async function fixture(t) {
  const catalogs = await loadCatalogs();
  const invoices = new Map();
  const delivered = [];
  const fetchImpl = async (url, options) => {
    if (url.startsWith('https://api.xendit.co/')) {
      if (options.method === 'POST') {
        const request = JSON.parse(options.body);
        const invoice = { id: 'inv_' + request.external_id, external_id: request.external_id, invoice_url: 'https://checkout.xendit.co/test',
          amount: request.amount, currency: 'IDR', status: 'PENDING', items: request.items };
        invoices.set(invoice.id, invoice);
        return Response.json(invoice);
      }
      const path = new URL(url);
      if (path.search) return Response.json([...invoices.values()].filter(invoice => invoice.external_id === path.searchParams.get('external_id')));
      return Response.json(invoices.get(decodeURIComponent(path.pathname.split('/').at(-1))));
    }
    const expected = createHmac('sha256', merchant.secret_key).update(options.body).digest('hex');
    assert.equal(options.headers['X-AfiHub-Signature'], 'sha256=' + expected);
    delivered.push(JSON.parse(options.body));
    return Response.json({ success: true, data: { status: 'pending' } });
  };
  const checkout = new Checkout({ dbPath: ':memory:', catalogs, merchants: async () => ({ [brandSlug]: merchant }),
    apiKey: 'xnd_development_test', callbackToken: 'cb', afihubUrl: 'https://afihub.test/api/v1/webhooks/custom', fetchImpl });
  t.after(() => checkout.close());
  return { checkout, invoices, delivered };
}

const base = items => ({ brand_slug: brandSlug, items, checkout_key: randomUUID(), order_token: randomUUID(), session_token: 'click_tocoks',
  customer: { name: 'Pembeli', email: 'pembeli@example.test', phone: '0812', address: 'Jl. Kenanga 17, Bandung' },
  return_url: defaultStoreUrl + '/checkout/result' });

test('Paket Hampers memakai harga paket server dan nama berisi isi toples', async t => {
  const f = await fixture(t);
  const result = await f.checkout.create(base([{ product_id: 'paket-hampers', quantity: 1, jars: ['sago-matcha', 'nastar-klasik', 'nastar-klasik'], unit_price: 1 }]));
  assert.equal(result.subtotal, 290000);
  assert.equal(result.shipping, 15000);
  assert.equal(result.total, 305000);
  const order = f.checkout.get(result.order_id);
  assert.equal(order.items[0].name, 'Paket Hampers (Nastar Klasik ×2, Sago Matcha)');
  assert.deepEqual(order.items[0].jars, ['nastar-klasik', 'nastar-klasik', 'sago-matcha']);
});

test('isi hampers wajib tepat 3 toples dari katalog', async t => {
  const f = await fixture(t);
  for (const jars of [undefined, ['nastar-klasik'], ['nastar-klasik', 'sago-matcha', 'paket-hampers'], ['nastar-klasik', 'sago-matcha', 'kastengel'],
    ['nastar-klasik', 'nastar-klasik', 'nastar-klasik', 'nastar-klasik']]) {
    await assert.rejects(f.checkout.create(base([{ product_id: 'paket-hampers', quantity: 1, jars }])), /Paket Hampers/);
  }
  await assert.rejects(f.checkout.create(base([{ product_id: 'nastar-klasik', quantity: 1, jars: ['x'] }])), /tidak valid/);
});

test('hampers berbeda boleh digabung dengan toples satuan; komisi tanpa ongkir dan line key unik', async t => {
  const f = await fixture(t);
  const result = await f.checkout.create(base([
    { product_id: 'paket-hampers', quantity: 1, jars: ['nastar-klasik', 'choco-coconut-cheese', 'palm-sugar-cheese'] },
    { product_id: 'paket-hampers', quantity: 2, jars: ['sago-matcha', 'sago-matcha', 'sago-matcha'] },
    { product_id: 'nastar-klasik', quantity: 2 },
  ]));
  assert.equal(result.subtotal, 290000 * 3 + 90000 * 2);
  assert.equal(result.shipping, 0);
  await assert.rejects(f.checkout.create(base([
    { product_id: 'paket-hampers', quantity: 1, jars: ['sago-matcha', 'nastar-klasik', 'sago-matcha'] },
    { product_id: 'paket-hampers', quantity: 1, jars: ['nastar-klasik', 'sago-matcha', 'sago-matcha'] },
  ])), /tidak valid/);
  const order = f.checkout.get(result.order_id);
  const invoice = f.invoices.get(order.invoice_id);
  Object.assign(invoice, { status: 'PAID', paid_amount: invoice.amount });
  f.checkout.callback(invoice, 'cb');
  await f.checkout.tick();
  const sent = f.delivered[0];
  assert.equal(sent.amount, result.subtotal);
  assert.equal(new Set(sent.items.map(item => item.line_item_key)).size, 3);
  assert.ok(sent.items.every(item => !('jars' in item) && !('line_key' in item)));
  assert.equal(sent.items[0].sku, 'paket-hampers');
});
