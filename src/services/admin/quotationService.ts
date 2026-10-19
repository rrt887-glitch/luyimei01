import { QuotationSheet, StaffAccount } from '../../types/admin';
import { db, auth } from '../firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction
} from 'firebase/firestore';
import { sanitizeQuotationForFirestore } from '../../utils/firestoreSanitizer';
import { withTimeout, ADMIN_OPERATION_TIMEOUT_MS } from './adminShared';
import { LISTENER_LIMITS } from '../../config/appConfig';

export type QuotationDraft = Omit<QuotationSheet, 'id' | 'createdBy' | 'createdByUid' | 'createdAt'>;

/**
 * PI numbers: `PI-LYM-YYYYMMDD-XXXXXX` where XXXXXX comes from a Firestore auto-ID
 * (62^6 ≈ 5.7e10 combinations per day, so collisions are practically impossible).
 * The number is also used as the document ID, which makes issuing idempotent.
 */
export function generateQuotationNumber(date = new Date()): string {
  const ymd =
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const suffix = doc(collection(db, 'quotations')).id.slice(0, 6).toUpperCase();
  return `PI-LYM-${ymd}-${suffix}`;
}

function quotationDocId(quotationNumber: string): string {
  return quotationNumber.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
}

function fromCloud(raw: Record<string, any>, id: string): QuotationSheet {
  return {
    id,
    quotationNumber: String(raw.quotationNumber || id),
    clientName: String(raw.clientName || ''),
    clientCompany: String(raw.clientCompany || ''),
    clientCountry: String(raw.clientCountry || ''),
    date: String(raw.date || ''),
    validUntil: String(raw.validUntil || ''),
    portOfLoading: String(raw.portOfLoading || ''),
    paymentTerms: String(raw.paymentTerms || ''),
    currency: String(raw.currency || 'USD'),
    items: Array.isArray(raw.items) ? raw.items : [],
    totalAmountUsd: typeof raw.totalAmountUsd === 'number' ? raw.totalAmountUsd : 0,
    notes: String(raw.notes || ''),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
    createdByUid: raw.createdByUid ? String(raw.createdByUid) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    leadId: raw.leadId ? String(raw.leadId) : undefined,
    customerId: raw.customerId ? String(raw.customerId) : undefined,
    lang: raw.lang,
    details: raw.details && typeof raw.details === 'object' ? raw.details : undefined
  };
}

export class QuotationDomainService {
  private quotations: QuotationSheet[] = [];

  getQuotations(): QuotationSheet[] {
    return [...this.quotations];
  }

  clearCache(): void {
    this.quotations = [];
  }

  /** Super admins see every quotation; sales reps only the ones they issued (enforced by rules). */
  subscribeToQuotations(
    currentStaff: StaffAccount | null,
    onUpdate: (list: QuotationSheet[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const uid = auth.currentUser?.uid;
    if (!uid || !currentStaff) return () => {};

    const col = collection(db, 'quotations');
    const q =
      currentStaff.role === 'super_admin'
        ? query(col, orderBy('createdAt', 'desc'), limit(LISTENER_LIMITS.quotations))
        : query(col, where('createdByUid', '==', uid), orderBy('createdAt', 'desc'), limit(LISTENER_LIMITS.quotations));

    return onSnapshot(
      q,
      snap => {
        this.quotations = snap.docs.map(d => fromCloud(d.data(), d.id));
        onUpdate(this.getQuotations());
      },
      err => {
        console.warn('Firestore quotations listener warning:', err);
        onError?.(err);
      }
    );
  }

  /**
   * Persists an issued quotation exactly once.
   * Exporting / printing the same PI number again returns `alreadyIssued: true` and writes nothing,
   * so CRM write-backs (lead value, stage, follow-up note, customer total) never happen twice.
   */
  async issueQuotation(
    draft: QuotationDraft,
    actor: StaffAccount
  ): Promise<{ quotation: QuotationSheet; alreadyIssued: boolean }> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('未检测到有效的云端认证会话，无法保存报价单。');
    }
    if (!draft.clientName.trim()) {
      throw new Error('请先填写客户联系人或公司名称。');
    }
    if (!draft.items.length) {
      throw new Error('报价单至少需要一行商品。');
    }

    const id = quotationDocId(draft.quotationNumber);
    const ref = doc(db, 'quotations', id);
    const quotation: QuotationSheet = {
      ...draft,
      id,
      createdBy: actor.name,
      createdByUid: uid,
      createdAt: new Date().toISOString()
    };

    const alreadyIssued = await withTimeout(
      runTransaction(db, async tx => {
        const existing = await tx.get(ref);
        if (existing.exists()) return true;
        tx.set(ref, sanitizeQuotationForFirestore(quotation));
        return false;
      }),
      ADMIN_OPERATION_TIMEOUT_MS
    );

    if (!alreadyIssued) {
      this.quotations = [quotation, ...this.quotations.filter(q => q.id !== id)];
    }
    return { quotation, alreadyIssued };
  }
}
