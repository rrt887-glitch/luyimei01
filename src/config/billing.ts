import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { sanitizeBillingConfigForFirestore } from '../utils/firestoreSanitizer';

/**
 * Bank details printed on proforma invoices (site_config/billing).
 * Readable by active staff only (firestore.rules), so this is only ever used inside the console.
 * When nothing is configured, quotations print "bank details provided separately" instead of a
 * made-up account — a wrong account number on an invoice is far worse than none.
 */
export interface BillingConfig {
  beneficiary: string;
  bankName: string;
  bankAddress: string;
  accountNumber: string;
  swiftCode: string;
  remarks: string;
  updatedAt?: string;
}

export const EMPTY_BILLING: BillingConfig = {
  beneficiary: '',
  bankName: '',
  bankAddress: '',
  accountNumber: '',
  swiftCode: '',
  remarks: ''
};

export function isBillingConfigured(cfg: BillingConfig | null | undefined): cfg is BillingConfig {
  return Boolean(cfg && cfg.beneficiary.trim() && cfg.bankName.trim() && cfg.accountNumber.trim());
}

/** Live bank details. `loading` is true until the first snapshot (or error) arrives. */
export function useBillingConfig(): { billing: BillingConfig; loading: boolean; error: string | null } {
  const [billing, setBilling] = useState<BillingConfig>(EMPTY_BILLING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'site_config', 'billing'),
      snap => {
        const data = (snap.exists() ? snap.data() : {}) as Partial<BillingConfig>;
        setBilling({
          beneficiary: data.beneficiary || '',
          bankName: data.bankName || '',
          bankAddress: data.bankAddress || '',
          accountNumber: data.accountNumber || '',
          swiftCode: data.swiftCode || '',
          remarks: data.remarks || '',
          updatedAt: data.updatedAt
        });
        setError(null);
        setLoading(false);
      },
      err => {
        setError(err.message || '无法读取收款账户');
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { billing, loading, error };
}

export async function saveBillingConfig(next: BillingConfig): Promise<void> {
  const clean: BillingConfig = {
    beneficiary: next.beneficiary.trim(),
    bankName: next.bankName.trim(),
    bankAddress: next.bankAddress.trim(),
    accountNumber: next.accountNumber.trim(),
    swiftCode: next.swiftCode.trim().toUpperCase(),
    remarks: next.remarks.trim(),
    updatedAt: new Date().toISOString()
  };
  if (!isBillingConfigured(clean)) {
    throw new Error('收款人户名、开户行和账号都必须填写');
  }
  // Optional fields are omitted when empty instead of being stored as "".
  const payload: Record<string, string> = {
    beneficiary: clean.beneficiary,
    bankName: clean.bankName,
    accountNumber: clean.accountNumber,
    updatedAt: clean.updatedAt!
  };
  if (clean.bankAddress) payload.bankAddress = clean.bankAddress;
  if (clean.swiftCode) payload.swiftCode = clean.swiftCode;
  if (clean.remarks) payload.remarks = clean.remarks;
  await setDoc(doc(db, 'site_config', 'billing'), sanitizeBillingConfigForFirestore(payload));
}
