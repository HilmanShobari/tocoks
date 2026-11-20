import { createCheckout, createHandler } from './server.mjs';

let handlerPromise;

async function getHandler() {
  if (!handlerPromise) {
    const dbPath = process.env.STOREFRONT_DB_PATH || '/tmp/tocoks-orders.sqlite';
    handlerPromise = createCheckout(dbPath).then(createHandler).catch(error => {
      handlerPromise = undefined;
      throw error;
    });
  }
  return handlerPromise;
}

export default async function handler(req, res) {
  try {
    return await (await getHandler())(req, res);
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ success: false, message: 'Layanan checkout belum dikonfigurasi.' }));
  }
}
