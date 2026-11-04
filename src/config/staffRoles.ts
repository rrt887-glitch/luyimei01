import type { StaffRole } from '../types/admin';

/**
 * Console roles.
 *  - 超级管理员: everything.
 *  - 销售代表:   商机线索 (pool + own), 报价单 (own), 客户档案 (customers of their own leads).
 *  - 运营:       商品库 and 官网内容 (website content, categories, the floating widget).
 * Mirrors firestore.rules (isAdmin / isActiveStaff / isContentEditor) and functions/src/index.ts.
 */
export const STAFF_ROLES: StaffRole[] = ['super_admin', 'sales_rep', 'operator'];

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: '超级管理员',
  sales_rep: '销售代表',
  operator: '运营'
};

export const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  super_admin: '全部功能：经营概览、商机线索、报价单、客户档案、商品库、官网内容、团队与权限、操作日志。',
  sales_rep: '商机线索（公海和自己名下，可认领公海线索）、报价单（自己开的）、客户档案（自己名下线索的客户）。',
  operator: '商品库（含分类、Excel 批量上架、图片视频）和官网内容（工厂介绍、公司新闻、右下角浮窗）。'
};

export const normalizeRole = (raw: unknown): StaffRole => (raw === 'super_admin' || raw === 'operator' ? raw : 'sales_rep');
export const roleLabel = (role: unknown) => ROLE_LABEL[normalizeRole(role)];

/** May edit products, categories and website content. */
export const canEditCatalog = (role: StaffRole | undefined | null) => role === 'super_admin' || role === 'operator';
/** Works with leads and quotations (and may be given leads). */
export const canSell = (role: StaffRole | undefined | null) => role === 'super_admin' || role === 'sales_rep';
