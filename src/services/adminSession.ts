import { StaffAccount, StaffRole } from '../types/admin';
import { isReservedStaffEmail } from '../config/appConfig';
import { normalizePhoneDigits } from './admin/adminShared';

/**
 * The staff console session as the public website needs to know it: whether someone is signed in
 * to the console in this tab, and how to forget that session. Kept separate from the console's
 * services so visitors never download them.
 */
export const ADMIN_SESSION_KEY = 'lym_admin_session_v4';

/** Everything the console caches in this browser (CRM contacts must not outlive the session). */
const ADMIN_CACHE_KEYS = [
  'lym_staff_readonly_v4',
  'lym_leads_readonly_v4',
  'lym_customers_readonly_v4',
  'lym_audit_readonly_v4',
  // Older versions
  'lym_staff_data',
  'lym_staff_directory_sanitized_v2',
  'lym_admin_session',
  'lym_admin_leads',
  'lym_leads_data',
  'lym_admin_customers',
  'lym_admin_audit'
];

/** Fired on window whenever the console session is cleared, so loaded console services drop their data. */
export const ADMIN_SESSION_CLEARED_EVENT = 'lym:admin-session-cleared';

export function sanitizeStaffProfile(raw: Record<string, any>, fallbackUid?: string): StaffAccount {
  const uid = String(raw.uid || raw.id || fallbackUid || '').trim();
  const role: StaffRole = raw.role === 'super_admin' ? 'super_admin' : 'sales_rep';
  const status: 'active' | 'suspended' = raw.status === 'suspended' ? 'suspended' : 'active';
  const lastLogin = String(raw.lastLogin || raw.lastLoginAt || '尚未登录');
  const defaultName = role === 'super_admin' ? '系统超级管理员' : '未命名员工';
  return {
    id: uid,
    uid,
    name: String(raw.name || defaultName).trim() || defaultName,
    email: String(raw.email || '').trim(),
    phone: normalizePhoneDigits(String(raw.phone || '')),
    role,
    status,
    assignedLeadsCount: typeof raw.assignedLeadsCount === 'number' ? raw.assignedLeadsCount : 0,
    lastLoginAt: lastLogin
  };
}

export function readAdminSession(): StaffAccount | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffAccount;
    if (!parsed || !parsed.id || !parsed.uid) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return sanitizeStaffProfile(parsed);
  } catch {
    return null;
  }
}

export function writeAdminSession(staff: StaffAccount): StaffAccount {
  const sanitized = sanitizeStaffProfile(staff);
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sanitized));
  } catch {
    // Private mode: the session lives in memory only.
  }
  return sanitized;
}

export const hasAdminSession = () => readAdminSession() !== null;

/** Forgets the console session and every console cache in this browser (does not sign out of Auth). */
export function purgeAdminStorage(): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    ADMIN_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
  } catch {
    // Ignore
  }
  window.dispatchEvent(new Event(ADMIN_SESSION_CLEARED_EVENT));
}

/** Staff sign in with their mobile number (or a reserved staff email), buyers with an email. */
export function looksLikeStaffAccount(input: string): boolean {
  const trimmed = (input || '').trim().toLowerCase();
  if (!trimmed) return false;
  if (isReservedStaffEmail(trimmed)) return true;
  return !trimmed.includes('@') && normalizePhoneDigits(trimmed).length >= 6;
}
