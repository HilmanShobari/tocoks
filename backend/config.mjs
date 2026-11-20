import { configFromEnv } from '@afihub/node';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand } from '../src/brand.js';

export const serviceRoot = dirname(fileURLToPath(import.meta.url));
export const brandRoot = resolve(serviceRoot, '..');
export const brandSlug = 'tocoks';
export const defaultPort = 8120;
export const defaultStoreUrl = 'http://localhost:3021';

export function storeUrlFromEnv(env = process.env) {
  const deploymentUrl = env.VERCEL_ENV === 'production'
    ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
    : env.VERCEL_URL || env.VERCEL_PROJECT_PRODUCTION_URL;
  const hostname = env.STOREFRONT_STORE_URL || deploymentUrl;
  if (!hostname) return defaultStoreUrl;
  const value = env.STOREFRONT_STORE_URL || `https://${hostname}`;
  const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('STOREFRONT_STORE_URL harus berupa origin website.');
  return origin.origin;
}

export function loadEnvironment() {
  // This brand owns its environment; no Afihub or sibling brand .env is read.
  try { process.loadEnvFile(resolve(serviceRoot, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function loadCatalogs() {
  if (brand.slug !== brandSlug) throw new Error('Katalog tidak sesuai dengan identitas backend brand.');
  return { [brandSlug]: { ...brand, origin: storeUrlFromEnv() } };
}

export function loadAfihubConfig(env = process.env) { return configFromEnv(env); }

export async function loadMerchants() {
  const config = loadAfihubConfig();
  if (!config) return {};
  const origin = new URL(storeUrlFromEnv());
  return { [brandSlug]: { merchant_id: config.merchantId, secret_key: config.secret, store_url: origin.origin } };
}
