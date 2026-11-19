import { createAfihubClient, AfihubError } from './afihub/client.mjs';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
export const sameSecret = (a, b) => Boolean(a && b) && timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export class Checkout {
  constructor({ dbPath, catalogs, merchants, apiKey, callbackToken = '', adminToken = '', afihubUrl, fetchImpl = fetch }) {
    this.db = new DatabaseSync(dbPath);
    this.catalogs = catalogs;
    this.merchants = merchants;
    this.apiKey = apiKey;
    this.callbackToken = callbackToken;
    this.adminToken = adminToken;
    this.afihubUrl = afihubUrl;
    this.fetch = fetchImpl;
    this.invoiceLocks = new Map();
    this.busy = false;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, brand TEXT NOT NULL, checkout_key TEXT NOT NULL, request_hash TEXT NOT NULL,
        token_hash TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(brand, checkout_key)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id),
        event TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '', UNIQUE(order_id, event)
      );
      CREATE TABLE IF NOT EXISTS checkout_limits (ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS checkout_limits_window_idx ON checkout_limits(window_start);
    `);
    // After operator fixes configuration and restarts, allow one retry for blocked requests.
    for (const file of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
      try { chmodSync(file, 0o600); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    this.db.prepare("UPDATE outbox SET next_attempt=0 WHERE delivered=0 AND last_error LIKE '%_requires_fix'").run();
  }

  get(id) {
    const row = this.db.prepare('SELECT data FROM orders WHERE id=?').get(id);
    return row ? JSON.parse(row.data) : null;
  }

  save(order) {
    this.db.prepare('UPDATE orders SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(order), Date.now(), order.id);
  }

  async config(slug) { return (await this.merchants())[slug] || {}; }

  consumeCheckoutQuota(ip) {
    const clientIp = typeof ip === 'string' && ip.trim() ? ip : 'unknown';
    const ipHash = createHmac('sha256', this.apiKey).update(clientIp).digest('hex');
    const windowStart = Math.floor(Date.now() / 60000);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM checkout_limits WHERE window_start < ?').run(windowStart - 1440);
      const current = this.db.prepare('SELECT window_start, attempts FROM checkout_limits WHERE ip_hash=?').get(ipHash);
      if (current && current.window_start === windowStart && current.attempts >= 30) fail('Terlalu banyak checkout. Coba lagi sebentar.', 429);
      if (current && current.window_start === windowStart) {
        this.db.prepare('UPDATE checkout_limits SET attempts=attempts+1 WHERE ip_hash=?').run(ipHash);
      } else {
        this.db.prepare('INSERT INTO checkout_limits(ip_hash,window_start,attempts) VALUES (?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET window_start=excluded.window_start,attempts=1').run(ipHash, windowStart);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async create(input, context = {}) {
    if (!this.apiKey || !this.apiKey.startsWith('xnd_development_')) fail('Checkout dummy membutuhkan Xendit secret key TEST di server (STOREFRONT_XENDIT_API_KEY).', 503);
    this.consumeCheckoutQuota(context.ip);
    const catalog = this.catalogs[input.brand_slug];
    if (!catalog) fail('Brand tidak dikenal.');
    const merchant = await this.config(catalog.slug);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(input.checkout_key || '')) fail('checkout_key wajib berupa ID unik per percobaan checkout.');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 30) fail('Keranjang tidak valid.');
    const seen = new Set();
    const jarProducts = catalog.products.filter(product => product.kind !== 'hampers');
    const items = input.items.map(item => {
      const product = catalog.products.find(product => product.id === item.product_id);
      if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) fail('Produk atau jumlah tidak valid.');
      let lineKey = product.id;
      let name = product.name;
      let jars;
      if (product.kind === 'hampers') {
        // Paket Hampers: harga paket dari katalog server, isi wajib tepat N toples dari katalog yang sama.
        const slots = catalog.hamperSlots || 3;
        if (!Array.isArray(item.jars) || item.jars.length !== slots || item.jars.some(id => typeof id !== 'string' || !jarProducts.some(jar => jar.id === id))) {
          fail(`Isi Paket Hampers harus tepat ${slots} toples dari katalog.`);
        }
        jars = [...item.jars].sort();
        lineKey = `${product.id}:${jars.join('+')}`;
        const counts = jars.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map());
        name = `${product.name} (${[...counts].map(([id, n]) => jarProducts.find(jar => jar.id === id).name + (n > 1 ? ` ×${n}` : '')).join(', ')})`;
      } else if (item.jars !== undefined) fail('Produk atau jumlah tidak valid.');
      if (seen.has(lineKey)) fail('Produk atau jumlah tidak valid.');
      seen.add(lineKey);
      return { product_id: product.id, name, quantity: item.quantity, unit_price: product.price, gross_amount: product.price * item.quantity,
        ...(jars ? { jars, line_key: lineKey } : {}) };
    });
    const customer = input.customer || {};
    for (const [field, max] of Object.entries({ name: 120, email: 254, phone: 30, address: 500 })) {
      if (typeof customer[field] !== 'string' || !customer[field].trim() || customer[field].length > max) fail(`Data ${field} tidak valid.`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) fail('Email tidak valid.');
    let returnUrl;
    try { returnUrl = new URL(input.return_url); } catch { fail('Alamat kembali tidak valid.'); }
    const storeOrigin = new URL(merchant.store_url || catalog.origin).origin;
    if (returnUrl.origin !== storeOrigin || returnUrl.pathname !== '/checkout/result' || returnUrl.username || returnUrl.password) fail('Alamat kembali harus milik website brand.');
    const sessionToken = input.session_token ?? '';
    if (typeof sessionToken !== 'string' || sessionToken.length > 256 || (sessionToken && !/^[a-zA-Z0-9_-]+$/.test(sessionToken))) fail('ID klik tidak valid.');
    const requestHash = sha(JSON.stringify({ items, customer, sessionToken, storeOrigin }));
    let order;
    const existing = this.db.prepare('SELECT * FROM orders WHERE brand=? AND checkout_key=?').get(catalog.slug, input.checkout_key);
    if (existing) {
      if (existing.request_hash !== requestHash) fail('checkout_key sudah digunakan untuk pesanan berbeda.', 409);
      if (!sameSecret(existing.token_hash, sha(input.order_token || ''))) fail('Token pesanan wajib untuk mengulang checkout.', 403);
      order = JSON.parse(existing.data);
    } else {
      const subtotal = items.reduce((sum, item) => sum + item.gross_amount, 0);
      const shipping = subtotal >= 300000 ? 0 : 15000;
      const token = input.order_token;
      if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{32,128}$/.test(token)) fail('Token pesanan tidak valid.');
      returnUrl.search = '';
      returnUrl.hash = '';
      order = { id: randomUUID(), brand_slug: catalog.slug, customer, items, afihub_click_id: sessionToken, session_token: sessionToken,
        merchant_id: merchant.merchant_id || '', customer_fingerprint: sha(customer.email.trim().toLowerCase()),
        customer_ip: context.ip || '', customer_user_agent: context.userAgent || '',
        subtotal, shipping, total: subtotal + shipping, currency: 'IDR', status: 'creating',
        invoice_id: '', invoice_url: '', return_url: returnUrl.href, created_at: new Date().toISOString() };
      returnUrl.searchParams.set('order_id', order.id);
      order.return_url = returnUrl.href;
      this.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?)').run(order.id, catalog.slug, input.checkout_key, requestHash, sha(token), JSON.stringify(order), Date.now());
    }
    if (!order.invoice_id) {
      await this.ensureInvoice(order);
    }
    return this.publicOrder(this.get(order.id));
  }

  async xendit(path, options = {}) {
    const response = await this.fetch(`https://api.xendit.co${path}`, {
      ...options, signal: AbortSignal.timeout(15000), redirect: 'error',
      headers: { Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) fail(`Layanan pembayaran belum berhasil (${response.status}). Coba checkout kembali.`, 502);
    return response.json();
  }

  async ensureInvoice(order) {
    if (!this.invoiceLocks.has(order.id)) {
      this.invoiceLocks.set(order.id, this.createInvoice(this.get(order.id)).finally(() => this.invoiceLocks.delete(order.id)));
    }
    return this.invoiceLocks.get(order.id);
  }

  async createInvoice(order) {
    if (order.invoice_id) return;
    try {
      // Reconcile before retrying after an interrupted/ambiguous create request.
      const invoices = await this.xendit(`/v2/invoices?external_id=${encodeURIComponent(order.id)}&limit=1`);
      const invoice = invoices.find(item => item.external_id === order.id) || await this.xendit('/v2/invoices', {
        method: 'POST', body: JSON.stringify({ external_id: order.id, amount: order.total, currency: 'IDR',
          description: `${order.brand_slug} — ${order.id}`, payer_email: order.customer.email, should_send_email: false,
          success_redirect_url: order.return_url, failure_redirect_url: order.return_url,
          items: order.items.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
          fees: order.shipping ? [{ type: 'Pengiriman', value: order.shipping }] : [],
        }),
      });
      if (!invoice.id || !invoice.invoice_url || invoice.external_id !== order.id || Number(invoice.amount) !== order.total || invoice.currency !== 'IDR') fail('Invoice tidak cocok dengan pesanan.', 502);
      const invoiceUrl = new URL(invoice.invoice_url);
      if (invoiceUrl.protocol !== 'https:' || !(invoiceUrl.hostname === 'xendit.co' || invoiceUrl.hostname.endsWith('.xendit.co'))) fail('Alamat invoice tidak valid.', 502);
      order.invoice_id = invoice.id;
      order.invoice_url = invoice.invoice_url;
      order.status = 'pending';
      this.save(order);
      this.applyInvoice(order, invoice);
    } catch (error) {
      order.status = 'invoice_error';
      this.save(order);
      throw error;
    }
  }

  publicOrder(order) {
    const sync = this.db.prepare('SELECT COUNT(*) AS pending FROM outbox WHERE order_id=? AND delivered=0').get(order.id);
    return { order_id: order.id, brand_slug: order.brand_slug, status: order.status, invoice_url: order.invoice_url,
      subtotal: order.subtotal, shipping: order.shipping, total: order.total, currency: order.currency,
      afihub_sync: sync.pending ? 'pending' : ['paid', 'fulfilled', 'completed', 'refunded', 'cancelled'].includes(order.status) ? 'sent' : 'waiting_payment' };
  }

  authorizeOrder(id, slug, token) {
    const row = this.db.prepare('SELECT * FROM orders WHERE id=? AND brand=?').get(id, slug);
    if (!row || !sameSecret(row.token_hash, sha(token || ''))) fail('Pesanan tidak ditemukan atau token tidak valid.', 404);
    return JSON.parse(row.data);
  }

  async status(id, slug, token) {
    const order = this.authorizeOrder(id, slug, token);
    const now = Date.now();
    if (order.invoice_id && ['pending', 'creating', 'invoice_error'].includes(order.status) &&
        now - Number(order.last_status_check_at || 0) >= 15000) {
      order.last_status_check_at = now;
      this.save(order);
      try { this.applyInvoice(order, await this.xendit(`/v2/invoices/${encodeURIComponent(order.invoice_id)}`)); }
      catch { /* Cached pending status remains honest when Xendit is unavailable. Worker retries. */ }
    }
    return this.publicOrder(this.get(id));
  }

  transition(order, status, event = '') {
    const current = this.get(order.id);
    if (current.status === status) return;
    // Expired/pending callbacks must never regress a paid/refunded order.
    if (['refunded', 'cancelled'].includes(current.status)) return;
    if (status === 'expired' && !['pending', 'creating', 'invoice_error'].includes(current.status)) return;
    if (status === 'paid' && ['paid', 'fulfilled', 'completed'].includes(current.status)) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      current.status = status;
      this.save(current);
      if (event) this.db.prepare('INSERT OR IGNORE INTO outbox(order_id,event,status) VALUES (?,?,?)').run(current.id, event, status);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  applyInvoice(order, invoice) {
    if (invoice.id !== order.invoice_id || invoice.external_id !== order.id || invoice.currency !== 'IDR' || Number(invoice.amount) !== order.total) fail('Data invoice tidak cocok.', 400);
    if (['PAID', 'SETTLED'].includes(invoice.status)) {
      if (Number(invoice.paid_amount) < order.total || !Number.isFinite(Number(invoice.paid_amount))) fail('Nominal pembayaran tidak cocok.');
      this.transition(order, 'paid', 'order.paid');
    } else if (invoice.status === 'EXPIRED') this.transition(order, 'expired');
  }

  callback(payload, token) {
    if (!sameSecret(this.callbackToken, token)) fail('Callback tidak terautentikasi.', 401);
    const order = this.get(payload.external_id);
    // The shared Xendit account may also send non-storefront callbacks. Never touch them.
    if (!order) return { ignored: true };
    this.applyInvoice(order, payload);
    return { accepted: true };
  }

  updateStatus(id, slug, status, token) {
    if (!sameSecret(this.adminToken, token)) fail('Akses server brand diperlukan.', 401);
    const order = this.get(id);
    if (!order || order.brand_slug !== slug) fail('Pesanan tidak ditemukan.', 404);
    const allowed = {
      fulfilled: ['paid', 'fulfilled'], completed: ['paid', 'fulfilled', 'completed'],
      refunded: ['paid', 'fulfilled', 'completed', 'refunded'], cancelled: ['paid', 'fulfilled', 'completed', 'cancelled'],
    };
    if (!allowed[status]) fail('Status tidak didukung.');
    if (!allowed[status].includes(order.status)) fail('Pesanan harus sudah dibayar dan status tidak boleh mundur.', 409);
    this.transition(order, status, `order.${status}`);
    return this.publicOrder(this.get(id));
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // Oldest checked orders first: a failing provider cannot starve newer orders forever.
      const rows = this.db.prepare("SELECT data FROM orders WHERE json_extract(data,'$.status') IN ('pending','creating','invoice_error') ORDER BY updated_at LIMIT 20").all();
      for (const row of rows) {
        const order = JSON.parse(row.data);
        try {
          if (!order.invoice_id) await this.ensureInvoice(order);
          else this.applyInvoice(order, await this.xendit(`/v2/invoices/${encodeURIComponent(order.invoice_id)}`));
        } catch { /* Keep the persistent order available for reconciliation. */ }
        this.db.prepare('UPDATE orders SET updated_at=? WHERE id=?').run(Date.now(), order.id);
      }
      const events = this.db.prepare(`SELECT * FROM outbox WHERE delivered=0 AND next_attempt<=?
        AND NOT EXISTS(SELECT 1 FROM outbox earlier WHERE earlier.order_id=outbox.order_id AND earlier.id<outbox.id AND earlier.delivered=0)
        ORDER BY id LIMIT 20`).all(Date.now());
      for (const event of events) await this.deliver(event);
    } finally { this.busy = false; }
  }

  async deliver(event) {
    try {
      const order = this.get(event.order_id);
      const config = await this.config(order.brand_slug);
      if (!config.merchant_id || !config.secret_key) throw new Error('merchant_not_configured');
      if (order.merchant_id && order.merchant_id !== config.merchant_id) throw new Error('merchant_mapping_changed');
      if (!order.merchant_id) { order.merchant_id = config.merchant_id; this.save(order); }
      const destination = new URL(this.afihubUrl);
      const allowHttp = destination.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(destination.hostname);
      if (destination.protocol !== 'https:' && !allowHttp) throw new Error('afihub_https_required');
      const client = createAfihubClient({ merchantId: config.merchant_id, secret: config.secret_key,
        url: destination.href, allowHttp, fetchImpl: (url, options) => this.fetch(url, { ...options, redirect: 'error' }) });
      await client.sendOrder({ order_id: order.id, session_token: order.afihub_click_id ?? order.session_token ?? '',
        amount: order.subtotal, currency: 'IDR', customer_fingerprint: order.customer_fingerprint,
        customer_ip: order.customer_ip, customer_user_agent: order.customer_user_agent,
        items: order.items.map((item, index) => ({ product_id: item.product_id, name: item.name, quantity: item.quantity,
          unit_price: item.unit_price, gross_amount: item.gross_amount, sku: item.sku || item.product_id,
          line_item_key: item.line_item_key || (order.afihub_click_id === undefined ? `${item.product_id}::${index}` : `${order.id}:${item.line_key || item.product_id}`) }))
      }, { status: event.status, paymentVerified: ['paid', 'fulfilled', 'completed', 'refunded', 'cancelled'].includes(order.status) });
      this.db.prepare("UPDATE outbox SET delivered=1,last_error='' WHERE id=?").run(event.id);
    } catch (error) {
      const attempts = event.attempts + 1;
      if (error instanceof AfihubError && !error.retryable) {
        this.db.prepare('UPDATE outbox SET attempts=?,next_attempt=?,last_error=? WHERE id=?').run(attempts, Number.MAX_SAFE_INTEGER, error.code + '_requires_fix', event.id);
        return;
      }
      const delay = Math.min(300000, 1000 * 2 ** Math.min(attempts, 8));
      // No customer payloads or credentials in retry logs.
      this.db.prepare('UPDATE outbox SET attempts=?,next_attempt=?,last_error=? WHERE id=?').run(attempts, Date.now() + delay, error.message === 'merchant_not_configured' ? error.message : 'delivery_failed', event.id);
    }
  }

  close() { this.db.close(); }
}
