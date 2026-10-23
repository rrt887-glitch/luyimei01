import { AdminLead, LeadFollowUpNote, LeadStage, StaffAccount } from '../../types/admin';
import { InquiryFormData } from '../../types';
import { db, auth } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  deleteField,
  query,
  where,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import { getStage } from '../../config/leadStages';
import { LISTENER_LIMITS } from '../../config/appConfig';
import { sanitizeLeadForFirestore, sanitizeForFirestore } from '../../utils/firestoreSanitizer';
import { withTimeout, ADMIN_OPERATION_TIMEOUT_MS } from './adminShared';
import { AuditLogDomainService } from './auditLogService';
import { formatUsd, toCents } from '../../utils/format';

/** One row of an Excel import, already validated by the import dialog. */
/** Leads go to the pool or to an active colleague; firestore.rules enforces the same. */
function assertAssignable(staff: StaffAccount | undefined): void {
  if (!staff) throw new Error('未找到目标员工，无法指派。');
  if (staff.status !== 'active') throw new Error(`员工「${staff.name}」已停用，不能指派线索。`);
}

export interface LeadImportItem {
  customerName: string;
  company?: string;
  phone: string;
  needType: string;
  location?: string;
  message?: string;
  stage: LeadStage;
  /** Staff id, or '' for the public pool. */
  assignedStaffId: string;
  estimatedValueUsd?: number;
  note?: string;
}

const IMPORT_BATCH_SIZE = 400;

/** Writes in chunks of 400 operations (Firestore allows 500 per batch). */
async function commitInBatches<T>(items: T[], add: (batch: ReturnType<typeof writeBatch>, item: T) => void): Promise<void> {
  for (let i = 0; i < items.length; i += IMPORT_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + IMPORT_BATCH_SIZE)) add(batch, item);
    await withTimeout(batch.commit(), ADMIN_OPERATION_TIMEOUT_MS * 2);
  }
}

/** "A、B、C 等 25 条" — names in an audit entry, capped so the entry stays readable. */
function summarize(names: string[], max = 20): string {
  const shown = names.slice(0, max).join('、');
  return names.length > max ? `${shown} 等 ${names.length} 条` : shown;
}

const LEADS_CACHE_KEY = 'lym_leads_readonly_v4';

export function sanitizeLeadFromCloud(raw: Record<string, any>, fallbackId?: string): AdminLead {
  // Always prioritize the Firestore document ID (`fallbackId`) when available so doc operations
  // and React keys strictly match the unique Firestore document key.
  const id = String(fallbackId || raw.id || '').trim();
  const validStages: LeadStage[] = ['new', 'following', 'quoted', 'negotiating', 'won', 'lost'];
  const stage: LeadStage = validStages.includes(raw.stage) ? raw.stage : 'new';

  const rawNotes = Array.isArray(raw.notes)
    ? raw.notes
    : Array.isArray(raw.followUpNotes)
    ? raw.followUpNotes
    : [];

  const seenNoteIds = new Set<string>();
  const notes: LeadFollowUpNote[] = rawNotes
    .filter((n: any) => n && typeof n === 'object')
    .map((n: any, idx: number) => {
      let noteId = String(n.id || `NOTE-${idx}`);
      if (seenNoteIds.has(noteId)) {
        noteId = `${noteId}-${idx}`;
      }
      seenNoteIds.add(noteId);
      return {
        id: noteId,
        author: String(n.author || n.authorName || '系统顾问'),
        content: String(n.content || ''),
        createdAt: String(n.createdAt || new Date().toLocaleString())
      };
    });

  const assignedStaffId = raw.assignedStaffId ? String(raw.assignedStaffId).trim() : undefined;
  const assignedStaffName =
    assignedStaffId && raw.assignedStaffName ? String(raw.assignedStaffName).trim() : undefined;
  const company = raw.company ? String(raw.company).trim() : undefined;
  const estimatedValueUsd =
    typeof raw.estimatedValueUsd === 'number' && Number.isFinite(raw.estimatedValueUsd) && raw.estimatedValueUsd > 0
      ? raw.estimatedValueUsd
      : undefined;

  return {
    id,
    customerName: String(raw.customerName || raw.name || '匿名工程客户').trim(),
    company,
    phone: String(raw.phone || '').trim(),
    needType: String(raw.needType || '工程采购询盘').trim(),
    location: String(raw.location || '待确认').trim(),
    message: String(raw.message || '').trim(),
    estimatedValueUsd,
    stage,
    assignedStaffId: assignedStaffId || undefined,
    assignedStaffName: assignedStaffName || undefined,
    buyerUid: raw.buyerUid ? String(raw.buyerUid) : undefined,
    buyerEmail: raw.buyerEmail ? String(raw.buyerEmail) : undefined,
    customerId: raw.customerId ? String(raw.customerId) : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
    notes,
    followUpNotes: notes
  };
}

function deduplicateLeadsById(list: AdminLead[]): AdminLead[] {
  const map = new Map<string, AdminLead>();
  for (const item of list) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export class LeadsCrmDomainService {
  private leads: AdminLead[] = [];
  private auditLogger: AuditLogDomainService;

  constructor(auditLogger: AuditLogDomainService) {
    this.auditLogger = auditLogger;

    try {
      localStorage.removeItem('lym_admin_leads');
      localStorage.removeItem('lym_leads_data');
    } catch {
      // Ignore
    }

    try {
      const saved = localStorage.getItem(LEADS_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.leads = deduplicateLeadsById(
            parsed
              .filter((l: any) => l && l.id && !String(l.id).startsWith('DEMO-'))
              .map((l: any) => sanitizeLeadFromCloud(l))
          );
        }
      }
    } catch {
      this.leads = [];
    }
  }

  private saveReadOnlyLeadsCache() {
    this.leads = deduplicateLeadsById(this.leads);
    try {
      localStorage.setItem(LEADS_CACHE_KEY, JSON.stringify(this.leads));
    } catch {
      // Ignore
    }
  }

  /**
   * Purge all cached leads from localStorage and memory upon logout (Issue #8).
   */
  clearCache(): void {
    this.leads = [];
    try {
      localStorage.removeItem(LEADS_CACHE_KEY);
      localStorage.removeItem('lym_admin_leads');
      localStorage.removeItem('lym_leads_data');
    } catch {
      // Ignore
    }
  }

  /**
   * Full document write used ONLY when creating a brand-new manual lead.
   * Preserves `company` and writes only a single `notes` array (omits duplicate `followUpNotes` in cloud).
   */
  private async createLeadInFirestore(lead: AdminLead): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法写入线索数据。');
    }
    const { followUpNotes: _omitDuplicateNotes, ...cleanLead } = lead;
    const payload = sanitizeLeadForFirestore({
      ...cleanLead,
      name: lead.customerName,
      company: lead.company || '',
      assignedStaffId: lead.assignedStaffId || ''
    });
    await withTimeout(setDoc(doc(db, 'inquiries', lead.id), payload), ADMIN_OPERATION_TIMEOUT_MS);
  }

  /**
   * Super admins listen to all leads; sales reps listen ONLY to the public pool + their own leads
   * (firestore.rules rejects any broader query, so colleagues' clients never reach a rep's browser).
   * Both listeners are newest-first and capped by LISTENER_LIMITS.leads.
   */
  subscribeToLeads(
    currentStaff: StaffAccount | null,
    onUpdate: (leads: AdminLead[]) => void,
    onError?: (err: Error) => void,
    getVisibleLeads?: () => AdminLead[]
  ): () => void {
    const uid = auth.currentUser?.uid;
    if (!uid || !currentStaff) {
      return () => {};
    }

    const colRef = collection(db, 'inquiries');
    const leadsQuery =
      currentStaff.role === 'super_admin'
        ? query(colRef, orderBy('createdAt', 'desc'), limit(LISTENER_LIMITS.leads))
        : query(
            colRef,
            where('assignedStaffId', 'in', ['', uid]),
            orderBy('createdAt', 'desc'),
            limit(LISTENER_LIMITS.leads)
          );

    return onSnapshot(
      leadsQuery,
      snapshot => {
        const cloudLeads: AdminLead[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) {
            const id = String(data.id || docSnap.id);
            if (!id.startsWith('DEMO-')) {
              cloudLeads.push(sanitizeLeadFromCloud(data, docSnap.id));
            }
          }
        });

        const deduped = deduplicateLeadsById(cloudLeads);
        deduped.sort((a, b) => {
          const tA = new Date(a.createdAt).getTime() || 0;
          const tB = new Date(b.createdAt).getTime() || 0;
          return tB - tA;
        });

        this.leads = deduped;
        this.saveReadOnlyLeadsCache();
        onUpdate(getVisibleLeads ? getVisibleLeads() : this.leads);
      },
      err => {
        console.warn('Firestore inquiries listener warning:', err);
        onError?.(err);
      }
    );
  }

  getLeadsForStaff(currentStaff: StaffAccount | null): AdminLead[] {
    if (!currentStaff) {
      return [];
    }
    const uniqueLeads = deduplicateLeadsById(this.leads);
    if (currentStaff.role === 'super_admin') {
      return uniqueLeads;
    }
    return uniqueLeads.filter(
      l =>
        !l.assignedStaffId ||
        l.assignedStaffId === currentStaff.id ||
        (currentStaff.uid && l.assignedStaffId === currentStaff.uid)
    );
  }

  getAllLeadsRaw(): AdminLead[] {
    return deduplicateLeadsById(this.leads);
  }

  getAssignedLeadsCount(staffId: string): number {
    return deduplicateLeadsById(this.leads).filter(l => l.assignedStaffId === staffId).length;
  }

  /**
   * Bulk-create leads from an Excel import. Written in batches of 400 (one network round trip per
   * batch); every document passes the same rules as a manual lead. Sales reps' imports are always
   * their own leads. The onInquiryCreated function then links each lead to the customer archive.
   */
  async importLeads(
    items: LeadImportItem[],
    sourceName: string,
    staffList: StaffAccount[],
    currentStaff: StaffAccount | null,
    onProgress?: (done: number) => void
  ): Promise<number> {
    if (!auth.currentUser || !currentStaff) {
      throw new Error('未检测到有效的云端认证会话，无法导入线索。');
    }
    const isSuperAdmin = currentStaff.role === 'super_admin';
    const nowStr = new Date().toISOString();
    const created: AdminLead[] = [];
    for (const item of items) {
      const ownerId = isSuperAdmin ? item.assignedStaffId || '' : currentStaff.id;
      const owner = ownerId ? staffList.find(s => s.id === ownerId || s.uid === ownerId) : undefined;
      if (ownerId && ownerId !== currentStaff.id) assertAssignable(owner);
      const notes: LeadFollowUpNote[] = [
        {
          id: `NOTE-${doc(collection(db, 'inquiries')).id.slice(0, 10)}`,
          author: currentStaff.name,
          content: `Excel 批量导入（${sourceName}）`,
          createdAt: nowStr
        }
      ];
      if (item.note && item.note.trim()) {
        notes.push({
          id: `NOTE-${doc(collection(db, 'inquiries')).id.slice(0, 10)}`,
          author: currentStaff.name,
          content: item.note.trim().slice(0, 2000),
          createdAt: nowStr
        });
      }
      created.push({
        id: `INQ-${doc(collection(db, 'inquiries')).id}`,
        customerName: item.customerName.trim().slice(0, 120),
        company: (item.company || '').trim().slice(0, 200),
        phone: item.phone.trim().slice(0, 150),
        needType: (item.needType || '其他').trim().slice(0, 200),
        location: (item.location || '').trim().slice(0, 200),
        message: (item.message || '').trim().slice(0, 5000),
        estimatedValueUsd:
          typeof item.estimatedValueUsd === 'number' && item.estimatedValueUsd > 0 ? Math.min(1000000000, toCents(item.estimatedValueUsd)) : undefined,
        stage: item.stage,
        assignedStaffId: owner ? owner.id : undefined,
        assignedStaffName: owner?.name,
        createdAt: nowStr,
        updatedAt: nowStr,
        notes
      });
    }

    let done = 0;
    for (let i = 0; i < created.length; i += IMPORT_BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const lead of created.slice(i, i + IMPORT_BATCH_SIZE)) {
        batch.set(
          doc(db, 'inquiries', lead.id),
          sanitizeLeadForFirestore({ ...lead, name: lead.customerName, assignedStaffId: lead.assignedStaffId || '' })
        );
      }
      await withTimeout(batch.commit(), ADMIN_OPERATION_TIMEOUT_MS * 2);
      done = Math.min(created.length, i + IMPORT_BATCH_SIZE);
      onProgress?.(done);
    }

    const ids = new Set(created.map(l => l.id));
    this.leads = [...created, ...this.leads.filter(l => !ids.has(l.id))];
    this.saveReadOnlyLeadsCache();

    const byOwner = new Map<string, number>();
    for (const l of created) byOwner.set(l.assignedStaffName || '公海', (byOwner.get(l.assignedStaffName || '公海') || 0) + 1);
    this.auditLogger.logAction(
      currentStaff,
      '批量导入商机线索',
      sourceName,
      `导入 ${created.length} 条｜负责人：${Array.from(byOwner, ([k, v]) => `${k} ${v} 条`).join('、')}`
    );
    return created.length;
  }

  async addManualLead(
    data: InquiryFormData,
    estimatedValueUsd: number | undefined,
    assignedStaffId: string | undefined,
    staffList: StaffAccount[],
    currentStaff: StaffAccount | null
  ): Promise<AdminLead> {
    const nowStr = new Date().toISOString();
    const safeStaffId = assignedStaffId && assignedStaffId.trim() ? assignedStaffId.trim() : undefined;
    if (currentStaff?.role !== 'super_admin' && safeStaffId && safeStaffId !== currentStaff?.id) {
      throw new Error('越权拦截：销售代表录入线索时只能指派给自己或放入公海！');
    }
    const safeValue =
      typeof estimatedValueUsd === 'number' && Number.isFinite(estimatedValueUsd) && estimatedValueUsd > 0
        ? Math.min(1000000000, toCents(estimatedValueUsd))
        : undefined;
    const assignedStaff = safeStaffId
      ? staffList.find(s => s.id === safeStaffId || s.uid === safeStaffId)
      : undefined;
    if (safeStaffId && safeStaffId !== currentStaff?.id) assertAssignable(assignedStaff);
    const staffName = assignedStaff?.name;

    const initialNote: LeadFollowUpNote[] = [
      {
        id: `NOTE-${doc(collection(db, 'inquiries')).id.slice(0, 10)}`,
        author: currentStaff?.name || '系统管理员',
        content: '后台手动录入工程询盘线索',
        createdAt: nowStr
      }
    ];

    // Collision-free Firestore auto-ID
    const autoId = doc(collection(db, 'inquiries')).id;
    const newLead: AdminLead = {
      id: `INQ-${autoId}`,
      customerName: data.name.trim(),
      company: data.company?.trim() || '',
      phone: data.phone.trim(),
      needType: data.needType,
      location: (data.location || '').trim(),
      message: (data.message || '').trim(),
      estimatedValueUsd: safeValue,
      stage: 'new',
      assignedStaffId: safeStaffId,
      assignedStaffName: staffName,
      createdAt: nowStr,
      updatedAt: nowStr,
      notes: initialNote,
      followUpNotes: initialNote
    };

    await this.createLeadInFirestore(newLead);

    // Avoid duplicate entry if `onSnapshot` already emitted `newLead` while awaiting `setDoc`
    this.leads = [newLead, ...this.leads.filter(l => l.id !== newLead.id)];
    this.saveReadOnlyLeadsCache();
    this.auditLogger.logAction(
      currentStaff,
      '手动录入线索',
      `${newLead.customerName} (${newLead.id})`,
      `预估金额: ${safeValue ? formatUsd(safeValue) : '待估值'} | 指派给: ${staffName || '未分配(公海)'}`
    );

    return newLead;
  }

  /**
   * Partial field update via `updateDoc` so concurrent edits to `notes` or `company` are never overwritten.
   */
  async updateLeadStage(
    leadId: string,
    newStage: LeadStage,
    currentStaff: StaffAccount | null
  ): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法更新线索阶段。');
    }
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;

    const oldStage = lead.stage;
    const nowStr = new Date().toISOString();

    await withTimeout(
      updateDoc(doc(db, 'inquiries', leadId), {
        stage: newStage,
        updatedAt: nowStr
      }),
      ADMIN_OPERATION_TIMEOUT_MS
    );

    lead.stage = newStage;
    lead.updatedAt = nowStr;
    this.saveReadOnlyLeadsCache();

    this.auditLogger.logAction(
      currentStaff,
      '更新线索阶段',
      `${lead.customerName} (${lead.id})`,
      `阶段：${getStage(oldStage).label} → ${getStage(newStage).label}`
    );
  }

  /**
   * Partial field update via `updateDoc` for `estimatedValueUsd` so CRM and Quotation PI
   * can update pipeline valuation in real time without overwriting concurrent notes or company fields.
   */
  async updateLeadEstimatedValue(
    leadId: string,
    estimatedValueUsd: number,
    currentStaff: StaffAccount | null,
    sourceLabel?: string
  ): Promise<{ lead: AdminLead; oldVal: number } | null> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法更新商机估值。');
    }
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return null;

    const safeVal = Math.max(0, Math.min(1000000000, toCents(Number(estimatedValueUsd) || 0)));
    const oldVal = lead.estimatedValueUsd || 0;
    const nowStr = new Date().toISOString();

    await withTimeout(
      updateDoc(doc(db, 'inquiries', leadId), {
        estimatedValueUsd: safeVal,
        updatedAt: nowStr
      }),
      ADMIN_OPERATION_TIMEOUT_MS
    );

    lead.estimatedValueUsd = safeVal;
    lead.updatedAt = nowStr;
    this.saveReadOnlyLeadsCache();

    this.auditLogger.logAction(
      currentStaff,
      sourceLabel || '更新商机预估金额',
      `${lead.customerName} (${lead.id})`,
      `商机估值由 ${formatUsd(oldVal)} 调整为 ${formatUsd(safeVal)} USD`
    );

    return { lead: { ...lead }, oldVal };
  }

  /**
   * Updates the local lead cache and records audit trail after an atomic quotation+lead transaction commits.
   */
  syncLeadFromQuotationWriteback(
    wb: {
      leadId: string;
      estimatedValueUsd: number;
      oldStage?: LeadStage;
      newStage?: LeadStage;
      note: LeadFollowUpNote;
      updatedAt: string;
    },
    currentStaff: StaffAccount | null
  ): void {
    const lead = this.leads.find(l => l.id === wb.leadId);
    const oldVal = lead?.estimatedValueUsd || 0;
    const targetName = lead ? `${lead.customerName} (${lead.id})` : wb.leadId;

    if (lead) {
      lead.estimatedValueUsd = wb.estimatedValueUsd;
      if (wb.newStage) lead.stage = wb.newStage;
      const updatedNotes = [...(lead.notes || []), wb.note];
      lead.notes = updatedNotes;
      lead.followUpNotes = updatedNotes;
      lead.updatedAt = wb.updatedAt;
      this.saveReadOnlyLeadsCache();
    }

    this.auditLogger.logAction(
      currentStaff,
      '报价单回写商机金额',
      targetName,
      `商机估值由 ${formatUsd(oldVal)} 调整为 ${formatUsd(wb.estimatedValueUsd)} USD`
    );
    if (wb.oldStage && wb.newStage && wb.oldStage !== wb.newStage) {
      this.auditLogger.logAction(
        currentStaff,
        '更新线索阶段',
        targetName,
        `阶段：${getStage(wb.oldStage).label} → ${getStage(wb.newStage).label}`
      );
    }
    this.auditLogger.logAction(
      currentStaff,
      '添加线索跟进记录',
      targetName,
      wb.note.content.slice(0, 60)
    );
  }

  /**
   * Partial field update via `updateDoc` (and `deleteField()` when releasing to public pool).
   * Sales reps can only claim unassigned leads to themselves or release their own leads back to the public pool.
   */
  async assignLead(
    leadId: string,
    staffId: string,
    staffList: StaffAccount[],
    currentStaff: StaffAccount | null
  ): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法指派线索。');
    }
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;

    const safeId = (staffId || '').trim();
    const isSuperAdmin = currentStaff?.role === 'super_admin';

    if (!isSuperAdmin) {
      const callerId = currentStaff?.id || auth.currentUser.uid;
      if (lead.assignedStaffId && lead.assignedStaffId !== callerId) {
        throw new Error('越权拦截：销售代表无权修改已分配给其他同事的商机线索！');
      }
      if (safeId && safeId !== callerId) {
        throw new Error('越权拦截：销售代表只能认领公海线索至本人名下或释放回公海！');
      }
    }

    const staff = safeId ? staffList.find(s => s.id === safeId || s.uid === safeId) : undefined;
    if (safeId && safeId !== lead.assignedStaffId && safeId !== currentStaff?.id) assertAssignable(staff);
    const nowStr = new Date().toISOString();
    const previousOwner = lead.assignedStaffName || (lead.assignedStaffId ? '其他员工' : '公海');

    await withTimeout(
      updateDoc(
        doc(db, 'inquiries', leadId),
        staff
          ? {
              assignedStaffId: staff.id,
              assignedStaffName: staff.name,
              updatedAt: nowStr
            }
          : {
              assignedStaffId: '',
              assignedStaffName: deleteField(),
              updatedAt: nowStr
            }
      ),
      ADMIN_OPERATION_TIMEOUT_MS
    );

    lead.assignedStaffId = staff ? staff.id : undefined;
    lead.assignedStaffName = staff ? staff.name : undefined;
    lead.updatedAt = nowStr;
    this.saveReadOnlyLeadsCache();

    const selfId = currentStaff?.id || auth.currentUser?.uid;
    const action = !staff
      ? '释放线索回公海'
      : staff.id === selfId && previousOwner === '公海'
        ? '认领公海线索'
        : '指派线索负责人';
    this.auditLogger.logAction(
      currentStaff,
      action,
      `${lead.customerName} (${lead.id})`,
      `负责人：${previousOwner} → ${staff ? staff.name : '公海'}`
    );
  }

  /**
   * Atomic follow-up note append using `updateDoc` + `arrayUnion` on the single `notes` field
   * (and removes any legacy duplicate `followUpNotes` field in Firestore).
   * Two sales reps appending follow-up notes concurrently will never overwrite each other's notes.
   */
  async addLeadFollowUpNote(
    leadId: string,
    content: string,
    currentStaff: StaffAccount | null,
    authorName?: string
  ): Promise<AdminLead | null> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法添加跟进记录。');
    }
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead || !content.trim()) return null;

    const nowStr = new Date().toISOString();
    const newNote: LeadFollowUpNote = sanitizeForFirestore({
      id: `NOTE-${doc(collection(db, 'inquiries')).id.slice(0, 10)}`,
      author: authorName || currentStaff?.name || '销售顾问',
      content: content.trim(),
      createdAt: nowStr
    });

    await withTimeout(
      updateDoc(doc(db, 'inquiries', leadId), {
        notes: arrayUnion(newNote),
        followUpNotes: deleteField(),
        updatedAt: nowStr
      }),
      ADMIN_OPERATION_TIMEOUT_MS
    );

    const updatedNotes = [...(lead.notes || []), newNote];
    lead.notes = updatedNotes;
    lead.followUpNotes = updatedNotes;
    lead.updatedAt = nowStr;
    this.saveReadOnlyLeadsCache();

    this.auditLogger.logAction(
      currentStaff,
      '添加线索跟进记录',
      `${lead.customerName} (${lead.id})`,
      content.trim().slice(0, 60)
    );
    return { ...lead };
  }

  async deleteLead(leadId: string, currentStaff: StaffAccount | null): Promise<boolean> {
    if (!currentStaff || currentStaff.role !== 'super_admin') {
      throw new Error('越权拦截：仅超级管理员有权删除线索记录！');
    }
    const idx = this.leads.findIndex(l => l.id === leadId);
    if (idx === -1) return false;

    const target = this.leads[idx];
    await withTimeout(deleteDoc(doc(db, 'inquiries', leadId)), ADMIN_OPERATION_TIMEOUT_MS);

    this.leads.splice(idx, 1);
    this.saveReadOnlyLeadsCache();
    this.auditLogger.logAction(
      currentStaff,
      '删除询盘线索',
      `${target.customerName} (${target.id})`,
      `已永久删除：${target.customerName}（${target.phone}），阶段 ${getStage(target.stage).label}，负责人 ${target.assignedStaffName || '公海'}`
    );
    return true;
  }

  async batchUpdateStage(
    leadIds: string[],
    newStage: LeadStage,
    currentStaff: StaffAccount | null
  ): Promise<number> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法批量更新线索阶段。');
    }
    const idSet = new Set(leadIds);
    const nowStr = new Date().toISOString();
    const targets = this.leads.filter(l => idSet.has(l.id) && l.stage !== newStage);
    const before = targets.map(l => ({ lead: l, from: l.stage }));

    await commitInBatches(targets, (batch, lead) =>
      batch.update(doc(db, 'inquiries', lead.id), { stage: newStage, updatedAt: nowStr })
    );
    for (const lead of targets) {
      lead.stage = newStage;
      lead.updatedAt = nowStr;
    }

    if (targets.length > 0) {
      this.saveReadOnlyLeadsCache();
      this.auditLogger.logAction(
        currentStaff,
        '批量更新线索阶段',
        `共 ${targets.length} 条线索`,
        `改为「${getStage(newStage).label}」：${summarize(before.map(b => `${b.lead.customerName}（原 ${getStage(b.from).label}）`))}`
      );
    }
    return targets.length;
  }

  async batchAssignLeads(
    leadIds: string[],
    staffId: string,
    staffList: StaffAccount[],
    currentStaff: StaffAccount | null
  ): Promise<number> {
    if (!auth.currentUser) {
      throw new Error('未检测到有效的云端认证会话，无法批量指派线索。');
    }
    const idSet = new Set(leadIds);
    const safeId = (staffId || '').trim();
    const staff = safeId ? staffList.find(s => s.id === safeId || s.uid === safeId) : undefined;
    if (safeId && safeId !== currentStaff?.id) assertAssignable(staff);
    const isSuperAdmin = currentStaff?.role === 'super_admin';
    if (!isSuperAdmin && safeId && safeId !== currentStaff?.id) {
      throw new Error('越权拦截：销售代表只能认领线索至本人名下或释放回公海！');
    }
    const nowStr = new Date().toISOString();
    // Reps cannot touch colleagues' leads (also enforced by firestore.rules).
    const targets = this.leads.filter(
      l => idSet.has(l.id) && (isSuperAdmin || !l.assignedStaffId || l.assignedStaffId === currentStaff?.id)
    );
    const before = targets.map(l => ({ lead: l, from: l.assignedStaffName || (l.assignedStaffId ? '其他员工' : '公海') }));

    await commitInBatches(targets, (batch, lead) =>
      batch.update(
        doc(db, 'inquiries', lead.id),
        staff
          ? { assignedStaffId: staff.id, assignedStaffName: staff.name, updatedAt: nowStr }
          : { assignedStaffId: '', assignedStaffName: deleteField(), updatedAt: nowStr }
      )
    );
    for (const lead of targets) {
      lead.assignedStaffId = staff ? staff.id : undefined;
      lead.assignedStaffName = staff ? staff.name : undefined;
      lead.updatedAt = nowStr;
    }

    if (targets.length > 0) {
      this.saveReadOnlyLeadsCache();
      this.auditLogger.logAction(
        currentStaff,
        '批量指派线索',
        `共 ${targets.length} 条线索`,
        `负责人改为「${staff ? staff.name : '公海'}」：${summarize(before.map(b => `${b.lead.customerName}（原 ${b.from}）`))}`
      );
    }
    return targets.length;
  }

  async batchDeleteLeads(leadIds: string[], currentStaff: StaffAccount | null): Promise<number> {
    if (!currentStaff || currentStaff.role !== 'super_admin') {
      throw new Error('越权拦截：仅超级管理员有权批量删除线索！');
    }
    const idSet = new Set(leadIds);
    const ids = Array.from(idSet);
    const names = ids.map(id => {
      const l = this.leads.find(x => x.id === id);
      return l ? `${l.customerName}（${l.phone}）` : id;
    });

    await commitInBatches(ids, (batch, id) => batch.delete(doc(db, 'inquiries', id)));

    this.leads = this.leads.filter(l => !idSet.has(l.id));
    if (ids.length > 0) {
      this.saveReadOnlyLeadsCache();
      this.auditLogger.logAction(currentStaff, '批量删除线索', `共 ${ids.length} 条线索`, `已永久删除：${summarize(names)}`);
    }
    return ids.length;
  }
}
