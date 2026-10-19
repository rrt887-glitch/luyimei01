import { CustomerProfile, StaffAccount } from '../../types/admin';
import { db, auth } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { sanitizeCustomerForFirestore } from '../../utils/firestoreSanitizer';
import { withTimeout, ADMIN_OPERATION_TIMEOUT_MS } from './adminShared';
import { LISTENER_LIMITS } from '../../config/appConfig';
import { AuditLogDomainService } from './auditLogService';

const CUSTOMER_STATUS_LABEL: Record<string, string> = { active: '正常', vip: '重点客户', frozen: '已冻结' };

const CUSTOMERS_CACHE_KEY = 'lym_customers_readonly_v4';

export function sanitizeCustomerFromCloud(
  raw: Record<string, any>,
  fallbackId?: string
): CustomerProfile {
  const id = String(fallbackId || raw.id || '').trim();
  const validStatuses: CustomerProfile['status'][] = ['active', 'vip', 'frozen'];
  const status: CustomerProfile['status'] = validStatuses.includes(raw.status)
    ? raw.status
    : 'active';

  return {
    id,
    name: String(raw.name || raw.contactName || '海外工程客户').trim(),
    company: String(raw.company || raw.companyName || '待确认企业').trim(),
    email: String(raw.email || '').trim(),
    phone: String(raw.phone || '').trim(),
    country: String(raw.country || '中国 / Global').trim(),
    status,
    source: String(raw.source || '官网工程询盘').trim(),
    inquiryCount:
      typeof raw.inquiryCount === 'number'
        ? raw.inquiryCount
        : typeof raw.orderCount === 'number'
        ? raw.orderCount
        : 1,
    totalQuotationUsd:
      typeof raw.totalQuotationUsd === 'number'
        ? raw.totalQuotationUsd
        : typeof raw.totalOrderAmountUsd === 'number'
        ? raw.totalOrderAmountUsd
        : 0,
    registeredAt: String(
      raw.registeredAt || raw.createdAt || new Date().toISOString().slice(0, 10)
    ),
    lastActiveAt: String(
      raw.lastActiveAt || raw.lastOrderDate || new Date().toISOString().slice(0, 10)
    ),
    savedProductIds: Array.isArray(raw.savedProductIds)
      ? raw.savedProductIds.map(String)
      : []
  };
}

function deduplicateCustomersById(list: CustomerProfile[]): CustomerProfile[] {
  const map = new Map<string, CustomerProfile>();
  for (const item of list) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export class CustomerDomainService {
  private customers: CustomerProfile[] = [];
  private auditLogger: AuditLogDomainService;

  constructor(auditLogger: AuditLogDomainService) {
    this.auditLogger = auditLogger;

    try {
      localStorage.removeItem('lym_admin_customers');
    } catch {
      // Ignore
    }

    try {
      const saved = localStorage.getItem(CUSTOMERS_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.customers = deduplicateCustomersById(
            parsed
              .filter((c: any) => c && c.id)
              .map((c: any) => sanitizeCustomerFromCloud(c))
          );
        }
      }
    } catch {
      this.customers = [];
    }
  }

  private saveReadOnlyCustomersCache() {
    this.customers = deduplicateCustomersById(this.customers);
    try {
      localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(this.customers));
    } catch {
      // Ignore
    }
  }

  /**
   * Purge all cached customers from localStorage and memory upon logout (Issue #8).
   */
  clearCache(): void {
    this.customers = [];
    try {
      localStorage.removeItem(CUSTOMERS_CACHE_KEY);
      localStorage.removeItem('lym_admin_customers');
    } catch {
      // Ignore
    }
  }

  /** Partial update so server-side counters (inquiryCount / totalQuotationUsd) are never overwritten. */
  private async patchCustomer(customerId: string, fields: Partial<CustomerProfile>): Promise<void> {
    await withTimeout(updateDoc(doc(db, 'customers', customerId), fields), ADMIN_OPERATION_TIMEOUT_MS);
  }

  private async persistCustomerToFirestore(customer: CustomerProfile): Promise<void> {
    if (!auth.currentUser) return;
    const payload = sanitizeCustomerForFirestore(customer);
    await withTimeout(
      setDoc(doc(db, 'customers', customer.id), payload),
      ADMIN_OPERATION_TIMEOUT_MS
    );
  }

  subscribeToCustomers(
    onUpdate: (customers: CustomerProfile[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!auth.currentUser) {
      return () => {};
    }

    const customersQuery = query(
      collection(db, 'customers'),
      orderBy('lastActiveAt', 'desc'),
      limit(LISTENER_LIMITS.customers)
    );
    return onSnapshot(
      customersQuery,
      snapshot => {
        const cloudCustomers: CustomerProfile[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) {
            cloudCustomers.push(sanitizeCustomerFromCloud(data, docSnap.id));
          }
        });

        this.customers = deduplicateCustomersById(cloudCustomers);
        this.saveReadOnlyCustomersCache();
        onUpdate(this.customers);
      },
      err => {
        console.warn('Firestore customers listener warning:', err);
        onError?.(err);
      }
    );
  }

  getCustomers(): CustomerProfile[] {
    return deduplicateCustomersById(this.customers);
  }

  async updateCustomerStatus(
    customerId: string,
    status: CustomerProfile['status'],
    currentStaff: StaffAccount | null
  ): Promise<void> {
    const cust = this.customers.find(c => c.id === customerId);
    if (!cust) return;

    const lastActiveAt = new Date().toISOString().slice(0, 10);
    const previous = cust.status;
    await this.patchCustomer(customerId, { status, lastActiveAt });
    cust.status = status;
    cust.lastActiveAt = lastActiveAt;
    this.saveReadOnlyCustomersCache();

    this.auditLogger.logAction(
      currentStaff,
      '更新客户档案状态',
      `${cust.company} (${cust.name})`,
      `状态：${CUSTOMER_STATUS_LABEL[previous] || previous} → ${CUSTOMER_STATUS_LABEL[status] || status}`
    );
  }

  async addCustomer(
    data: Omit<CustomerProfile, 'id' | 'registeredAt' | 'lastActiveAt'>,
    currentStaff: StaffAccount | null
  ): Promise<CustomerProfile> {
    const nowDate = new Date().toISOString().slice(0, 10);
    const autoId = doc(collection(db, 'customers')).id;
    const newCustomer: CustomerProfile = {
      ...data,
      id: `CUST-${autoId}`,
      registeredAt: nowDate,
      lastActiveAt: nowDate
    };

    await this.persistCustomerToFirestore(newCustomer);
    this.customers = [newCustomer, ...this.customers.filter(c => c.id !== newCustomer.id)];
    this.saveReadOnlyCustomersCache();

    this.auditLogger.logAction(
      currentStaff,
      '新建客户档案',
      `${newCustomer.company} (${newCustomer.name})`,
      `国家/地区: ${newCustomer.country}`
    );
    return newCustomer;
  }

  async deleteCustomer(customerId: string, currentStaff: StaffAccount | null): Promise<boolean> {
    if (!currentStaff || currentStaff.role !== 'super_admin') {
      throw new Error('越权拦截：仅超级管理员有权删除客户档案！');
    }
    const idx = this.customers.findIndex(c => c.id === customerId);
    if (idx === -1) return false;

    const removed = this.customers[idx];
    await withTimeout(deleteDoc(doc(db, 'customers', customerId)), ADMIN_OPERATION_TIMEOUT_MS);
    this.customers.splice(idx, 1);
    this.saveReadOnlyCustomersCache();

    this.auditLogger.logAction(
      currentStaff,
      '删除客户档案',
      `${removed.company} (${removed.name})`,
      `已从云端客户库永久移除`
    );
    return true;
  }

  async batchUpdateCustomersStatus(
    customerIds: string[],
    status: CustomerProfile['status'],
    currentStaff: StaffAccount | null
  ): Promise<number> {
    const idSet = new Set(customerIds);
    const nowDate = new Date().toISOString().slice(0, 10);
    let count = 0;
    const changed: string[] = [];

    for (const cust of this.customers) {
      if (idSet.has(cust.id) && cust.status !== status) {
        changed.push(`${cust.company || cust.name}（原 ${CUSTOMER_STATUS_LABEL[cust.status] || cust.status}）`);
        await this.patchCustomer(cust.id, { status, lastActiveAt: nowDate });
        cust.status = status;
        cust.lastActiveAt = nowDate;
        count++;
      }
    }

    if (count > 0) {
      this.saveReadOnlyCustomersCache();
      this.auditLogger.logAction(
        currentStaff,
        '批量更新客户状态',
        `共 ${count} 家客户`,
        `改为「${CUSTOMER_STATUS_LABEL[status] || status}」：${changed.slice(0, 20).join('、')}${changed.length > 20 ? ` 等 ${changed.length} 家` : ''}`
      );
    }
    return count;
  }

  async batchDeleteCustomers(
    customerIds: string[],
    currentStaff: StaffAccount | null
  ): Promise<number> {
    if (!currentStaff || currentStaff.role !== 'super_admin') {
      throw new Error('越权拦截：仅超级管理员有权批量删除客户档案！');
    }
    const idSet = new Set(customerIds);
    let count = 0;

    for (const id of idSet) {
      await withTimeout(deleteDoc(doc(db, 'customers', id)), ADMIN_OPERATION_TIMEOUT_MS);
      count++;
    }

    this.customers = this.customers.filter(c => !idSet.has(c.id));
    if (count > 0) {
      this.saveReadOnlyCustomersCache();
      this.auditLogger.logAction(
        currentStaff,
        '批量删除客户档案',
        `共 ${count} 家客户`,
        `已从云端永久移除所选客户档案`
      );
    }
    return count;
  }
}
