import type { StaffRole } from '../types/admin';

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'leads'
  | 'customers'
  | 'quotation'
  | 'team'
  | 'audit'
  | 'content';

/**
 * Which console tabs each role may open (see src/config/staffRoles.ts). Mirrors firestore.rules:
 *  - super admins: everything;
 *  - sales reps: leads (pool + own), quotations (own), customers of their own leads;
 *  - operators: products and website content.
 * Everyone edits their own name, login phone and password from「我的账号」(not a tab).
 */
const TABS_BY_ROLE: Record<StaffRole, AdminTab[]> = {
  super_admin: ['dashboard', 'products', 'content', 'leads', 'customers', 'quotation', 'team', 'audit'],
  sales_rep: ['leads', 'quotation', 'customers'],
  operator: ['products', 'content']
};

/** The tab a role lands on. */
export function defaultAdminTab(role: StaffRole | '' | undefined | null): AdminTab {
  return getAllowedAdminTabs(role)[0] || 'dashboard';
}

export function getAllowedAdminTabs(role: StaffRole | '' | undefined | null): AdminTab[] {
  return role ? TABS_BY_ROLE[role] : [];
}

export function isAdminTabAllowed(tab: AdminTab, role: StaffRole | '' | undefined | null): boolean {
  return getAllowedAdminTabs(role).includes(tab);
}
