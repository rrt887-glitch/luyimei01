/**
 * Runs the real Firestore triggers from functions/src/index.ts against an in-memory stand-in for
 * firebase-admin, to check ordering and redelivery cases that are hard to reproduce by hand:
 * a quotation issued before the lead has a customer, a lead handed over before processing,
 * redelivered events, a failing notification webhook, and look-alike email addresses.
 *
 * Needs functions/node_modules (cd functions && npm ci); skipped otherwise.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const hasFunctionsDeps = fs.existsSync(path.resolve(__dirname, '../functions/node_modules/firebase-functions'));

// ---------------------------------------------------------------- in-memory Firestore
type Row = Record<string, any>;
const store = new Map<string, Row>();
const INC = Symbol('increment');
const DEL = Symbol('delete');

function apply(path: string, data: Row, merge: boolean) {
  const prev = merge ? { ...(store.get(path) || {}) } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v && v[INC] !== undefined) prev[k] = (Number(prev[k]) || 0) + v[INC];
    else if (v === DEL) delete prev[k];
    else prev[k] = JSON.parse(JSON.stringify(v));
  }
  store.set(path, prev);
}
const snapOf = (path: string) => {
  const row = store.get(path);
  return {
    id: path.split('/').pop()!,
    exists: !!row,
    ref: docRef(path),
    data: () => (row ? JSON.parse(JSON.stringify(row)) : undefined),
    get: (k: string) => row?.[k]
  };
};
function docRef(path: string): any {
  return {
    id: path.split('/').pop(),
    path,
    get: async () => snapOf(path),
    set: async (d: Row, o?: { merge?: boolean }) => apply(path, d, !!o?.merge),
    update: async (d: Row) => {
      if (!store.has(path)) throw new Error('not-found');
      apply(path, d, true);
    },
    create: async (d: Row) => {
      if (store.has(path)) throw Object.assign(new Error('already-exists'), { code: 6 });
      apply(path, d, false);
    },
    delete: async () => void store.delete(path)
  };
}
function collectionRef(name: string, filters: [string, unknown][] = []): any {
  return {
    doc: (id: string) => docRef(`${name}/${id}`),
    where: (field: string, _op: string, value: unknown) => collectionRef(name, [...filters, [field, value]]),
    get: async () => {
      const docs = [...store.keys()]
        .filter(k => k.startsWith(name + '/') && k.split('/').length === 2)
        .map(snapOf)
        .filter(s => filters.every(([f, v]) => s.get(f) === v));
      return { docs, empty: docs.length === 0, size: docs.length };
    }
  };
}
const fakeDb = {
  collection: (n: string) => collectionRef(n),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    const writes: (() => void)[] = [];
    const tx = {
      get: async (ref: any) => snapOf(ref.path),
      set: (ref: any, d: Row, o?: { merge?: boolean }) => writes.push(() => apply(ref.path, d, !!o?.merge)),
      update: (ref: any, d: Row) => writes.push(() => apply(ref.path, d, true)),
      create: (ref: any, d: Row) => writes.push(() => apply(ref.path, d, false))
    };
    const result = await fn(tx);
    writes.forEach(w => w());
    return result;
  },
  batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} })
};

// functions/ has its own node_modules: mock the copies that functions/src/index.ts actually loads.
const adminPaths = vi.hoisted(() => {
  // Vite loads the ESM build (package "exports" -> import condition).
  const p = require('node:path') as typeof import('node:path');
  const lib = p.resolve(__dirname, '../functions/node_modules/firebase-admin/lib/esm');
  const rootLib = p.resolve(__dirname, '../node_modules/firebase-admin/lib/esm');
  return {
    app: p.join(lib, 'app/index.js'),
    auth: p.join(lib, 'auth/index.js'),
    firestore: p.join(lib, 'firestore/index.js'),
    // scripts/*.mjs run from the project root and load the root copy.
    rootApp: p.join(rootLib, 'app/index.js'),
    rootFirestore: p.join(rootLib, 'firestore/index.js')
  };
});
vi.mock(adminPaths.app, () => ({ initializeApp: () => ({}) }));
vi.mock(adminPaths.rootApp, () => ({ initializeApp: () => ({}), applicationDefault: () => ({}) }));
vi.mock(adminPaths.rootFirestore, () => ({
  getFirestore: () => fakeDb,
  FieldValue: { increment: (n: number) => ({ [INC]: n }), delete: () => DEL }
}));
const claims = new Map<string, Record<string, unknown> | null>();
vi.mock(adminPaths.auth, () => ({ getAuth: () => ({ setCustomUserClaims: async (uid: string, c: Record<string, unknown> | null) => void claims.set(uid, c) }) }));
vi.mock(adminPaths.firestore, () => ({
  getFirestore: () => fakeDb,
  FieldValue: { increment: (n: number) => ({ [INC]: n }), delete: () => DEL },
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  DocumentReference: class {}
}));

// ---------------------------------------------------------------- helpers
let fns: any;
const now = () => new Date().toISOString();
const run = (fn: any, docPath: string, params: Record<string, string>, time = now()) =>
  fn.run({ data: snapOf(docPath), params, time });
const lead = (id: string, extra: Row = {}) => apply(`inquiries/${id}`, { id, name: 'QA', customerName: 'QA', phone: '+971 50 123 4567', needType: '养护材料', createdAt: now(), assignedStaffId: 'repA', ...extra }, false);
const quotation = (id: string, leadId: string, total: number) =>
  apply(`quotations/${id}`, { id, quotationNumber: id, leadId, totalAmountUsd: total, createdByUid: 'repA', createdAt: now() }, false);
const total = (custId: string) => store.get(`customers/${custId}`)?.totalQuotationUsd;

describe.skipIf(!hasFunctionsDeps)('Cloud Functions triggers', () => {
  beforeEach(async () => {
    store.clear();
    process.env.NOTIFY_WEBHOOK_URL = '';
    vi.restoreAllMocks();
    fns ??= await import('../functions/src/index');
  });

  it('#34 quotation issued before the lead has a customer is credited once the link exists', async () => {
    lead('INQ-1');
    quotation('PI-1', 'INQ-1', 40.25);
    // Quotation trigger runs first: lead has no customer yet -> pending, event asks to be retried.
    await expect(run(fns.onQuotationCreated, 'quotations/PI-1', { quotationId: 'PI-1' })).rejects.toThrow(/will retry/);
    expect(store.get('_processed_events/quotation_PI-1')?.status).toBe('pending');
    // Inquiry trigger links the customer and settles the pending quotation.
    await run(fns.onInquiryCreated, 'inquiries/INQ-1', { inquiryId: 'INQ-1' });
    const custId = store.get('inquiries/INQ-1')!.customerId;
    expect(total(custId)).toBe(40.25);
    // A late redelivery of the quotation event does not count it twice.
    await run(fns.onQuotationCreated, 'quotations/PI-1', { quotationId: 'PI-1' });
    expect(total(custId)).toBe(40.25);
  });

  it('#34 a redelivered quotation event credits it once the customer exists', async () => {
    lead('INQ-2');
    quotation('PI-2', 'INQ-2', 100);
    await expect(run(fns.onQuotationCreated, 'quotations/PI-2', { quotationId: 'PI-2' })).rejects.toThrow();
    // Link created by another path (e.g. inquiry trigger without reaching the pending step).
    apply('customers/CUST-X', { id: 'CUST-X', totalQuotationUsd: 0 }, false);
    apply('inquiries/INQ-2', { customerId: 'CUST-X' }, true);
    await run(fns.onQuotationCreated, 'quotations/PI-2', { quotationId: 'PI-2' });
    await run(fns.onQuotationCreated, 'quotations/PI-2', { quotationId: 'PI-2' });
    expect(total('CUST-X')).toBe(100);
  });

  it('#37 lead handed to a colleague after issuing is still credited', async () => {
    lead('INQ-3', { assignedStaffId: 'repA' });
    await run(fns.onInquiryCreated, 'inquiries/INQ-3', { inquiryId: 'INQ-3' });
    const custId = store.get('inquiries/INQ-3')!.customerId;
    quotation('PI-3', 'INQ-3', 40.25);
    apply('inquiries/INQ-3', { assignedStaffId: 'repB' }, true); // transferred before the trigger ran
    await run(fns.onQuotationCreated, 'quotations/PI-3', { quotationId: 'PI-3' });
    expect(total(custId)).toBe(40.25);
    expect(store.get('_processed_events/quotation_PI-3')?.status).toBe('credited');
  });

  it('a lead whose contact can never become a customer does not retry forever', async () => {
    lead('INQ-4', { phone: '12' });
    quotation('PI-4', 'INQ-4', 10);
    await run(fns.onQuotationCreated, 'quotations/PI-4', { quotationId: 'PI-4' });
    expect(store.get('_processed_events/quotation_PI-4')?.status).toBe('skipped');
  });

  it('#35 webhook HTTP 500: no marker, event retried, message sent on redelivery, then never again', async () => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/robot';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    lead('INQ-5', { notes: undefined });
    await expect(run(fns.onInquiryCreated, 'inquiries/INQ-5', { inquiryId: 'INQ-5' })).rejects.toThrow(/notification failed/);
    expect(store.has('_processed_events/inquiry_notify_INQ-5')).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await run(fns.onInquiryCreated, 'inquiries/INQ-5', { inquiryId: 'INQ-5' });
    expect(store.has('_processed_events/inquiry_notify_INQ-5')).toBe(true);
    await run(fns.onInquiryCreated, 'inquiries/INQ-5', { inquiryId: 'INQ-5' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Inquiry counted once despite three deliveries.
    expect(store.get(`customers/${store.get('inquiries/INQ-5')!.customerId}`)?.inquiryCount).toBe(1);
  });

  it('#35 a webhook that keeps failing is given up after the retry window', async () => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/robot';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lead('INQ-6');
    const old = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
    await expect(run(fns.onInquiryCreated, 'inquiries/INQ-6', { inquiryId: 'INQ-6' }, old)).resolves.toBeUndefined();
  });

  it('#36 different emails get different customers; same email (any case) the same one', async () => {
    lead('INQ-7', { phone: 'qa.test@example.com' });
    lead('INQ-8', { phone: 'qa_test@example.com' });
    lead('INQ-9', { phone: 'QA.Test@Example.com' });
    for (const id of ['INQ-7', 'INQ-8', 'INQ-9']) await run(fns.onInquiryCreated, `inquiries/${id}`, { inquiryId: id });
    const [a, b, c] = ['INQ-7', 'INQ-8', 'INQ-9'].map(id => store.get(`inquiries/${id}`)!.customerId);
    expect(a).not.toBe(b);
    expect(a).toBe(c);
    expect(store.get(`customers/${a}`)!.inquiryCount).toBe(2);
  });

  it('#36 an existing customer under the old key keeps receiving its own address only', async () => {
    apply('customers/CUST-MAIL-qa_test_example_com', { id: 'CUST-MAIL-qa_test_example_com', email: 'qa.test@example.com', inquiryCount: 1, totalQuotationUsd: 0 }, false);
    lead('INQ-10', { phone: 'qa.test@example.com' });
    lead('INQ-11', { phone: 'qa_test@example.com' });
    await run(fns.onInquiryCreated, 'inquiries/INQ-10', { inquiryId: 'INQ-10' });
    await run(fns.onInquiryCreated, 'inquiries/INQ-11', { inquiryId: 'INQ-11' });
    expect(store.get('inquiries/INQ-10')!.customerId).toBe('CUST-MAIL-qa_test_example_com');
    expect(store.get('inquiries/INQ-11')!.customerId).not.toBe('CUST-MAIL-qa_test_example_com');
  });

  it('repair script splits a merged email customer and credits a missed quotation', async () => {
    // State left by v15.5: two addresses merged under the old key, one quotation marked without credit.
    apply('customers/CUST-MAIL-qa_test_example_com', { id: 'CUST-MAIL-qa_test_example_com', email: 'qa.test@example.com', inquiryCount: 2, totalQuotationUsd: 50 }, false);
    lead('INQ-A', { phone: 'qa.test@example.com', customerId: 'CUST-MAIL-qa_test_example_com' });
    lead('INQ-B', { phone: 'qa_test@example.com', customerId: 'CUST-MAIL-qa_test_example_com' });
    quotation('PI-B', 'INQ-B', 50);
    apply('_processed_events/quotation_PI-B', { customerId: 'CUST-MAIL-qa_test_example_com' }, false);
    quotation('PI-A', 'INQ-A', 40.25);
    apply('_processed_events/quotation_PI-A', { customerId: null }, false); // missed credit
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.argv.push('--apply');
    try {
      await import('../scripts/repair-customer-links.mjs');
      await vi.waitFor(() => expect(store.get('_processed_events/quotation_PI-A')?.status).toBe('credited'));
    } finally {
      process.argv.pop();
    }
    const newId = store.get('inquiries/INQ-B')!.customerId;
    expect(newId).not.toBe('CUST-MAIL-qa_test_example_com');
    expect(store.get(`customers/${newId}`)).toMatchObject({ email: 'qa_test@example.com', inquiryCount: 1, totalQuotationUsd: 50 });
    expect(store.get('customers/CUST-MAIL-qa_test_example_com')).toMatchObject({ inquiryCount: 1, totalQuotationUsd: 40.25 });
  });

  it('#42/#21 upload grant: active super admin gets a 15-minute grant; suspended or sales staff are refused', async () => {
    apply('staff/admin', { id: 'admin', role: 'super_admin', status: 'active' }, false);
    apply('staff/gone', { id: 'gone', role: 'super_admin', status: 'suspended' }, false);
    apply('staff/rep', { id: 'rep', role: 'sales_rep', status: 'active' }, false);
    const call = (uid: string) => fns.grantUploadAccess.run({ auth: { uid, token: {} }, data: {}, rawRequest: {} as any });
    const t0 = Date.now();
    const { uploadUntil } = await call('admin');
    expect(uploadUntil).toBeGreaterThan(t0 + 14 * 60_000);
    expect(uploadUntil).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    expect(claims.get('admin')).toEqual({ role: 'super_admin', staff: true, uploadUntil });
    await expect(call('gone')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('rep')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(claims.has('gone')).toBe(false);
  });
});
