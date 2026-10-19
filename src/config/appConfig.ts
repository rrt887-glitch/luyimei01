/**
 * Application-wide constants shared by the frontend.
 *
 * Values that must also appear in non-TS files (firestore.rules, storage.rules, firebase.json,
 * functions/src/index.ts) are checked for consistency by tests/config.consistency.test.ts.
 */
import firebaseConfig from '../../firebase-applet-config.json';

/** Named Firestore database used by the whole app (never the `(default)` database). */
export const FIRESTORE_DATABASE_ID: string = firebaseConfig.firestoreDatabaseId;

/**
 * Region of the Cloud Functions (callables + Firestore triggers).
 * Firestore triggers must run in the region that matches the database location
 * (multi-region nam5 -> us-central1, eur3 -> europe-west1, single region -> the same region).
 * Must match FUNCTIONS_REGION in functions/src/index.ts (checked by tests/config.consistency.test.ts).
 */
export const FUNCTIONS_REGION = 'us-central1';

/** Synthetic email domain that maps a staff mobile number to a Firebase Auth identity. */
export const STAFF_AUTH_EMAIL_DOMAIN = 'auth.luyimei.com';

/** Email domains reserved for staff identities; buyers may never register with them. */
export const RESERVED_STAFF_EMAIL_DOMAINS = [STAFF_AUTH_EMAIL_DOMAIN, 'staff.luyimei.internal'] as const;

export function isReservedStaffEmail(email: string | null | undefined): boolean {
  const lower = (email || '').trim().toLowerCase();
  return RESERVED_STAFF_EMAIL_DOMAINS.some(domain => lower.endsWith(`@${domain}`));
}

/** Timeouts (ms). Cloud Functions can cold-start, so callable timeouts are generous. */
export const TIMEOUTS = {
  firestoreOperation: 8000,
  adminCallable: 30000
} as const;

/**
 * Upper bounds for real-time listeners. Every listener is ordered newest-first and capped,
 * so read costs no longer grow with the total history size.
 */
export const LISTENER_LIMITS = {
  leads: 3000,
  customers: 3000,
  auditLogs: 200,
  quotations: 200
} as const;
