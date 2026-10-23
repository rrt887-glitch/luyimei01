import { AuditLogItem, StaffAccount, StaffRole } from '../../types/admin';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, onSnapshot, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { LISTENER_LIMITS } from '../../config/appConfig';
import { sanitizeAuditLogForFirestore } from '../../utils/firestoreSanitizer';
import { withTimeout, ADMIN_OPERATION_TIMEOUT_MS } from './adminShared';

const AUDIT_CACHE_KEY = 'lym_audit_readonly_v4';

export function sanitizeAuditLogFromCloud(
  raw: Record<string, any>,
  fallbackId?: string
): AuditLogItem {
  const id = String(fallbackId || raw.id || '').trim();
  const roleVal = raw.operatorRole || raw.role;
  const operatorRole: StaffRole = roleVal === 'super_admin' ? 'super_admin' : 'sales_rep';

  return {
    id,
    timestamp: String(raw.timestamp || new Date().toLocaleString()),
    operator: String(raw.operator || raw.operatorName || '系统顾问'),
    operatorRole,
    action: String(raw.action || '系统操作'),
    target: String(raw.target || '-'),
    details: String(raw.details || '')
  };
}

function deduplicateAuditLogsById(list: AuditLogItem[]): AuditLogItem[] {
  const map = new Map<string, AuditLogItem>();
  for (const item of list) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export class AuditLogDomainService {
  private auditLogs: AuditLogItem[] = [];

  constructor() {
    try {
      localStorage.removeItem('lym_admin_audit');
    } catch {
      // Ignore
    }

    try {
      const saved = localStorage.getItem(AUDIT_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.auditLogs = deduplicateAuditLogsById(
            parsed
              .filter((item: any) => item && item.id)
              .map((item: any) => sanitizeAuditLogFromCloud(item))
          );
        }
      }
    } catch {
      this.auditLogs = [];
    }
  }

  private saveReadOnlyAuditCache() {
    this.auditLogs = deduplicateAuditLogsById(this.auditLogs);
    try {
      localStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(this.auditLogs.slice(0, 300)));
    } catch {
      // Ignore
    }
  }

  /**
   * Purge all cached audit logs from localStorage and memory upon logout (Issue #8).
   */
  clearCache(): void {
    this.auditLogs = [];
    try {
      localStorage.removeItem(AUDIT_CACHE_KEY);
      localStorage.removeItem('lym_admin_audit');
    } catch {
      // Ignore
    }
  }

  subscribeToAuditLogs(
    onUpdate: (logs: AuditLogItem[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!auth.currentUser) {
      return () => {};
    }

    // Newest first, capped: the append-only log grows forever, the listener cost must not.
    const logsQuery = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(LISTENER_LIMITS.auditLogs)
    );
    return onSnapshot(
      logsQuery,
      snapshot => {
        const cloudLogs: AuditLogItem[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) {
            cloudLogs.push(sanitizeAuditLogFromCloud(data, docSnap.id));
          }
        });

        const deduped = deduplicateAuditLogsById(cloudLogs);
        deduped.sort((a, b) => {
          const tA = new Date(a.timestamp).getTime() || 0;
          const tB = new Date(b.timestamp).getTime() || 0;
          return tB - tA;
        });

        this.auditLogs = deduped;
        this.saveReadOnlyAuditCache();
        onUpdate(this.auditLogs);
      },
      err => {
        console.warn('Firestore audit_logs listener warning:', err);
        onError?.(err);
      }
    );
  }

  /** One page of entries older than `beforeIso` (newest first), for "load older" in the log view. */
  async loadOlder(beforeIso: string, pageSize = 200): Promise<AuditLogItem[]> {
    if (!auth.currentUser) return [];
    const snap = await withTimeout(
      getDocs(query(collection(db, 'audit_logs'), where('timestamp', '<', beforeIso), orderBy('timestamp', 'desc'), limit(pageSize))),
      ADMIN_OPERATION_TIMEOUT_MS
    );
    const out: AuditLogItem[] = [];
    snap.forEach(d => out.push(sanitizeAuditLogFromCloud(d.data(), d.id)));
    return out;
  }

  getAuditLogs(): AuditLogItem[] {
    return deduplicateAuditLogsById(this.auditLogs);
  }

  logAction(
    actor: StaffAccount | null,
    action: string,
    target: string,
    details: string
  ): Promise<void> {
    // Never attribute buyer or unauthenticated actions to Super Admin
    if (!actor || !actor.id || !auth.currentUser) {
      return Promise.resolve();
    }

    const autoId = doc(collection(db, 'audit_logs')).id;
    const newLog: AuditLogItem = {
      id: `LOG-${autoId}`,
      timestamp: new Date().toISOString(),
      operator: actor.name,
      operatorRole: actor.role,
      // firestore.rules caps these lengths; an over-long entry would be rejected and lost.
      action: action.slice(0, 300),
      target: target.length > 500 ? `${target.slice(0, 495)}…` : target,
      details: details.length > 2000 ? `${details.slice(0, 1995)}…` : details
    };

    this.auditLogs = [newLog, ...this.auditLogs.filter(l => l.id !== newLog.id)];
    this.saveReadOnlyAuditCache();

    const payload = sanitizeAuditLogForFirestore(newLog);
    // Callers do not wait (the entry is shown at once); the logout path waits so the entry is
    // written before the session ends.
    return withTimeout(setDoc(doc(db, 'audit_logs', newLog.id), payload), ADMIN_OPERATION_TIMEOUT_MS).catch(
      err => {
        console.warn('Audit log cloud write failed:', err);
      }
    );
  }
}
