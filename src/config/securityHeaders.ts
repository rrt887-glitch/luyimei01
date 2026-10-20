/**
 * HTTP security response headers shared across:
 *   - Vite dev / preview server (`vite.config.ts` -> AI Studio preview environment)
 *   - Production static server (`server.js` -> AI Studio / Cloud Run deployment)
 *   - Firebase Hosting (`firebase.json`)
 *
 * `tests/config.consistency.test.ts` verifies that all three stay in sync.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy':
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://localhost.corp.google.com:26001",
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; script-src 'self' https://www.google.com https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app https://firebasestorage.googleapis.com https://www.google.com wss://*.firebaseio.com; frame-src https://www.google.com https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};
