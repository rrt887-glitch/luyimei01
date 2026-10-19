import type { StaffRole } from '../types/admin';

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'leads'
  | 'customers'
  | 'quotation'
  | 'team'
  | 'audit';

/**
 * Which console tabs each role may open. Mirrors firestore.rules:
 *  - products / site config / customers / audit logs are super-admin only (reads AND writes);
 *  - sales reps work on leads (pool + own), quotations (own) and can view the team directory.
 */
const TABS_BY_ROLE: Record<StaffRole, AdminTab[]> = {
  super_admin: ['dashboard', 'products', 'leads', 'customers', 'quotation', 'team', 'audit'],
  sales_rep: ['dashboard', 'leads', 'quotation', 'team']
};

export function getAllowedAdminTabs(role: StaffRole | '' | undefined | null): AdminTab[] {
  return role ? TABS_BY_ROLE[role] : [];
}

export function isAdminTabAllowed(tab: AdminTab, role: StaffRole | '' | undefined | null): boolean {
  return getAllowedAdminTabs(role).includes(tab);
}
