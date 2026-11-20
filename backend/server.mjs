import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Checkout } from './checkout.mjs';
import { loadEnvironment, loadAfihubConfig, loadCatalogs, loadMerchants, serviceRoot, brandSlug, defaultPort } from './config.mjs';

export function createApp(checkout) {
  return createServer(createHandler(checkout));
}

export function createHandler(checkout) {
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Gunakan Content-Type application/json.'), { status: 415 });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw Object.assign(new Error('Payload terlalu besar.'), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('JSON tidak valid.'), { status: 400 }); }
  }
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://checkout.local');
      const origin = req.headers.origin;
      if (origin) {
        const configs = await checkout.merchants();
        const allowed = Object.values(checkout.catalogs).some(catalog => origin === new URL(configs[catalog.slug]?.store_url || catalog.origin).origin);
        if (!allowed) return json(res, 403, { success: false, message: 'Origin toko tidak diizinkan.' });
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { success: true, data: { service: 'dummy-brand-checkout', status: 'ok', brand: brandSlug, catalogs: Object.keys(checkout.catalogs).length } });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/storefront/checkout') {
        return json(res, 200, { success: true, data: await checkout.create(await body(req), { ip: req.socket.remoteAddress, userAgent: (req.headers['user-agent'] || '').slice(0, 512) }) });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/webhooks/xendit/invoice') {
        return json(res, 200, { success: true, data: checkout.callback(await body(req), req.headers['x-callback-token']) });
      }
      const match = url.pathname.match(/^\/api\/v1\/storefront\/orders\/([a-zA-Z0-9-]+)(\/status)?$/);
      if (match && req.method === 'GET' && !match[2]) {
        const token = (req.headers.authorization || '').replace(/^Bearer /, '');
        return json(res, 200, { success: true, data: await checkout.status(match[1], url.searchParams.get('brand_slug'), token) });
      }
      if (match && req.method === 'POST' && match[2]) {
        const input = await body(req);
        const token = (req.headers.authorization || '').replace(/^Bearer /, '');
        return json(res, 200, { success: true, data: checkout.updateStatus(match[1], input.brand_slug, input.status, token) });
      }
      json(res, 404, { success: false, message: 'Endpoint tidak ditemukan.' });
    } catch (error) {
      json(res, error.status || 500, { success: false, message: error.status ? error.message : 'Layanan checkout sedang bermasalah.' });
    }
  };
}

export async function createCheckout(dbPath = resolve(serviceRoot, process.env.STOREFRONT_DB_PATH || 'data/orders.sqlite')) {
  loadEnvironment();
  const config = loadAfihubConfig();
  await mkdir(dirname(dbPath), { recursive: true });
  const checkout = new Checkout({ dbPath, catalogs: await loadCatalogs(), merchants: loadMerchants,
    apiKey: process.env.STOREFRONT_XENDIT_API_KEY,
    callbackToken: process.env.STOREFRONT_XENDIT_CALLBACK_TOKEN || '', adminToken: process.env.STOREFRONT_ADMIN_TOKEN || '',
    afihubUrl: config?.url || '' });
  if (checkout.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE brand<>?').get(brandSlug).n) {
    checkout.close();
    throw new Error('Database berisi pesanan brand lain. Gunakan database milik brand ini.');
  }
  return checkout;
}

export async function start() {
  const checkout = await createCheckout();
  const server = createApp(checkout);
  const port = Number(process.env.PORT || process.env.STOREFRONT_PORT || defaultPort);
  const interval = Number(process.env.STOREFRONT_SYNC_INTERVAL_SECONDS || 15);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(interval) || interval < 5) throw new Error('Port atau interval checkout tidak valid.');
  const host = process.env.STOREFRONT_HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Checkout hanya boleh listen di loopback.');
  const timer = setInterval(() => checkout.tick().catch(() => console.error('Worker checkout belum berhasil; pesanan tetap tersimpan.')), interval * 1000);
  server.listen(port, host, () => console.log(`Dummy brand checkout: http://localhost:${port}; ${Object.keys(checkout.catalogs).length} katalog.`));
  server.on('error', error => { clearInterval(timer); console.error(`Checkout tidak dapat listen: ${error.code}`); process.exitCode = 1; });
  return { checkout, server, timer };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await start();
