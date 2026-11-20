import { brand } from './brand.js';
import { getAfihubClickId } from './lib/afihub-tracking.js';

const ATTEMPT_KEY = 'store-checkout:' + brand.slug;
export const readAttribution = getAfihubClickId;

export function checkoutAttempt(items, customer) {
  const session_token = readAttribution();
  const fingerprint = JSON.stringify({ items, customer, session_token });
  try {
    const saved = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
    if (saved?.fingerprint === fingerprint) return saved;
  } catch { /* Create a new checkout attempt. */ }
  const attempt = { fingerprint, session_token, checkout_key: crypto.randomUUID(), order_token: crypto.randomUUID() };
  try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt)); } catch { /* Return URL carries the order token. */ }
  return attempt;
}
