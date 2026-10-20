#!/usr/bin/env node
/**
 * One-time legacy data cleanup (Firebase Admin SDK).
 *
 * Early versions of this app stored password hashes / salts / session tokens inside `staff`
 * documents and created a placeholder `staff/staff-super-admin` record that is not tied to any
 * Firebase Auth user. Those documents are still readable by active staff, so they must be cleaned.
 *
 * What it does (DRY RUN by default, nothing is written unless you pass --apply):
 *   1. Removes legacy credential fields (password, passwordHash, salt, sessionToken, lastLogin)
 *      from every `staff/{uid}` document.
 *   2. Reports staff documents whose ID has no matching Firebase Auth user (orphans, e.g.
 *      `staff-super-admin`) and deletes them with --apply.
 *   3. Disables the Auth account of every suspended staff member and syncs Custom Claims with the
 *      staff document (claims are only a client hint, but keeping them consistent avoids confusion).
 *   4. Back-fills `assignedStaffId: ''` (= public pool) on inquiries that lack the field. The field is
 *      REQUIRED by firestore.rules; without it such leads can no longer be updated and are invisible
 *      to sales reps. RUN THIS BEFORE (or right after) DEPLOYING THE NEW RULES.
 *   5. Links legacy inquiries (no `customerId`) to a customer archive using the same key as the
 *      `onInquiryCreated` Cloud Function (buyer uid > phone digits > email), creating missing
 *      customers and adding to `inquiryCount`. Idempotent: linked inquiries are skipped next time.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   npm run cleanup:legacy            # dry run, prints what would change
 *   npm run cleanup:legacy -- --apply # actually apply the changes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appletConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../firebase-applet-config.json'), 'utf8')
);

const APPLY = process.argv.includes('--apply');
const LEGACY_FIELDS = ['password', 'passwordHash', 'salt', 'sessionToken', 'lastLogin'];

// Keep identical to customerIdForInquiry() in functions/src/index.ts
function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 13 && digits.startsWith('86') ? digits.slice(2) : digits;
}
function customerIdForInquiry(data) {
  const buyerUid = String(data.buyerUid || '').trim();
  if (buyerUid) return `CUST-${buyerUid}`;
  const contact = String(data.phone || '').trim();
  if (contact.includes('@')) {
    const key = Array.from(contact.toLowerCase())
      .map(ch => (/[a-z0-9]/.test(ch) ? ch : `-${ch.codePointAt(0).toString(16)}`))
      .join('')
      .slice(0, 400);
    return key ? `CUST-MAIL-${key}` : null;
  }
  const digits = normalizePhoneDigits(contact);
  return digits.length >= 6 ? `CUST-TEL-${digits}` : null;
}

async function main() {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const app = initializeApp({ credential: applicationDefault(), projectId: appletConfig.projectId });
  const auth = getAuth(app);
  const db = getFirestore(app, appletConfig.firestoreDatabaseId);

  console.log(`Project: ${appletConfig.projectId} | Database: ${appletConfig.firestoreDatabaseId}`);
  console.log(APPLY ? 'MODE: APPLY (changes will be written)\n' : 'MODE: DRY RUN (no changes, pass --apply to write)\n');

  const staffSnap = await db.collection('staff').get();
  let stripped = 0;
  let orphans = 0;
  let synced = 0;

  for (const docSnap of staffSnap.docs) {
    const data = docSnap.data();
    const uid = docSnap.id;

    // 1. Legacy credential fields
    const legacyKeys = LEGACY_FIELDS.filter(k => k in data);
    if (legacyKeys.length > 0) {
      stripped++;
      console.log(`[strip]  staff/${uid}: remove ${legacyKeys.join(', ')}`);
      if (APPLY) {
        await docSnap.ref.update(Object.fromEntries(legacyKeys.map(k => [k, FieldValue.delete()])));
      }
    }

    // 2. Orphan documents (no Auth user with this uid)
    let authUser = null;
    try {
      authUser = await auth.getUser(uid);
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }
    if (!authUser) {
      orphans++;
      console.log(`[orphan] staff/${uid} (${data.name || '-'}, ${data.role || '-'}) has no Auth user -> delete`);
      if (APPLY) await docSnap.ref.delete();
      continue;
    }

    // 3. Keep Auth state consistent with the staff document
    const role = data.role === 'super_admin' ? 'super_admin' : 'sales_rep';
    const active = data.status !== 'suspended';
    const claims = authUser.customClaims || {};
    const needsSync =
      authUser.disabled === active ||
      (active ? claims.role !== role || claims.staff !== true : claims.role != null);
    if (needsSync) {
      synced++;
      console.log(`[sync]   ${uid}: status=${active ? 'active' : 'suspended'} role=${role}`);
      if (APPLY) {
        await auth.setCustomUserClaims(uid, active ? { role, staff: true } : null);
        await auth.updateUser(uid, { disabled: !active });
        await auth.revokeRefreshTokens(uid);
      }
    }
  }

  // 4. Inquiries without the pool marker
  const inquiriesSnap = await db.collection('inquiries').get();
  const missingOwner = inquiriesSnap.docs.filter(d => typeof d.get('assignedStaffId') !== 'string');
  console.log(`\n[pool]   ${missingOwner.length} / ${inquiriesSnap.size} inquiries lack assignedStaffId -> set ''`);
  if (APPLY) {
    for (let i = 0; i < missingOwner.length; i += 400) {
      const batch = db.batch();
      missingOwner.slice(i, i + 400).forEach(d => batch.update(d.ref, { assignedStaffId: '' }));
      await batch.commit();
    }
  }

  // 5. Link legacy inquiries to customers
  const unlinked = inquiriesSnap.docs.filter(d => !d.get('customerId') && customerIdForInquiry(d.data()));
  const groups = new Map();
  for (const d of unlinked) {
    const key = customerIdForInquiry(d.data());
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  console.log(`[link]   ${unlinked.length} legacy inquiries -> ${groups.size} customers`);
  if (APPLY) {
    const today = new Date().toISOString().slice(0, 10);
    for (const [customerId, docs] of groups) {
      const custRef = db.collection('customers').doc(customerId);
      const first = docs[0].data();
      const contact = String(first.phone || '').trim();
      const isEmail = contact.includes('@');
      const custSnap = await custRef.get();
      if (custSnap.exists) {
        await custRef.update({ inquiryCount: FieldValue.increment(docs.length) });
      } else {
        await custRef.set({
          id: customerId,
          name: String(first.customerName || first.name || '匿名工程客户').slice(0, 120),
          company: String(first.company || '').slice(0, 200),
          email: isEmail ? contact.slice(0, 150) : String(first.buyerEmail || '').slice(0, 150),
          phone: isEmail ? '' : contact.slice(0, 50),
          country: String(first.location || '').slice(0, 100),
          status: 'active',
          source: '历史询价迁移建档',
          inquiryCount: docs.length,
          totalQuotationUsd: 0,
          registeredAt: today,
          lastActiveAt: today
        });
      }
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { customerId }));
        await batch.commit();
      }
    }
  }

  console.log(
    `\nDone. staff docs: ${staffSnap.size} | credential fields stripped: ${stripped} | orphans: ${orphans} | auth synced: ${synced} | inquiries back-filled: ${missingOwner.length} | inquiries linked: ${unlinked.length}`
  );
  if (!APPLY && (stripped || orphans || synced || missingOwner.length || unlinked.length)) {
    console.log('Re-run with --apply to write these changes.');
  }
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
