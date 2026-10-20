#!/usr/bin/env node
/**
 * One-time repair after v15.6 (Firebase Admin SDK). DRY RUN by default; pass --apply to write.
 *
 *   1. Split merged email customers. Before v15.6 the customer key for an email turned every symbol
 *      into "_", so e.g. qa.test@x.com and qa_test@x.com shared one customer archive. For every
 *      CUST-MAIL-* customer, inquiries whose email is not the customer's own email are moved to the
 *      customer of their own address (created if missing, same key as onInquiryCreated), together
 *      with their inquiry count and the quotation totals credited through them.
 *   2. Credit missed quotations. Before v15.6 a quotation processed while its lead had no customer
 *      yet, or after the lead was handed to a colleague, was marked processed without being added
 *      to the customer's total. Such quotations are credited now and their marker updated.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   npm run repair:customers            # dry run: prints what would change
 *   npm run repair:customers -- --apply # writes the changes
 * Safe to run again: repaired data is left alone the next time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appletConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firebase-applet-config.json'), 'utf8'));
const APPLY = process.argv.includes('--apply');

// Keep identical to emailKey() in functions/src/index.ts
const emailKey = email =>
  Array.from(email.toLowerCase())
    .map(ch => (/[a-z0-9]/.test(ch) ? ch : `-${ch.codePointAt(0).toString(16)}`))
    .join('')
    .slice(0, 400);
const toCents = v => (Math.sign(v) * Math.round(Number((Math.abs(v) * 100).toPrecision(12)))) / 100;
const lower = s => String(s || '').trim().toLowerCase();

async function main() {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const app = initializeApp({ credential: applicationDefault(), projectId: appletConfig.projectId });
  const db = getFirestore(app, appletConfig.firestoreDatabaseId);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Project: ${appletConfig.projectId} | Database: ${appletConfig.firestoreDatabaseId}`);
  console.log(APPLY ? 'MODE: APPLY (changes will be written)\n' : 'MODE: DRY RUN (pass --apply to write)\n');

  const [customersSnap, inquiriesSnap, quotationsSnap, markersSnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('inquiries').get(),
    db.collection('quotations').get(),
    db.collection('_processed_events').get()
  ]);
  const customers = new Map(customersSnap.docs.map(d => [d.id, d.data()]));
  const markers = new Map(markersSnap.docs.map(d => [d.id, d.data()]));
  const quotationsByLead = new Map();
  for (const q of quotationsSnap.docs) {
    const leadId = String(q.get('leadId') || '');
    if (!leadId) continue;
    if (!quotationsByLead.has(leadId)) quotationsByLead.set(leadId, []);
    quotationsByLead.get(leadId).push(q);
  }

  // ---------------------------------------------------------------- 1. split merged customers
  let moved = 0;
  for (const inq of inquiriesSnap.docs) {
    const custId = String(inq.get('customerId') || '');
    const contact = lower(inq.get('phone'));
    if (!custId.startsWith('CUST-MAIL-') || !contact.includes('@') || inq.get('buyerUid')) continue;
    const owner = customers.get(custId);
    if (!owner || lower(owner.email) === contact) continue;

    const targetId = `CUST-MAIL-${emailKey(contact)}`;
    if (targetId === custId) continue;
    // Quotation totals that reached the wrong customer through this inquiry.
    const credited = (quotationsByLead.get(inq.id) || [])
      .map(q => ({ q, m: markers.get(`quotation_${q.id}`) }))
      .filter(({ m }) => m && m.customerId === custId);
    const amount = toCents(credited.reduce((s, { q }) => s + (Number(q.get('totalAmountUsd')) || 0), 0));

    console.log(`[split] ${inq.id} <${contact}>: ${custId} -> ${targetId}${amount ? ` (moves $${amount})` : ''}`);
    moved++;
    if (!APPLY) continue;
    await db.runTransaction(async tx => {
      const fromRef = db.collection('customers').doc(custId);
      const toRef = db.collection('customers').doc(targetId);
      const toSnap = await tx.get(toRef);
      if (toSnap.exists) {
        tx.update(toRef, { inquiryCount: FieldValue.increment(1), totalQuotationUsd: FieldValue.increment(amount), lastActiveAt: today });
      } else {
        tx.set(toRef, {
          id: targetId,
          name: String(inq.get('customerName') || inq.get('name') || '匿名工程客户').slice(0, 120),
          company: String(inq.get('company') || '').slice(0, 200),
          email: contact.slice(0, 150),
          phone: '',
          country: String(inq.get('location') || '').slice(0, 100),
          status: 'active',
          source: '数据修复：从合并档案拆分',
          inquiryCount: 1,
          totalQuotationUsd: amount,
          registeredAt: today,
          lastActiveAt: today
        });
      }
      tx.update(fromRef, { inquiryCount: FieldValue.increment(-1), totalQuotationUsd: FieldValue.increment(-amount) });
      tx.update(inq.ref, { customerId: targetId });
      for (const { q } of credited) {
        tx.set(db.collection('_processed_events').doc(`quotation_${q.id}`), { status: 'credited', customerId: targetId, leadId: inq.id, amount: toCents(Number(q.get('totalAmountUsd')) || 0), processedAt: new Date().toISOString() }, { merge: true });
      }
    });
  }

  // ---------------------------------------------------------------- 2. credit missed quotations
  // Re-read the links: step 1 may have moved inquiries.
  const leadCustomer = new Map();
  for (const inq of (await db.collection('inquiries').get()).docs) leadCustomer.set(inq.id, String(inq.get('customerId') || ''));
  let credited = 0;
  for (const q of quotationsSnap.docs) {
    const m = markers.get(`quotation_${q.id}`);
    const missed = !m || m.status === 'pending' || (!m.status && !m.customerId);
    if (!missed) continue;
    const leadId = String(q.get('leadId') || '');
    const custId = leadCustomer.get(leadId);
    const amount = toCents(Number(q.get('totalAmountUsd')) || 0);
    if (!leadId || !custId || amount <= 0) continue;
    if (!customers.has(custId) && !(await db.collection('customers').doc(custId).get()).exists) continue;
    console.log(`[credit] ${q.id} $${amount} -> ${custId}`);
    credited++;
    if (!APPLY) continue;
    await db.runTransaction(async tx => {
      const markerRef = db.collection('_processed_events').doc(`quotation_${q.id}`);
      const marker = await tx.get(markerRef);
      if (marker.exists && marker.get('status') === 'credited') return;
      tx.update(db.collection('customers').doc(custId), { totalQuotationUsd: FieldValue.increment(amount), lastActiveAt: today });
      tx.set(markerRef, { status: 'credited', leadId, customerId: custId, amount, processedAt: new Date().toISOString(), repaired: true });
    });
  }

  console.log(`\n${moved} inquiry link(s) to split, ${credited} quotation(s) to credit.${APPLY ? ' Done.' : ' Nothing written (dry run).'}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
