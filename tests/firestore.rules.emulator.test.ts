/**
 * Behavioural security tests: executes firestore.rules inside the Firestore Emulator.
 *
 * Run with:  npm run test:emulator
 * (`firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST; without it this suite is skipped and
 *  a warning is printed, so `npm test` stays usable on machines without Java/emulators.)
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  arrayUnion,
  deleteField,
  collection,
  query,
  where,
  runTransaction
} from 'firebase/firestore';

const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!emulatorHost) {
  console.warn(
    '[firestore.rules.emulator.test] FIRESTORE_EMULATOR_HOST is not set – behavioural rule tests SKIPPED. Run `npm run test:emulator`.'
  );
}

const describeEmulator = emulatorHost ? describe : describe.skip;
const now = () => new Date().toISOString();

const staffDoc = (uid: string, name: string, role: 'super_admin' | 'sales_rep', status: 'active' | 'suspended' = 'active') => ({
  id: uid,
  uid,
  name,
  phone: '13900001111',
  email: `${uid}@example.com`,
  role,
  status,
  assignedLeadsCount: 0,
  lastLoginAt: now(),
  createdAt: now(),
  updatedAt: now()
});

const leadDoc = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: '李经理',
  customerName: '李经理',
  company: '华南市政工程',
  phone: '13911112222',
  needType: '沥青冷补料',
  location: '广州',
  message: '询价50吨冷补料',
  createdAt: '2026-10-01T00:00:00.000Z',
  status: 'pending',
  stage: 'new',
  assignedStaffId: '',
  notes: [{ id: 'NOTE-1', author: '系统', content: '初始记录', createdAt: '2026-10-01T00:00:00.000Z' }],
  ...extra
});

describeEmulator('firestore.rules behaviour (emulator)', () => {
  let env: RulesTestEnvironment;

  const asUser = (uid: string, claims: Record<string, unknown> = {}) =>
    env.authenticatedContext(uid, claims).firestore();
  const anon = () => env.unauthenticatedContext().firestore();

  beforeAll(async () => {
    const [host, port] = (emulatorHost || '127.0.0.1:8080').split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-lym-rules-test',
      firestore: { rules, host, port: Number(port || 8080) }
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'staff', 'admin'), staffDoc('admin', '超级管理员', 'super_admin'));
      await setDoc(doc(db, 'staff', 'repA'), staffDoc('repA', '销售甲', 'sales_rep'));
      await setDoc(doc(db, 'staff', 'repB'), staffDoc('repB', '销售乙', 'sales_rep'));
      await setDoc(doc(db, 'staff', 'suspendedAdmin'), staffDoc('suspendedAdmin', '停用管理员', 'super_admin', 'suspended'));
      await setDoc(doc(db, 'inquiries', 'INQ-POOL'), leadDoc('INQ-POOL'));
      await setDoc(
        doc(db, 'inquiries', 'INQ-B'),
        leadDoc('INQ-B', { assignedStaffId: 'repB', assignedStaffName: '销售乙', stage: 'following' })
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('Identity: staff document is the single source of truth', () => {
    it('stale super_admin claims WITHOUT a staff document grant nothing (deleted employee)', async () => {
      const ghost = asUser('ghost', { role: 'super_admin', staff: true });
      await assertFails(getDoc(doc(ghost, 'inquiries', 'INQ-POOL')));
      await assertFails(setDoc(doc(ghost, 'products', 'p1'), { id: 'p1', type: 'material', model: 'X', price: '$1', inStock: true }));
      await assertFails(setDoc(doc(ghost, 'site_config', 'contact'), { wechatId: 'x', officialEmail: 'x@x.com', address: 'x' }));
    });

    it('a suspended super admin loses access even with valid claims', async () => {
      const suspended = asUser('suspendedAdmin', { role: 'super_admin', staff: true });
      await assertFails(getDoc(doc(suspended, 'inquiries', 'INQ-POOL')));
      await assertFails(deleteDoc(doc(suspended, 'inquiries', 'INQ-POOL')));
    });

    it('nobody can create or delete staff documents from the client (Admin SDK only)', async () => {
      await assertFails(setDoc(doc(asUser('admin'), 'staff', 'newbie'), staffDoc('newbie', '新人', 'sales_rep')));
      await assertFails(setDoc(doc(asUser('attacker', { email: 'admin@luyimei.com' }), 'staff', 'attacker'), staffDoc('attacker', '伪造', 'super_admin')));
      await assertFails(deleteDoc(doc(asUser('admin'), 'staff', 'repA')));
    });

    it('role / status can never be changed from the client, not even by a super admin', async () => {
      await assertFails(updateDoc(doc(asUser('repA'), 'staff', 'repA'), { role: 'super_admin' }));
      await assertFails(updateDoc(doc(asUser('admin'), 'staff', 'repA'), { status: 'suspended' }));
      await assertFails(updateDoc(doc(asUser('admin'), 'staff', 'repA'), { role: 'super_admin' }));
    });

    it('staff may touch only their own lastLoginAt; admins may edit display fields', async () => {
      await assertSucceeds(updateDoc(doc(asUser('repA'), 'staff', 'repA'), { lastLoginAt: now(), updatedAt: now() }));
      await assertFails(updateDoc(doc(asUser('repA'), 'staff', 'repA'), { name: '改名' }));
      await assertFails(updateDoc(doc(asUser('repA'), 'staff', 'repB'), { lastLoginAt: now() }));
      await assertSucceeds(updateDoc(doc(asUser('admin'), 'staff', 'repA'), { name: '销售甲（华南）', updatedAt: now() }));
    });

    it('anonymous visitors cannot read the staff directory', async () => {
      await assertFails(getDoc(doc(anon(), 'staff', 'admin')));
    });

    it('sales reps see only their own staff record; the directory is for super admins', async () => {
      const repA = asUser('repA');
      await assertSucceeds(getDoc(doc(repA, 'staff', 'repA')));
      await assertFails(getDoc(doc(repA, 'staff', 'repB')));
      await assertFails(getDoc(doc(repA, 'staff', 'admin')));
      await assertFails(getDocs(collection(repA, 'staff')));
      await assertSucceeds(getDocs(collection(asUser('admin'), 'staff')));
      // A suspended person can still read their own record (that is how the console learns it ended).
      await assertSucceeds(getDoc(doc(asUser('suspendedAdmin'), 'staff', 'suspendedAdmin')));
      await assertFails(getDocs(collection(asUser('suspendedAdmin'), 'staff')));
    });
  });

  // -------------------------------------------------------------------------
  describe('Inquiries: public submission', () => {
    it('anonymous visitor can submit a clean inquiry but cannot read it back', async () => {
      const db = anon();
      const { notes: _n, ...clean } = leadDoc('INQ-NEW');
      await assertSucceeds(setDoc(doc(db, 'inquiries', 'INQ-NEW'), { ...clean, createdAt: now() }));
      await assertFails(getDoc(doc(db, 'inquiries', 'INQ-NEW')));
    });

    it('cannot forge stage / value / owner / notes / another buyer', async () => {
      const db = anon();
      const { notes: _n, ...clean } = leadDoc('INQ-X');
      await assertFails(setDoc(doc(db, 'inquiries', 'INQ-X'), { ...clean, stage: 'won' }));
      await assertFails(setDoc(doc(db, 'inquiries', 'INQ-X'), { ...clean, estimatedValueUsd: 1e9 }));
      await assertFails(setDoc(doc(db, 'inquiries', 'INQ-X'), { ...clean, assignedStaffId: 'repA' }));
      await assertFails(setDoc(doc(db, 'inquiries', 'INQ-X'), { ...clean, notes: [] }));
      await assertFails(setDoc(doc(db, 'inquiries', 'INQ-X'), { ...clean, buyerUid: 'someone-else' }));
      await assertFails(setDoc(doc(db, 'inquiries', 'INQ-Y'), { ...clean, id: 'INQ-Z' }));
    });
  });

  // -------------------------------------------------------------------------
  describe('Inquiries: sales rep isolation', () => {
    it('rep cannot read-modify another rep\'s lead', async () => {
      await assertFails(updateDoc(doc(asUser('repA'), 'inquiries', 'INQ-B'), { stage: 'lost', updatedAt: now() }));
      await assertFails(updateDoc(doc(asUser('repA'), 'inquiries', 'INQ-B'), { assignedStaffId: 'repA', updatedAt: now() }));
    });

    it('rep can claim a pool lead for themselves, but not hand it to someone else', async () => {
      const repA = asUser('repA');
      await assertFails(updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), { assignedStaffId: 'repB', updatedAt: now() }));
      await assertSucceeds(
        updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), { assignedStaffId: 'repA', assignedStaffName: '销售甲', updatedAt: now() })
      );
      // ...and can release it back to the pool ('' marker; removing the field is rejected)
      await assertFails(
        updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), { assignedStaffId: deleteField(), updatedAt: now() })
      );
      await assertSucceeds(
        updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), { assignedStaffId: '', assignedStaffName: deleteField(), updatedAt: now() })
      );
    });

    it('notes are append-only for reps', async () => {
      const repA = asUser('repA');
      const note = { id: 'NOTE-2', author: '销售甲', content: '已电话沟通', createdAt: now() };
      await assertSucceeds(updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), { notes: arrayUnion(note), updatedAt: now() }));
      await assertFails(updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), { notes: [], updatedAt: now() }));
      await assertFails(
        updateDoc(doc(repA, 'inquiries', 'INQ-POOL'), {
          notes: [{ id: 'NOTE-1', author: '系统', content: '被篡改', createdAt: '2026-10-01T00:00:00.000Z' }, note],
          updatedAt: now()
        })
      );
    });

    it('rep cannot rewrite createdAt / buyerUid', async () => {
      await assertFails(updateDoc(doc(asUser('repA'), 'inquiries', 'INQ-POOL'), { createdAt: now() }));
      await assertFails(updateDoc(doc(asUser('repA'), 'inquiries', 'INQ-POOL'), { buyerUid: 'x' }));
    });

    it('rep can READ only pool + own leads (colleagues\' clients never reach the browser)', async () => {
      const repA = asUser('repA');
      await assertSucceeds(getDoc(doc(repA, 'inquiries', 'INQ-POOL')));
      await assertFails(getDoc(doc(repA, 'inquiries', 'INQ-B')));
      await assertSucceeds(getDocs(query(collection(repA, 'inquiries'), where('assignedStaffId', 'in', ['', 'repA']))));
      await assertFails(getDocs(collection(repA, 'inquiries')));
      await assertSucceeds(getDocs(collection(asUser('admin'), 'inquiries')));
    });

    it('nobody but the server sets customerId on a lead', async () => {
      await assertFails(setDoc(doc(asUser('repA'), 'inquiries', 'INQ-C1'), leadDoc('INQ-C1', { customerId: 'CUST-x' })));
      await assertFails(updateDoc(doc(asUser('repA'), 'inquiries', 'INQ-POOL'), { customerId: 'CUST-x' }));
    });

    it('rep manual lead: only unassigned or self-assigned', async () => {
      const repA = asUser('repA');
      await assertSucceeds(setDoc(doc(repA, 'inquiries', 'INQ-RA1'), leadDoc('INQ-RA1', { assignedStaffId: 'repA' })));
      await assertSucceeds(setDoc(doc(repA, 'inquiries', 'INQ-RA2'), leadDoc('INQ-RA2')));
      await assertFails(setDoc(doc(repA, 'inquiries', 'INQ-RA3'), leadDoc('INQ-RA3', { assignedStaffId: 'repB' })));
    });

    it('super admin can reassign any lead and delete; reps cannot delete', async () => {
      await assertSucceeds(
        updateDoc(doc(asUser('admin'), 'inquiries', 'INQ-B'), { assignedStaffId: 'repA', assignedStaffName: '销售甲', updatedAt: now() })
      );
      await assertFails(deleteDoc(doc(asUser('repA'), 'inquiries', 'INQ-POOL')));
      await assertSucceeds(deleteDoc(doc(asUser('admin'), 'inquiries', 'INQ-POOL')));
    });

    it('nobody can give a lead to a suspended or unknown staff member', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'staff', 'repGone'), staffDoc('repGone', '离职销售', 'sales_rep', 'suspended'));
        await setDoc(doc(ctx.firestore(), 'inquiries', 'INQ-OLD'), leadDoc('INQ-OLD', { assignedStaffId: 'repGone', assignedStaffName: '离职销售' }));
      });
      const admin = asUser('admin');
      await assertFails(updateDoc(doc(admin, 'inquiries', 'INQ-POOL'), { assignedStaffId: 'repGone', assignedStaffName: '离职销售', updatedAt: now() }));
      await assertFails(updateDoc(doc(admin, 'inquiries', 'INQ-POOL'), { assignedStaffId: 'nobody', updatedAt: now() }));
      await assertFails(setDoc(doc(admin, 'inquiries', 'INQ-NEW'), leadDoc('INQ-NEW', { assignedStaffId: 'repGone' })));
      // The suspended owner's existing lead can still be edited and handed to an active colleague.
      await assertSucceeds(updateDoc(doc(admin, 'inquiries', 'INQ-OLD'), { stage: 'following', updatedAt: now() }));
      await assertSucceeds(updateDoc(doc(admin, 'inquiries', 'INQ-OLD'), { assignedStaffId: 'repA', assignedStaffName: '销售甲', updatedAt: now() }));
    });
  });

  // -------------------------------------------------------------------------
  describe('Catalog, site config, audit logs', () => {
    const product = { id: 'p1', type: 'material', model: 'LYM-1', price: '$100', inStock: true, updatedAt: now() };

    it('only super admin writes products and site config', async () => {
      await assertFails(setDoc(doc(asUser('repA'), 'products', 'p1'), product));
      await assertSucceeds(setDoc(doc(asUser('admin'), 'products', 'p1'), product));
      await assertSucceeds(getDoc(doc(anon(), 'products', 'p1')));

      const cfg = { wechatId: 'LYM', officialEmail: 'biz@luyimei.com', address: '广州', whatsappNumber: '8613900001111' };
      await assertFails(setDoc(doc(asUser('repA'), 'site_config', 'contact'), cfg));
      await assertSucceeds(setDoc(doc(asUser('admin'), 'site_config', 'contact'), cfg));
    });

    it('bank details (site_config/billing): staff-only read, super-admin-only write', async () => {
      const billing = { beneficiary: 'LYM Co., Ltd.', bankName: 'Example Bank', accountNumber: '123456789', swiftCode: 'EXAMPLECN' };
      await assertSucceeds(setDoc(doc(asUser('admin'), 'site_config', 'billing'), billing));
      await assertFails(setDoc(doc(asUser('repA'), 'site_config', 'billing'), billing));
      // A billing payload must not be accepted as a contact document, and vice versa.
      await assertFails(setDoc(doc(asUser('admin'), 'site_config', 'billing'), { wechatId: 'x', officialEmail: 'x@x.com', address: 'x' }));
      await assertFails(setDoc(doc(asUser('admin'), 'site_config', 'billing'), { ...billing, accountNumber: '' }));
      await assertFails(setDoc(doc(asUser('admin'), 'site_config', 'billing'), { ...billing, note: 'extra field' }));
      // Reads: active staff yes; anonymous visitors and buyers never.
      await assertSucceeds(getDoc(doc(asUser('repA'), 'site_config', 'billing')));
      await assertFails(getDoc(doc(anon(), 'site_config', 'billing')));
      await assertFails(getDoc(doc(asUser('buyer1', { email: 'buyer@example.com' }), 'site_config', 'billing')));
      await assertFails(getDoc(doc(asUser('suspendedAdmin', { role: 'super_admin', staff: true }), 'site_config', 'billing')));
      // The public contact document stays readable by everyone.
      await assertSucceeds(getDoc(doc(anon(), 'site_config', 'contact')));
    });

    it('product categories (site_config/categories): public read, super-admin write; products accept any valid category id', async () => {
      const categories = { items: [{ id: 'material', name: { zh: '养护材料' } }, { id: 'c-sealant', name: { zh: '灌缝胶', en: 'Sealants' } }], updatedAt: now() };
      await assertFails(setDoc(doc(asUser('repA'), 'site_config', 'categories'), categories));
      await assertSucceeds(setDoc(doc(asUser('admin'), 'site_config', 'categories'), categories));
      await assertSucceeds(getDoc(doc(anon(), 'site_config', 'categories')));
      // Never empty, no stray fields, and not accepted as a contact document.
      await assertFails(setDoc(doc(asUser('admin'), 'site_config', 'categories'), { items: [] }));
      await assertFails(setDoc(doc(asUser('admin'), 'site_config', 'categories'), { ...categories, note: 'x' }));
      await assertFails(setDoc(doc(asUser('admin'), 'site_config', 'categories'), { wechatId: 'x', officialEmail: 'x@x.com', address: 'x' }));

      await assertSucceeds(setDoc(doc(asUser('admin'), 'products', 'p2'), { ...product, id: 'p2', type: 'c-sealant' }));
      await assertFails(setDoc(doc(asUser('admin'), 'products', 'p3'), { ...product, id: 'p3', type: 'Bad Type!' }));
      await assertSucceeds(
        setDoc(doc(asUser('admin'), 'products', 'p4'), { ...product, id: 'p4', translations: { en: { leadTime: '3 days' } } })
      );
      await assertFails(setDoc(doc(asUser('admin'), 'products', 'p5'), { ...product, id: 'p5', translations: { fr: { leadTime: '3 jours' } } }));
    });

    it('sign-up captchas are server-only', async () => {
      await assertFails(getDoc(doc(anon(), 'signup_captchas', 'any')));
      await assertFails(setDoc(doc(asUser('buyer1', { email: 'buyer@example.com' }), 'signup_captchas', 'any'), { answerHash: 'x' }));
    });

    it('audit log: multi-character action accepted, impersonation rejected, immutable', async () => {
      const repA = asUser('repA');
      const log = {
        id: 'LOG-1',
        operator: '销售甲',
        operatorRole: 'sales_rep',
        action: '添加线索跟进记录',
        target: 'INQ-POOL',
        details: '已电话沟通',
        timestamp: now()
      };
      await assertSucceeds(setDoc(doc(repA, 'audit_logs', 'LOG-1'), log));
      await assertFails(setDoc(doc(repA, 'audit_logs', 'LOG-2'), { ...log, id: 'LOG-2', operator: '超级管理员' }));
      await assertFails(setDoc(doc(repA, 'audit_logs', 'LOG-3'), { ...log, id: 'LOG-3', operatorRole: 'super_admin' }));
      await assertFails(updateDoc(doc(asUser('admin'), 'audit_logs', 'LOG-1'), { details: '篡改' }));
      await assertFails(setDoc(doc(anon(), 'audit_logs', 'LOG-4'), { ...log, id: 'LOG-4' }));
    });
  });

  // -------------------------------------------------------------------------
  describe('Buyers, customers, favorites', () => {
    it('buyer manages only own profile / favorites / bound customer record', async () => {
      const buyer = asUser('buyer1', { email: 'buyer@example.com' });
      const profile = { id: 'buyer1', uid: 'buyer1', email: 'buyer@example.com', name: 'Buyer One', registeredAt: now() };
      await assertSucceeds(setDoc(doc(buyer, 'buyers', 'buyer1'), profile));
      await assertFails(setDoc(doc(buyer, 'buyers', 'buyer2'), { ...profile, id: 'buyer2', uid: 'buyer2' }));

      const fav = { id: 'fav_buyer1_0', productId: '0', userId: 'buyer1', createdAt: now() };
      await assertSucceeds(setDoc(doc(buyer, 'favorites', fav.id), fav));
      await assertFails(setDoc(doc(buyer, 'favorites', 'fav_x'), { ...fav, id: 'fav_x', userId: 'buyer2' }));
      // Another buyer cannot overwrite buyer1's existing favorite doc even if they set userId to themselves
      const buyer2 = asUser('buyer2', { email: 'buyer2@example.com' });
      await assertFails(setDoc(doc(buyer2, 'favorites', fav.id), { ...fav, userId: 'buyer2' }));

      const customer = {
        id: 'CUST-buyer1',
        name: 'Buyer One',
        company: 'Global Road',
        email: 'buyer@example.com',
        phone: '',
        country: 'US',
        status: 'active',
        lastActiveAt: now(),
        inquiryCount: 0,
        totalQuotationUsd: 0
      };
      await assertSucceeds(setDoc(doc(buyer, 'customers', 'CUST-buyer1'), customer));
      await assertFails(setDoc(doc(buyer, 'customers', 'CUST-other'), { ...customer, id: 'CUST-other' }));
      await assertFails(getDoc(doc(buyer, 'customers', 'CUST-buyer1')));
    });

    it('customer archive and audit trail are super-admin only', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'customers', 'CUST-1'), {
          id: 'CUST-1', name: 'C', company: '', email: '', phone: '139', country: '', status: 'active', lastActiveAt: now()
        });
      });
      await assertFails(getDoc(doc(asUser('repA'), 'customers', 'CUST-1')));
      await assertFails(getDocs(collection(asUser('repA'), 'customers')));
      await assertFails(updateDoc(doc(asUser('repA'), 'customers', 'CUST-1'), { status: 'vip' }));
      await assertSucceeds(getDoc(doc(asUser('admin'), 'customers', 'CUST-1')));
      await assertFails(getDocs(collection(asUser('repA'), 'audit_logs')));
      await assertSucceeds(getDocs(collection(asUser('admin'), 'audit_logs')));
    });
  });

  // -------------------------------------------------------------------------
  describe('Quotations', () => {
    const quote = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      quotationNumber: id,
      clientName: 'Ahmed',
      items: [{ productId: '0', productName: 'Cold patch', model: 'LYM-CP', unitPriceUsd: 420, quantity: 1, unit: 'Ton', amountUsd: 420 }],
      totalAmountUsd: 420,
      currency: 'USD ($)',
      createdBy: '销售甲',
      createdByUid: 'repA',
      createdAt: now(),
      ...extra
    });

    it('staff issue quotations only in their own name; quotations are immutable; leadId must belong to caller or pool', async () => {
      const repA = asUser('repA');
      await assertSucceeds(setDoc(doc(repA, 'quotations', 'PI-1'), quote('PI-1')));
      await assertSucceeds(setDoc(doc(repA, 'quotations', 'PI-POOL'), quote('PI-POOL', { leadId: 'INQ-POOL' })));
      await assertFails(setDoc(doc(repA, 'quotations', 'PI-COLLEAGUE'), quote('PI-COLLEAGUE', { leadId: 'INQ-B' })));
      await assertSucceeds(
        setDoc(
          doc(asUser('admin'), 'quotations', 'PI-ADMIN-B'),
          quote('PI-ADMIN-B', { leadId: 'INQ-B', createdBy: '超级管理员', createdByUid: 'admin' })
        )
      );
      await assertFails(setDoc(doc(repA, 'quotations', 'PI-2'), quote('PI-2', { createdByUid: 'repB' })));
      await assertFails(setDoc(doc(repA, 'quotations', 'PI-3'), quote('PI-3', { createdBy: '超级管理员' })));
      await assertFails(setDoc(doc(repA, 'quotations', 'PI-4'), quote('PI-4', { items: [] })));
      await assertFails(updateDoc(doc(repA, 'quotations', 'PI-1'), { totalAmountUsd: 1 }));
      await assertFails(setDoc(doc(anon(), 'quotations', 'PI-5'), quote('PI-5')));
    });

    it('reps read only their own quotations; idempotency check on a missing doc is allowed', async () => {
      await assertSucceeds(setDoc(doc(asUser('repA'), 'quotations', 'PI-A'), quote('PI-A')));
      await assertSucceeds(getDoc(doc(asUser('repA'), 'quotations', 'PI-A')));
      await assertFails(getDoc(doc(asUser('repB'), 'quotations', 'PI-A')));
      await assertSucceeds(getDoc(doc(asUser('admin'), 'quotations', 'PI-A')));
      await assertSucceeds(
        getDocs(query(collection(asUser('repB'), 'quotations'), where('createdByUid', '==', 'repB')))
      );
      await assertFails(getDocs(collection(asUser('repB'), 'quotations')));
      // the client issues quotations inside a transaction that first reads the (missing) doc
      const repBDb = asUser('repB');
      await assertSucceeds(
        runTransaction(repBDb, async tx => {
          const ref = doc(repBDb, 'quotations', 'PI-NEW');
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            tx.set(ref, quote('PI-NEW', { createdBy: '销售乙', createdByUid: 'repB' }));
          }
        })
      );
    });
  });
});
