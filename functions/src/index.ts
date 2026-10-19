/**
 * LYM Admin Cloud Functions
 *
 * All staff identity operations (create / delete / status & role change / password reset) live
 * here and run with the Admin SDK, so Firebase Auth accounts, Custom Claims and `staff/{uid}`
 * documents are always changed together. Clients are NOT allowed to write `staff` role/status
 * directly (see firestore.rules `match /staff/{staffUid}`).
 *
 * Authorization policy (identical to firestore.rules / storage.rules):
 *   the caller's `staff/{uid}` document is the single source of truth. Custom Claims are kept in
 *   sync only as a convenience for clients and are never trusted for authorization.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { beforeUserCreated } from 'firebase-functions/v2/identity';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, DocumentReference, Timestamp } from 'firebase-admin/firestore';

// Must match FUNCTIONS_REGION in src/config/appConfig.ts, and the Firestore database location
// (multi-region nam5 -> us-central1, eur3 -> europe-west1). See DEPLOY.md.
const FUNCTIONS_REGION = 'us-central1';

// maxInstances caps cost if the public inquiry trigger is ever flooded.
setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

const app = initializeApp();

// Must match `firestoreDatabaseId` in firebase-applet-config.json (checked by tests/config.consistency.test.ts).
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-cardcorner-bf216942-1486-4ef1-bcb0-4a7b0673efe2';

// Must match STAFF_AUTH_EMAIL_DOMAIN in src/config/appConfig.ts.
const STAFF_AUTH_EMAIL_DOMAIN = 'auth.luyimei.com';
const RESERVED_STAFF_EMAIL_DOMAINS = [STAFF_AUTH_EMAIL_DOMAIN, 'staff.luyimei.internal'];

const MIN_PASSWORD_LENGTH = 8;

/**
 * Optional group-robot webhook for new-inquiry notifications (企业微信 / 钉钉 群机器人, both accept
 * `{ msgtype: 'text', text: { content } }`). Configure in functions/.env:  NOTIFY_WEBHOOK_URL=https://...
 * Leave empty to disable notifications.
 */
const NOTIFY_WEBHOOK_URL = defineString('NOTIFY_WEBHOOK_URL', { default: '' });
const FIRESTORE_BATCH_LIMIT = 400;

const adminAuth = getAuth(app);
const adminDb = getFirestore(app, FIRESTORE_DATABASE_ID);

type StaffRole = 'super_admin' | 'sales_rep';
type StaffStatus = 'active' | 'suspended';

interface StaffDoc {
  id: string;
  uid: string;
  name: string;
  phone: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  assignedLeadsCount: number;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhoneDigits(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  return digits;
}

function phoneToStaffAuthEmail(phone: string): string {
  return `staff.${normalizePhoneDigits(phone)}@${STAFF_AUTH_EMAIL_DOMAIN}`;
}

function isReservedStaffEmail(email: string): boolean {
  const lower = (email || '').trim().toLowerCase();
  return RESERVED_STAFF_EMAIL_DOMAINS.some(domain => lower.endsWith(`@${domain}`));
}

function staffRef(uid: string): DocumentReference {
  return adminDb.collection('staff').doc(uid);
}

function parseStaffIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError('invalid-argument', '请提供目标员工 ID 列表。');
  }
  if (raw.length > 100) {
    throw new HttpsError('invalid-argument', '单次最多处理 100 位员工。');
  }
  return Array.from(new Set(raw.map(id => String(id || '').trim()).filter(Boolean)));
}

/**
 * The caller must own an active `staff/{uid}` document with role `super_admin`.
 * Claims alone are never sufficient (a deleted or suspended staff document always wins).
 */
async function assertCallerIsSuperAdmin(
  authContext: { uid: string } | undefined
): Promise<string> {
  if (!authContext || !authContext.uid) {
    throw new HttpsError('unauthenticated', '未检测到登录凭证，请先登录超级管理员账号。');
  }

  const snap = await staffRef(authContext.uid).get();
  const data = snap.data();
  const isActive = data && (data.status === undefined || data.status === 'active');
  if (!snap.exists || !data || data.role !== 'super_admin' || !isActive) {
    throw new HttpsError('permission-denied', '越权拦截：仅在职超级管理员可执行员工账号管理操作。');
  }
  return authContext.uid;
}

/** Count active super admins, optionally excluding some uids. */
async function countActiveSuperAdmins(excludeUids: Set<string>): Promise<number> {
  const snap = await adminDb.collection('staff').where('role', '==', 'super_admin').get();
  return snap.docs.filter(d => {
    const status = d.get('status');
    return !excludeUids.has(d.id) && (status === undefined || status === 'active');
  }).length;
}

/** Release all leads assigned to `staffUid` back to the public pool (chunked batches). */
async function releaseLeadsOfStaff(staffUid: string): Promise<number> {
  const assigned = await adminDb
    .collection('inquiries')
    .where('assignedStaffId', '==', staffUid)
    .get();
  if (assigned.empty) return 0;

  const nowIso = new Date().toISOString();
  for (let i = 0; i < assigned.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = adminDb.batch();
    for (const docSnap of assigned.docs.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
      batch.update(docSnap.ref, {
        assignedStaffId: '', // '' = public pool (field must always exist, see firestore.rules)
        assignedStaffName: FieldValue.delete(),
        updatedAt: nowIso
      });
    }
    await batch.commit();
  }
  return assigned.size;
}

/** Keep Custom Claims + Auth disabled flag in sync with the staff document, and kick old sessions. */
async function syncAuthWithStaffState(uid: string, role: StaffRole | null, status: StaffStatus | null) {
  if (!role || status !== 'active') {
    await adminAuth.setCustomUserClaims(uid, null);
    await adminAuth.updateUser(uid, { disabled: true });
  } else {
    await adminAuth.setCustomUserClaims(uid, { role, staff: true });
    await adminAuth.updateUser(uid, { disabled: false });
  }
  await adminAuth.revokeRefreshTokens(uid);
}

// ---------------------------------------------------------------------------
// 0. Auth blocking function: nobody can create an email/password account straight from the browser.
//    Buyers register through `registerBuyer` below, which first checks the image captcha and
//    then creates the account with the Admin SDK; staff accounts come from
//    adminCreateStaff. Admin SDK createUser does not trigger blocking functions, so both still work.
//    NOTE: requires Firebase Authentication with Identity Platform. Every client sign-up passes
//    through this function, so keep it fast and side-effect free.
// ---------------------------------------------------------------------------
export const beforeAccountCreated = beforeUserCreated(event => {
  const email = event.data?.email || '';
  if (isReservedStaffEmail(email)) {
    throw new HttpsError(
      'permission-denied',
      '安全拦截：内部员工专用认证域名禁止外部公开注册，仅限超级管理员在后台开通。'
    );
  }
  if (email) {
    throw new HttpsError('permission-denied', 'Please register through the form on the website.');
  }
});

// ---------------------------------------------------------------------------
// 1. adminCreateStaff
// ---------------------------------------------------------------------------
export const adminCreateStaff = onCall(async request => {
  await assertCallerIsSuperAdmin(request.auth);

  const { name, phone, email, password, role } = (request.data || {}) as {
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
    role?: StaffRole;
  };

  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanPhone = normalizePhoneDigits(String(phone || ''));
  const cleanPassword = String(password || '').trim();
  const targetRole: StaffRole = role === 'super_admin' ? 'super_admin' : 'sales_rep';

  if (!cleanName || cleanPhone.length < 6) {
    throw new HttpsError('invalid-argument', '请提供有效的员工姓名与手机号。');
  }
  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument', `员工初始密码不能少于 ${MIN_PASSWORD_LENGTH} 位字符。`);
  }

  const mappedAuthEmail = phoneToStaffAuthEmail(cleanPhone);
  const contactEmail = (String(email || '').trim() || mappedAuthEmail).slice(0, 150);

  const existingQuery = await adminDb.collection('staff').where('phone', '==', cleanPhone).limit(1).get();
  if (!existingQuery.empty) {
    throw new HttpsError('already-exists', `手机号 ${cleanPhone} 已绑定现有员工档案，请勿重复开通。`);
  }

  let uid = '';
  let createdNewAuthUser = false;

  try {
    // An orphaned Auth account (from an earlier failed attempt) is reused and fully reset.
    const existingUser = await adminAuth.getUserByEmail(mappedAuthEmail);
    uid = existingUser.uid;
    await adminAuth.updateUser(uid, {
      password: cleanPassword,
      displayName: cleanName,
      disabled: false,
      emailVerified: true
    });
    await adminAuth.revokeRefreshTokens(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', `创建 Firebase Auth 账号失败：${err?.message || '未知错误'}`);
    }
    const created = await adminAuth.createUser({
      email: mappedAuthEmail,
      password: cleanPassword,
      displayName: cleanName,
      emailVerified: true
    });
    uid = created.uid;
    createdNewAuthUser = true;
  }

  const nowIso = new Date().toISOString();
  const staffDoc: StaffDoc = {
    id: uid,
    uid,
    name: cleanName,
    phone: cleanPhone,
    email: contactEmail,
    role: targetRole,
    status: 'active',
    assignedLeadsCount: 0,
    lastLoginAt: '尚未登录',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  try {
    await adminAuth.setCustomUserClaims(uid, { role: targetRole, staff: true });
    await staffRef(uid).set(staffDoc);
    return { staff: staffDoc };
  } catch (err: any) {
    // Roll back so a half-created account never lingers.
    if (createdNewAuthUser) {
      await adminAuth.deleteUser(uid).catch(() => {});
    } else {
      await adminAuth.setCustomUserClaims(uid, null).catch(() => {});
      await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
    }
    throw new HttpsError('internal', `写入员工档案失败，已回滚认证账号：${err?.message || '未知错误'}`);
  }
});

// ---------------------------------------------------------------------------
// 2. adminResetStaffPassword
// ---------------------------------------------------------------------------
export const adminResetStaffPassword = onCall(async request => {
  await assertCallerIsSuperAdmin(request.auth);

  const { staffId, newPassword } = (request.data || {}) as {
    staffId?: string;
    newPassword?: string;
  };

  const targetUid = String(staffId || '').trim();
  const cleanPassword = String(newPassword || '').trim();

  if (!targetUid) {
    throw new HttpsError('invalid-argument', '缺少目标员工 UID。');
  }
  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument', `新密码长度不能少于 ${MIN_PASSWORD_LENGTH} 位字符。`);
  }

  const ref = staffRef(targetUid);
  if (!(await ref.get()).exists) {
    throw new HttpsError('not-found', '目标员工档案不存在。');
  }

  await adminAuth.updateUser(targetUid, { password: cleanPassword });
  await adminAuth.revokeRefreshTokens(targetUid);
  await ref.update({ updatedAt: new Date().toISOString() });

  return { success: true };
});

// ---------------------------------------------------------------------------
// 3. adminUpdateStaffStatus (status and/or role)
// ---------------------------------------------------------------------------
export const adminUpdateStaffStatus = onCall(async request => {
  const callerUid = await assertCallerIsSuperAdmin(request.auth);

  const { staffIds, status, role } = (request.data || {}) as {
    staffIds?: unknown;
    status?: StaffStatus;
    role?: StaffRole;
  };
  const targetIds = parseStaffIds(staffIds);

  if (status !== undefined && status !== 'active' && status !== 'suspended') {
    throw new HttpsError('invalid-argument', '无效的员工状态。');
  }
  if (role !== undefined && role !== 'super_admin' && role !== 'sales_rep') {
    throw new HttpsError('invalid-argument', '无效的员工角色。');
  }

  // Never let the caller lock themselves out, and never remove the last active super admin.
  const filteredIds = targetIds.filter(uid => {
    if (uid !== callerUid) return true;
    return status !== 'suspended' && (role === undefined || role === 'super_admin');
  });
  const skippedSelf = filteredIds.length !== targetIds.length;

  const losingAdmin = new Set<string>();
  for (const uid of filteredIds) {
    if (status === 'suspended' || role === 'sales_rep') losingAdmin.add(uid);
  }
  if (losingAdmin.size > 0 && (await countActiveSuperAdmins(losingAdmin)) === 0) {
    throw new HttpsError('failed-precondition', '安全保护：系统必须至少保留一位在职超级管理员。');
  }

  const updatedIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const uid of filteredIds) {
    const ref = staffRef(uid);
    const snap = await ref.get();
    if (!snap.exists) continue;

    const current = snap.data() || {};
    const nextStatus: StaffStatus = status ?? (current.status === 'suspended' ? 'suspended' : 'active');
    const nextRole: StaffRole = role ?? (current.role === 'super_admin' ? 'super_admin' : 'sales_rep');

    await ref.update({ status: nextStatus, role: nextRole, updatedAt: nowIso });
    await syncAuthWithStaffState(uid, nextRole, nextStatus).catch(err => {
      // The staff document already revokes access server-side; claims are only a client hint.
      console.warn(`Auth sync warning for ${uid}:`, err);
    });
    updatedIds.push(uid);
  }

  return { updatedIds, count: updatedIds.length, skippedSelf };
});

// ---------------------------------------------------------------------------
// 4. adminDeleteStaff
//    Order matters: revoke Auth first, then delete the staff document, then release leads.
//    Even if a step fails midway, the person can no longer act as staff, because rules require
//    an active staff document and the Auth account is disabled/deleted first.
// ---------------------------------------------------------------------------
export const adminDeleteStaff = onCall(async request => {
  const callerUid = await assertCallerIsSuperAdmin(request.auth);
  const { staffIds } = (request.data || {}) as { staffIds?: unknown };
  const targetIds = parseStaffIds(staffIds);

  const deletable = targetIds.filter(uid => uid !== callerUid);
  const skippedCurrent = deletable.length !== targetIds.length;

  if ((await countActiveSuperAdmins(new Set(deletable))) === 0) {
    throw new HttpsError('failed-precondition', '安全保护：系统必须至少保留一位在职超级管理员。');
  }

  const deletedIds: string[] = [];
  let releasedLeadCount = 0;

  for (const uid of deletable) {
    await adminAuth.deleteUser(uid).catch(async (err: any) => {
      if (err?.code === 'auth/user-not-found') return;
      // Could not delete: at minimum make sure the account is unusable.
      await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
      await adminAuth.revokeRefreshTokens(uid).catch(() => {});
      console.warn(`Warning deleting Auth user ${uid}:`, err);
    });

    await staffRef(uid).delete();
    releasedLeadCount += await releaseLeadsOfStaff(uid);
    deletedIds.push(uid);
  }

  return {
    deletedIds,
    successCount: deletedIds.length,
    skippedCurrent,
    releasedLeadCount
  };
});

// ---------------------------------------------------------------------------
// 5. onInquiryCreated
//    Every new inquiry (public website form OR manual lead entered by staff) is linked to a CRM
//    customer archive here, server-side, so that:
//      * anonymous visitors never need write access to `customers`;
//      * customers are matched only by a stable key (buyer uid > phone digits > email), never by name;
//      * counters are updated atomically inside a transaction (idempotent on retries);
//      * sales receive a group-robot notification for new website inquiries.
// ---------------------------------------------------------------------------

function customerIdForInquiry(data: Record<string, any>): string | null {
  const buyerUid = String(data.buyerUid || '').trim();
  if (buyerUid) return `CUST-${buyerUid}`;

  const contact = String(data.phone || '').trim();
  if (contact.includes('@')) {
    const key = contact.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 100);
    return key ? `CUST-MAIL-${key}` : null;
  }
  const digits = normalizePhoneDigits(contact);
  return digits.length >= 6 ? `CUST-TEL-${digits}` : null;
}

async function notifyNewInquiry(inquiryId: string, data: Record<string, any>): Promise<void> {
  const url = NOTIFY_WEBHOOK_URL.value();
  if (!url) return;
  const lines = [
    '【官网新询价】',
    `客户：${data.customerName || data.name || '-'}${data.company ? `（${data.company}）` : ''}`,
    `联系方式：${data.phone || '-'}`,
    `需求：${data.needType || '-'}`,
    data.location ? `地点：${data.location}` : '',
    data.message ? `留言：${String(data.message).slice(0, 300)}` : '',
    `编号：${inquiryId}`
  ].filter(Boolean);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: lines.join('\n') } })
    });
    if (!res.ok) console.warn(`Inquiry notification HTTP ${res.status}`);
  } catch (err) {
    console.warn('Inquiry notification failed:', err);
  }
}

export const onInquiryCreated = onDocumentCreated(
  { document: 'inquiries/{inquiryId}', database: FIRESTORE_DATABASE_ID },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const inquiryId = event.params.inquiryId;
    const initial = snap.data() || {};
    const customerId = customerIdForInquiry(initial);
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    let linkedNow = false;
    await adminDb.runTransaction(async tx => {
      const inqSnap = await tx.get(snap.ref);
      if (!inqSnap.exists) return;
      const inq = inqSnap.data() || {};

      const inquiryPatch: Record<string, unknown> = {};
      if (typeof inq.assignedStaffId !== 'string') {
        inquiryPatch.assignedStaffId = ''; // normalise legacy / offline-queued payloads into the pool
      }

      // Idempotency: triggers may be delivered more than once.
      if (customerId && !inq.customerId) {
        const custRef = adminDb.collection('customers').doc(customerId);
        const custSnap = await tx.get(custRef);
        const contact = String(inq.phone || '').trim();
        const isEmail = contact.includes('@');

        if (custSnap.exists) {
          const cust = custSnap.data() || {};
          const custPatch: Record<string, unknown> = {
            inquiryCount: FieldValue.increment(1),
            lastActiveAt: today
          };
          if (!cust.company && inq.company) custPatch.company = String(inq.company).slice(0, 200);
          if (!cust.email && isEmail) custPatch.email = contact.slice(0, 150);
          if (!cust.phone && !isEmail) custPatch.phone = contact.slice(0, 50);
          tx.update(custRef, custPatch);
        } else {
          const isManual = Array.isArray(inq.notes) && inq.notes.length > 0;
          tx.set(custRef, {
            id: customerId,
            name: String(inq.customerName || inq.name || '匿名工程客户').slice(0, 120),
            company: String(inq.company || '').slice(0, 200),
            email: isEmail ? contact.slice(0, 150) : String(inq.buyerEmail || '').slice(0, 150),
            phone: isEmail ? '' : contact.slice(0, 50),
            country: String(inq.location || '').slice(0, 100),
            status: 'active',
            source: isManual ? '后台手工录入' : '官网询价自动建档',
            inquiryCount: 1,
            totalQuotationUsd: 0,
            registeredAt: today,
            lastActiveAt: today
          });
        }
        inquiryPatch.customerId = customerId;
        linkedNow = true;
      }

      if (Object.keys(inquiryPatch).length > 0) {
        tx.update(snap.ref, inquiryPatch);
      }
    });

    // Notify only for website inquiries (manual leads are entered by staff themselves),
    // and only on the first successful processing to avoid duplicate pings on retries.
    const isWebsiteInquiry = !(Array.isArray(initial.notes) && initial.notes.length > 0);
    if (isWebsiteInquiry && (linkedNow || !customerId)) {
      await notifyNewInquiry(inquiryId, initial);
    }
  }
);

// ---------------------------------------------------------------------------
// 6. onQuotationCreated
//    customers/{id}.totalQuotationUsd is the sum of ISSUED quotations. Sales reps cannot write the
//    customer archive (super-admin only), so the increment happens here. The customer is taken from
//    the linked LEAD (never trusted from the quotation payload). Quotations are immutable, so an
//    idempotency marker in `_processed_events` (server-only, denied to clients by the default rule)
//    guarantees a trigger retry never counts the same quotation twice.
// ---------------------------------------------------------------------------
export const onQuotationCreated = onDocumentCreated(
  { document: 'quotations/{quotationId}', database: FIRESTORE_DATABASE_ID },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const quotation = snap.data() || {};
    const leadId = String(quotation.leadId || '').trim();
    const amount = Math.max(0, Math.round(Number(quotation.totalAmountUsd) || 0));
    if (!leadId || amount <= 0) return;

    const markerRef = adminDb.collection('_processed_events').doc(`quotation_${event.params.quotationId}`);
    await adminDb.runTransaction(async tx => {
      const marker = await tx.get(markerRef);
      if (marker.exists) return; // already applied (trigger retry)

      const leadSnap = await tx.get(adminDb.collection('inquiries').doc(leadId));
      const customerId = leadSnap.exists ? String(leadSnap.get('customerId') || '') : '';
      if (customerId) {
        const custRef = adminDb.collection('customers').doc(customerId);
        const custSnap = await tx.get(custRef);
        if (custSnap.exists) {
          tx.update(custRef, {
            totalQuotationUsd: FieldValue.increment(amount),
            lastActiveAt: new Date().toISOString().slice(0, 10)
          });
        }
      }
      tx.set(markerRef, { processedAt: new Date().toISOString(), customerId: customerId || null });
    });
  }
);

// ---------------------------------------------------------------------------
// 7. Buyer sign-up with an image captcha
//
//    getSignupCaptcha()               -> { id, svg }: a 5-character picture, valid 5 minutes
//    registerBuyer({ name, email, password, country, dialCode, whatsapp, captchaId, captchaAnswer })
//                                     -> checks the captcha, creates the Auth user, the buyers/{uid}
//                                        profile and the CRM customer record, all server-side.
//
//    The picture is drawn as SVG *paths* only (no text elements), with per-glyph rotation, jitter and noise
//    curves, so the answer is not readable from the markup. Answers are stored hashed in
//    `signup_captchas` (denied to every client by the default rule). Every captcha works once:
//    a wrong answer burns it and the website loads a new one. Limit: 60 pictures per IP per
//    10 minutes. Expired documents carry `expireAt` for an optional Firestore TTL policy.
// ---------------------------------------------------------------------------
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LENGTH = 5;
const CAPTCHA_MAX_PER_IP = 60;
const CAPTCHA_IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Stroke font on a 10×14 grid. Look-alike characters (0/O, 1/I/L, 2/Z, 5/S, 8/B, U/V…) are left out. */
const CAPTCHA_GLYPHS: Record<string, number[][]> = {
  '2': [[0, 3, 2, 0, 8, 0, 10, 3, 10, 5, 0, 14, 10, 14]],
  '3': [[0, 1, 3, 0, 8, 0, 10, 2, 10, 5, 7, 7, 3, 7], [7, 7, 10, 9, 10, 12, 8, 14, 2, 14, 0, 13]],
  '4': [[8, 14, 8, 0, 0, 10, 10, 10]],
  '6': [[9, 1, 6, 0, 3, 0, 1, 3, 0, 7, 0, 11, 2, 14, 8, 14, 10, 11, 10, 9, 8, 7, 2, 7, 0, 9]],
  '7': [[0, 0, 10, 0, 4, 14]],
  '9': [[10, 5, 8, 7, 2, 7, 0, 5, 0, 3, 2, 0, 8, 0, 10, 3, 10, 9, 8, 13, 5, 14, 2, 13]],
  A: [[0, 14, 5, 0, 10, 14], [2, 9, 8, 9]],
  C: [[10, 2, 7, 0, 3, 0, 0, 3, 0, 11, 3, 14, 7, 14, 10, 12]],
  E: [[10, 0, 0, 0, 0, 14, 10, 14], [0, 7, 7, 7]],
  F: [[10, 0, 0, 0, 0, 14], [0, 7, 7, 7]],
  H: [[0, 0, 0, 14], [10, 0, 10, 14], [0, 7, 10, 7]],
  K: [[0, 0, 0, 14], [10, 0, 0, 8], [3, 6, 10, 14]],
  M: [[0, 14, 0, 0, 5, 8, 10, 0, 10, 14]],
  N: [[0, 14, 0, 0, 10, 14, 10, 0]],
  P: [[0, 14, 0, 0, 7, 0, 10, 2, 10, 5, 7, 7, 0, 7]],
  R: [[0, 14, 0, 0, 7, 0, 10, 2, 10, 5, 7, 7, 0, 7], [5, 7, 10, 14]],
  T: [[0, 0, 10, 0], [5, 0, 5, 14]],
  W: [[0, 0, 2, 14, 5, 5, 8, 14, 10, 0]],
  X: [[0, 0, 10, 14], [10, 0, 0, 14]],
  Y: [[0, 0, 5, 7, 10, 0], [5, 7, 5, 14]]
};
const CAPTCHA_CHARS = Object.keys(CAPTCHA_GLYPHS);

const rand = (min: number, max: number) => min + (randomInt(0, 1_000_000) / 1_000_000) * (max - min);
const fmt = (n: number) => n.toFixed(1);

/** Draws `text` as a 160×56 SVG made only of paths. */
function renderCaptchaSvg(text: string): string {
  const W = 160;
  const H = 56;
  const inks = ['#0e1b32', '#1f5fd7', '#334a5c', '#7a2e8a', '#0f6b5c'];
  const parts: string[] = [];

  // Background speckle and curves that cross the glyphs.
  for (let i = 0; i < 40; i++) {
    parts.push(`<circle cx="${fmt(rand(0, W))}" cy="${fmt(rand(0, H))}" r="${fmt(rand(0.6, 1.6))}" fill="${inks[randomInt(0, inks.length)]}" opacity="${fmt(rand(0.15, 0.4))}"/>`);
  }
  const curve = (width: number, opacity: number) =>
    `<path d="M${fmt(rand(-5, 15))} ${fmt(rand(5, H - 5))} C${fmt(rand(30, 70))} ${fmt(rand(-10, H + 10))} ${fmt(rand(90, 130))} ${fmt(rand(-10, H + 10))} ${fmt(rand(145, W + 5))} ${fmt(rand(5, H - 5))}" fill="none" stroke="${inks[randomInt(0, inks.length)]}" stroke-width="${fmt(width)}" opacity="${fmt(opacity)}" stroke-linecap="round"/>`;
  for (let i = 0; i < 3; i++) parts.push(curve(rand(1, 1.8), rand(0.35, 0.6)));

  const cell = (W - 20) / text.length;
  [...text].forEach((ch, i) => {
    const scale = rand(1.95, 2.35);
    const angle = (rand(-16, 16) * Math.PI) / 180;
    const skew = rand(-0.2, 0.2);
    const cx = 10 + cell * i + cell / 2 + rand(-2, 2);
    const cy = H / 2 + rand(-3, 3);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const point = (gx: number, gy: number) => {
      // Centre the 10×14 glyph, jitter, skew, scale, rotate, then place.
      let x = gx - 5 + rand(-0.5, 0.5);
      const y = gy - 7 + rand(-0.5, 0.5);
      x += skew * y;
      const sx = x * scale;
      const sy = y * scale;
      return `${fmt(cx + sx * cos - sy * sin)} ${fmt(cy + sx * sin + sy * cos)}`;
    };
    const d = CAPTCHA_GLYPHS[ch]
      .map(stroke => {
        const pts: string[] = [];
        for (let k = 0; k < stroke.length; k += 2) pts.push(point(stroke[k], stroke[k + 1]));
        return `M${pts.join('L')}`;
      })
      .join('');
    parts.push(`<path d="${d}" fill="none" stroke="${inks[randomInt(0, inks.length)]}" stroke-width="${fmt(rand(2.6, 3.4))}" stroke-linecap="round" stroke-linejoin="round"/>`);
  });

  for (let i = 0; i < 2; i++) parts.push(curve(rand(1.2, 2), rand(0.45, 0.7)));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#eef4f8"/>${parts.join('')}</svg>`;
}

type SignupErrorCode = 'invalid-argument' | 'already-exists' | 'resource-exhausted' | 'permission-denied' | 'internal';

/** Machine-readable reason for the website to show the right message in the visitor's language. */
function signupError(code: SignupErrorCode, reason: string, message: string): HttpsError {
  return new HttpsError(code, message, { reason });
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function cleanEmailInput(raw: unknown): string {
  const email = String(raw || '').trim().toLowerCase();
  if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) {
    throw signupError('invalid-argument', 'invalid_email', 'Invalid email address.');
  }
  if (isReservedStaffEmail(email)) {
    throw signupError('invalid-argument', 'reserved_email', 'This email domain cannot be used for buyer accounts.');
  }
  return email;
}

async function emailAlreadyRegistered(email: string): Promise<boolean> {
  try {
    await adminAuth.getUserByEmail(email);
    return true;
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') return false;
    throw err;
  }
}

/**
 * The visitor's address. Behind Google's front end `req.ip` can be the proxy, which would put every
 * visitor in one rate-limit bucket, so the first X-Forwarded-For hop is preferred.
 */
function clientIp(raw: any): string {
  const forwarded = String(raw?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(raw?.ip || 'unknown');
}

export const getSignupCaptcha = onCall(async request => {
  const now = Date.now();
  const ip = clientIp(request.rawRequest);
  const ipRef = adminDb.collection('signup_captchas').doc(`ip_${sha256(ip).slice(0, 32)}`);
  await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ipRef);
    const windowStart = Number(snap.get('windowStart') || 0);
    const count = now - windowStart < CAPTCHA_IP_WINDOW_MS ? Number(snap.get('count') || 0) : 0;
    if (count >= CAPTCHA_MAX_PER_IP) {
      throw signupError('resource-exhausted', 'too_many', 'Too many requests. Please try again later.');
    }
    tx.set(ipRef, {
      count: count + 1,
      windowStart: count === 0 ? now : windowStart,
      expireAt: Timestamp.fromMillis(now + CAPTCHA_IP_WINDOW_MS)
    });
  });

  let text = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) text += CAPTCHA_CHARS[randomInt(0, CAPTCHA_CHARS.length)];
  const ref = adminDb.collection('signup_captchas').doc();
  await ref.set({
    answerHash: sha256(`${ref.id}:${text}`),
    expiresAt: now + CAPTCHA_TTL_MS,
    expireAt: Timestamp.fromMillis(now + CAPTCHA_TTL_MS)
  });
  return { id: ref.id, svg: renderCaptchaSvg(text) };
});

export const registerBuyer = onCall(async request => {
  const data = (request.data || {}) as Record<string, unknown>;
  const email = cleanEmailInput(data.email);
  const name = String(data.name || '').trim().slice(0, 120);
  const password = String(data.password || '');
  const country = String(data.country || '').trim().slice(0, 100);
  const dialCode = String(data.dialCode || '').replace(/\D/g, '');
  const localNumber = String(data.whatsapp || '').replace(/\D/g, '').replace(/^0+/, '');
  const captchaId = String(data.captchaId || '').trim();
  const captchaAnswer = String(data.captchaAnswer || '').trim().toUpperCase();

  if (name.length < 2) throw signupError('invalid-argument', 'invalid_name', 'Please enter your name.');
  if (password.trim().length < MIN_PASSWORD_LENGTH || password.length > 128) {
    throw signupError('invalid-argument', 'weak_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!country) throw signupError('invalid-argument', 'invalid_country', 'Please choose your country.');
  if (!/^\d{1,4}$/.test(dialCode) || localNumber.length < 5 || dialCode.length + localNumber.length > 15) {
    throw signupError('invalid-argument', 'invalid_whatsapp', 'Please enter a valid WhatsApp number.');
  }
  const whatsapp = `+${dialCode} ${localNumber}`;
  if (!captchaAnswer || !/^[A-Za-z0-9]{1,40}$/.test(captchaId)) {
    throw signupError('invalid-argument', 'captcha_invalid', 'The characters in the picture do not match.');
  }

  // Each captcha works once: read and delete it in one transaction, then compare.
  const captchaRef = adminDb.collection('signup_captchas').doc(captchaId);
  const captcha = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(captchaRef);
    if (snap.exists) tx.delete(captchaRef);
    return snap.exists ? { answerHash: String(snap.get('answerHash') || ''), expiresAt: Number(snap.get('expiresAt') || 0) } : null;
  });
  if (!captcha || !captcha.answerHash) {
    throw signupError('permission-denied', 'captcha_expired', 'The picture has expired. Please use the new one.');
  }
  if (captcha.expiresAt < Date.now()) {
    throw signupError('permission-denied', 'captcha_expired', 'The picture has expired. Please use the new one.');
  }
  const expected = Buffer.from(captcha.answerHash, 'hex');
  const actual = Buffer.from(sha256(`${captchaId}:${captchaAnswer}`), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw signupError('permission-denied', 'captcha_invalid', 'The characters in the picture do not match.');
  }

  if (await emailAlreadyRegistered(email)) {
    throw signupError('already-exists', 'email_taken', 'This email is already registered.');
  }

  let uid = '';
  try {
    const created = await adminAuth.createUser({ email, password, displayName: name, emailVerified: false });
    uid = created.uid;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') {
      throw signupError('already-exists', 'email_taken', 'This email is already registered.');
    }
    if (err?.code === 'auth/invalid-password') {
      throw signupError('invalid-argument', 'weak_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    throw signupError('internal', 'create_failed', 'The account could not be created. Please try again.');
  }

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  try {
    const batch = adminDb.batch();
    batch.set(adminDb.collection('buyers').doc(uid), {
      id: uid,
      uid,
      email,
      name,
      company: '',
      phone: whatsapp,
      country,
      role: '官网注册买家',
      registeredAt: nowIso,
      updatedAt: nowIso
    });
    batch.set(
      adminDb.collection('customers').doc(`CUST-${uid}`),
      {
        id: `CUST-${uid}`,
        name,
        company: '',
        email,
        phone: whatsapp,
        country,
        status: 'active',
        source: '官网买家注册',
        inquiryCount: 0,
        totalQuotationUsd: 0,
        registeredAt: today,
        lastActiveAt: today
      },
      { merge: true }
    );
    await batch.commit();
  } catch (err) {
    // Never leave an account without its profile: roll back so the visitor can simply retry.
    await adminAuth.deleteUser(uid).catch(() => {});
    console.error('registerBuyer profile write failed:', err);
    throw signupError('internal', 'create_failed', 'The account could not be created. Please try again.');
  }

  return { uid };
});
