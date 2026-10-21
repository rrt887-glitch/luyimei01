import { StaffAccount, StaffRole } from '../../types/admin';
import { db, auth } from '../firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { validatePasswordStrength } from '../../utils/crypto';
import {
  withTimeout,
  ADMIN_OPERATION_TIMEOUT_MS,
  normalizePhoneDigits,
  phoneToStaffAuthEmail
} from './adminShared';
import { adminFunctions } from './adminFunctions';
import { AuditLogDomainService } from './auditLogService';
import { purgeAdminStorage, readAdminSession, sanitizeStaffProfile, writeAdminSession, looksLikeStaffAccount } from '../adminSession';

const STAFF_CACHE_KEY = 'lym_staff_readonly_v4';
const LEGACY_STORAGE_KEYS = ['lym_staff_data', 'lym_staff_directory_sanitized_v2', 'lym_admin_session'];

export { sanitizeStaffProfile };

type LoginResult = { success: boolean; staff?: StaffAccount; message: string };

/**
 * Staff session & RBAC directory.
 *
 * Authorization model (same as firestore.rules / storage.rules / Cloud Functions):
 *   a person is staff if and only if an ACTIVE `staff/{uid}` document exists.
 *   Custom Claims are never consulted for access decisions.
 *
 * All identity mutations (create / delete / status / password) go through `adminFunctions`
 * (Admin SDK). There is intentionally no client-side fallback for them.
 */
export class StaffAuthDomainService {
  private staffList: StaffAccount[] = [];
  private currentStaff: StaffAccount | null = null;
  private auditLogger: AuditLogDomainService;

  constructor(auditLogger: AuditLogDomainService) {
    this.auditLogger = auditLogger;

    try {
      LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    } catch {
      // Ignore
    }

    const activeSession = this.getAdminSession();
    this.currentStaff = activeSession;

    if (this.currentStaff) {
      try {
        const savedStaff = localStorage.getItem(STAFF_CACHE_KEY);
        const parsed = savedStaff ? JSON.parse(savedStaff) : null;
        if (Array.isArray(parsed)) {
          const me = this.currentStaff;
          this.staffList = parsed
            .filter((s: any) => s && (s.uid || s.id))
            .map((s: any) => sanitizeStaffProfile(s))
            // A sales rep never sees colleagues, not even from a cache left by an admin session.
            .filter(s => me.role === 'super_admin' || s.id === me.id);
        }
      } catch {
        this.staffList = [];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Local cache & session
  // ---------------------------------------------------------------------------

  private saveReadOnlyStaffCache() {
    try {
      if (this.currentStaff) {
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(this.staffList));
      }
    } catch {
      // Ignore
    }
  }

  private requireSuperAdmin(action: string): StaffAccount {
    if (!this.currentStaff || this.currentStaff.role !== 'super_admin') {
      throw new Error(`越权拦截：仅超级管理员有权${action}！`);
    }
    return this.currentStaff;
  }

  /** Only `lastLoginAt` / `updatedAt` may be self-updated (enforced by firestore.rules). */
  private async touchLastLogin(uid: string, nowIso: string): Promise<void> {
    await withTimeout(
      updateDoc(doc(db, 'staff', uid), { lastLoginAt: nowIso, updatedAt: nowIso }),
      ADMIN_OPERATION_TIMEOUT_MS
    );
  }

  getAdminSession(): StaffAccount | null {
    return readAdminSession();
  }

  setAdminSession(staff: StaffAccount): void {
    this.currentStaff = writeAdminSession(staff);
  }

  /** Drops in-memory session data (the browser storage was already cleared). */
  forgetSession(): void {
    this.currentStaff = null;
    this.staffList = [];
  }

  /**
   * Clear admin session AND purge cached console data, then (by default) sign out of Firebase Auth.
   * Pass `signOutAuth = false` when another sign-in (e.g. a buyer login) is about to replace the user.
   */
  clearAdminSession(signOutAuth = true): void {
    this.forgetSession();
    purgeAdminStorage();
    if (signOutAuth) {
      signOut(auth).catch(() => {});
    }
  }

  getCurrentStaff(): StaffAccount | null {
    if (!this.currentStaff) {
      this.currentStaff = this.getAdminSession();
    }
    return this.currentStaff;
  }

  // ---------------------------------------------------------------------------
  // Directory
  // ---------------------------------------------------------------------------

  subscribeToStaff(
    onUpdate: (staffList: StaffAccount[]) => void,
    onError?: (err: Error) => void,
    getAssignedLeadsCount?: (staffId: string) => number
  ): () => void {
    if (!auth.currentUser) {
      return () => {};
    }

    // Sales reps may read only their own staff record (firestore.rules): their "directory" is themselves.
    if (this.currentStaff?.role !== 'super_admin') {
      const uid = auth.currentUser.uid;
      return onSnapshot(
        doc(db, 'staff', uid),
        snap => {
          const me = snap.exists() ? sanitizeStaffProfile(snap.data(), snap.id) : null;
          if (me && getAssignedLeadsCount) me.assignedLeadsCount = getAssignedLeadsCount(me.id);
          this.staffList = me ? [me] : [];
          this.saveReadOnlyStaffCache();
          if (me) this.setAdminSession(me);
          onUpdate(this.staffList);
        },
        err => {
          console.warn('Firestore own staff record listener warning:', err);
          onError?.(err);
        }
      );
    }

    return onSnapshot(
      collection(db, 'staff'),
      snapshot => {
        const cloudStaff: StaffAccount[] = [];
        snapshot.forEach(docSnap => {
          const sanitized = sanitizeStaffProfile(docSnap.data(), docSnap.id);
          if (!sanitized.id) return;
          if (getAssignedLeadsCount) {
            sanitized.assignedLeadsCount = getAssignedLeadsCount(sanitized.id);
          }
          cloudStaff.push(sanitized);
        });

        this.staffList = cloudStaff;
        this.saveReadOnlyStaffCache();

        if (this.currentStaff) {
          const me = this.staffList.find(s => s.id === this.currentStaff?.id);
          if (me) {
            this.setAdminSession(me);
          }
        }

        onUpdate(this.staffList);
      },
      err => {
        console.warn('Firestore staff listener warning:', err);
        onError?.(err);
      }
    );
  }

  /**
   * Watches the signed-in person's OWN staff document. firestore.rules let everyone read their own
   * staff document whatever its status, so a suspension or removal arrives here at once — unlike
   * the directory listener above, which a suspended person may no longer read (that listener just
   * fails with permission-denied and never delivers the change).
   */
  subscribeToOwnStaffDoc(
    uid: string,
    onChange: (state: { status: 'active' | 'suspended' | 'deleted'; staff?: StaffAccount }) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!uid || !auth.currentUser) return () => {};
    return onSnapshot(
      doc(db, 'staff', uid),
      snap => {
        if (!snap.exists()) {
          onChange({ status: 'deleted' });
          return;
        }
        const staff = sanitizeStaffProfile(snap.data(), snap.id);
        onChange({ status: staff.status === 'suspended' ? 'suspended' : 'active', staff });
      },
      err => {
        console.warn('Own staff record listener warning:', err);
        onError?.(err);
      }
    );
  }

  getStaffList(getAssignedLeadsCount?: (staffId: string) => number): StaffAccount[] {
    if (getAssignedLeadsCount) {
      return this.staffList.map(s => ({ ...s, assignedLeadsCount: getAssignedLeadsCount(s.id) }));
    }
    return [...this.staffList];
  }

  isStaffIdentifier(input: string): boolean {
    if (looksLikeStaffAccount(input)) return true;
    const trimmed = (input || '').trim().toLowerCase();
    return this.staffList.some(s => s.email && s.email.toLowerCase() === trimmed);
  }

  // ---------------------------------------------------------------------------
  // Session validation & login
  // ---------------------------------------------------------------------------

  async validateCurrentSession(): Promise<{
    valid: boolean;
    reason?: 'deleted' | 'suspended' | 'expired' | 'unauthenticated' | 'network_error';
    staff?: StaffAccount;
  }> {
    const session = this.getAdminSession();
    if (!session) {
      return { valid: false, reason: 'expired' };
    }

    // Right after a page reload Firebase Auth restores the user asynchronously;
    // wait for it instead of mistaking "not restored yet" for "signed out".
    await auth.authStateReady().catch(() => {});
    const fbUser = auth.currentUser;
    if (!fbUser || fbUser.uid !== session.uid) {
      this.clearAdminSession();
      return { valid: false, reason: 'unauthenticated' };
    }

    let docSnap;
    try {
      docSnap = await withTimeout(getDoc(doc(db, 'staff', fbUser.uid)), ADMIN_OPERATION_TIMEOUT_MS);
    } catch (err) {
      // Transient network problem: keep the session so the user can simply retry.
      console.warn('Staff session validation network warning:', err);
      return { valid: false, reason: 'network_error' };
    }

    if (!docSnap.exists()) {
      this.clearAdminSession();
      return { valid: false, reason: 'deleted' };
    }

    const cloudStaff = sanitizeStaffProfile(docSnap.data(), fbUser.uid);
    if (cloudStaff.status === 'suspended') {
      this.clearAdminSession();
      return { valid: false, reason: 'suspended' };
    }

    this.setAdminSession(cloudStaff);
    return { valid: true, staff: cloudStaff };
  }

  async loginStaff(accountInput: string, passwordInput: string): Promise<LoginResult> {
    const rawAccount = (accountInput || '').trim();
    if (!rawAccount) {
      return { success: false, message: '请输入管理员邮箱或已开通的员工手机号' };
    }

    const passCheck = validatePasswordStrength(passwordInput);
    if (!passCheck.valid) {
      return {
        success: false,
        message: passCheck.message || '请输入有效的登录密码（不少于 8 位字符）'
      };
    }

    const firebaseAuthEmail = rawAccount.includes('@')
      ? rawAccount.toLowerCase()
      : phoneToStaffAuthEmail(rawAccount);

    let uid: string;
    try {
      const credential = await withTimeout(
        signInWithEmailAndPassword(auth, firebaseAuthEmail, passCheck.trimmed),
        10000
      );
      uid = credential.user.uid;
    } catch (err: any) {
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/user-disabled'
      ) {
        return { success: false, message: '认证失败：账号或密码不正确，或账号已被停用。' };
      }
      if (code === 'auth/too-many-requests') {
        return {
          success: false,
          message: '安全锁定：密码连续错误次数过多，已被 Firebase Auth 暂时封禁，请稍后再试。'
        };
      }
      return { success: false, message: `登录验证未通过：${err?.message || '请检查网络连接或账号配置'}` };
    }

    try {
      const staffSnap = await withTimeout(getDoc(doc(db, 'staff', uid)), ADMIN_OPERATION_TIMEOUT_MS);
      if (!staffSnap.exists()) {
        await signOut(auth).catch(() => {});
        return { success: false, message: '拒绝访问：该账号未获得管理中台通行授权，请联系系统管理员开通。' };
      }

      const staffProfile = sanitizeStaffProfile(staffSnap.data(), uid);
      if (staffProfile.status === 'suspended') {
        await signOut(auth).catch(() => {});
        return { success: false, message: `账号 [${staffProfile.name}] 已被停用冻结，无权进入中台！` };
      }

      const nowIso = new Date().toISOString();
      staffProfile.lastLoginAt = nowIso;
      await this.touchLastLogin(uid, nowIso).catch(err => {
        console.warn('lastLoginAt update warning:', err);
      });

      this.staffList =
        staffProfile.role === 'super_admin' ? [staffProfile, ...this.staffList.filter(s => s.id !== staffProfile.id)] : [staffProfile];
      this.setAdminSession(staffProfile);
      this.saveReadOnlyStaffCache();
      this.auditLogger.logAction(
        staffProfile,
        '安全登录中台',
        staffProfile.name,
        `Firebase Auth 核验通过 (UID: ${uid.slice(0, 8)}...)`
      );

      return {
        success: true,
        staff: staffProfile,
        message: `欢迎回来，${staffProfile.name}（${
          staffProfile.role === 'super_admin' ? '超级管理员' : '销售代表'
        }）`
      };
    } catch (err: any) {
      await signOut(auth).catch(() => {});
      return { success: false, message: `读取员工档案失败：${err?.message || '请检查网络连接'}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Identity mutations (server-only via Cloud Functions)
  // ---------------------------------------------------------------------------

  async addStaffAccount(data: {
    name: string;
    phone: string;
    email?: string;
    password?: string;
    role: StaffRole;
  }): Promise<StaffAccount> {
    const actor = this.requireSuperAdmin('开通员工账号');

    const cleanPhone = normalizePhoneDigits(data.phone);
    if (!cleanPhone || cleanPhone.length < 6) {
      throw new Error('请输入有效的员工手机号码！');
    }

    const passCheck = validatePasswordStrength(data.password);
    if (!passCheck.valid) {
      throw new Error(passCheck.message || '请设置不少于 8 位字符的员工初始登录密码。');
    }

    if (this.staffList.some(s => s.phone && normalizePhoneDigits(s.phone) === cleanPhone)) {
      throw new Error(`手机号 ${cleanPhone} 已绑定现有员工账号，请勿重复添加！`);
    }

    const result = await adminFunctions.createStaff({
      name: data.name.trim(),
      phone: cleanPhone,
      email: data.email?.trim() || undefined,
      password: passCheck.trimmed,
      role: data.role
    });

    const created = sanitizeStaffProfile(result.staff, result.staff.uid || result.staff.id);
    this.staffList = [created, ...this.staffList.filter(s => s.id !== created.id)];
    this.saveReadOnlyStaffCache();
    this.auditLogger.logAction(actor, '开通员工账号', created.name, `角色: ${created.role} | 登录手机: ${created.phone}`);
    return created;
  }

  async toggleStaffStatus(staffId: string): Promise<void> {
    const s = this.staffList.find(item => item.id === staffId);
    if (!s) return;
    await this.updateStaffStatus(staffId, s.status === 'active' ? 'suspended' : 'active');
  }

  async updateStaffStatus(staffId: string, status: 'active' | 'suspended'): Promise<void> {
    await this.batchUpdateStaffStatus([staffId], status);
  }

  async batchUpdateStaffStatus(staffIds: string[], status: 'active' | 'suspended'): Promise<number> {
    const actor = this.requireSuperAdmin('调整员工在职状态');

    let targets = this.staffList.filter(s => staffIds.includes(s.id) && s.status !== status);
    if (status === 'suspended' && targets.some(s => s.id === actor.id)) {
      targets = targets.filter(s => s.id !== actor.id);
      if (targets.length === 0) {
        throw new Error('安全保护：不能停用当前正在登录操作的管理员自身账号！');
      }
    }
    if (targets.length === 0) return 0;

    const res = await adminFunctions.updateStaffStatus(
      targets.map(s => s.id),
      status
    );

    const updated = new Set(res.updatedIds);
    this.staffList.forEach(s => {
      if (updated.has(s.id)) s.status = status;
    });
    this.saveReadOnlyStaffCache();

    if (res.count > 0) {
      const names = targets.filter(s => updated.has(s.id)).map(s => s.name);
      const label = (st: string) => (st === 'active' ? '在职' : '停用');
      this.auditLogger.logAction(
        actor,
        res.count > 1 ? '批量调整员工状态' : '调整员工状态',
        names.join('、') || `共 ${res.count} 位员工`,
        `状态：${label(status === 'active' ? 'suspended' : 'active')} → ${label(status)}${status === 'suspended' ? '（账号已立即下线，无法再登录）' : ''}`
      );
    }
    return res.count;
  }

  async deleteStaff(staffId: string): Promise<boolean> {
    const actor = this.requireSuperAdmin('删除员工账号');
    if (actor.id === staffId) return false;
    const res = await this.batchDeleteStaff([staffId]);
    return res.successCount > 0;
  }

  async batchDeleteStaff(staffIds: string[]): Promise<{ successCount: number; skippedCurrent: boolean }> {
    const actor = this.requireSuperAdmin('删除员工账号');

    const skippedCurrent = staffIds.includes(actor.id);
    const targetIds = staffIds.filter(id => id && id !== actor.id);
    if (targetIds.length === 0) {
      return { successCount: 0, skippedCurrent };
    }

    const res = await adminFunctions.deleteStaff(targetIds);
    const deleted = new Set(res.deletedIds);
    const deletedNames = this.staffList.filter(s => deleted.has(s.id)).map(s => s.name);

    this.staffList = this.staffList.filter(s => !deleted.has(s.id));
    this.saveReadOnlyStaffCache();

    if (res.successCount > 0) {
      this.auditLogger.logAction(
        actor,
        res.successCount > 1 ? '批量删除员工账号' : '删除员工账号',
        deletedNames.join('、') || `共 ${res.successCount} 位员工`,
        `已同时删除登录账号与员工档案，释放线索 ${res.releasedLeadCount} 条归入公海`
      );
    }

    return { successCount: res.successCount, skippedCurrent: skippedCurrent || res.skippedCurrent };
  }

  async resetStaffPassword(staffId: string, newPassword: string): Promise<boolean> {
    const actor = this.requireSuperAdmin('重置员工登录密码');

    const passCheck = validatePasswordStrength(newPassword);
    if (!passCheck.valid) {
      throw new Error(passCheck.message || '新密码不能少于 8 位字符');
    }

    const target = this.staffList.find(s => s.id === staffId);
    if (!target) {
      throw new Error('未找到目标员工档案。');
    }

    await adminFunctions.resetStaffPassword(target.id, passCheck.trimmed);

    this.auditLogger.logAction(
      actor,
      '重置员工登录密码',
      `${target.name} (${target.phone})`,
      '已通过后台服务更新密码，并强制该员工所有设备重新登录'
    );
    return true;
  }
}
