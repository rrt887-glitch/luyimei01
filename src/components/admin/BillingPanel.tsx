import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { Save, AlertTriangle } from 'lucide-react';
import { Panel, FormField } from './AdminUI';
import { BillingConfig, EMPTY_BILLING, isBillingConfigured, saveBillingConfig, useBillingConfig } from '../../config/billing';

/** Super-admin editor for the bank details printed on every proforma invoice. */
export const BillingPanel: React.FC = () => {
  const { billing, loading, error } = useBillingConfig();
  const [form, setForm] = useState<BillingConfig>(EMPTY_BILLING);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setForm(billing);
  }, [billing]);

  const set = (patch: Partial<BillingConfig>) => setForm(prev => ({ ...prev, ...patch }));
  const configured = isBillingConfigured(billing);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await saveBillingConfig(form);
      // Account numbers are masked in the log: the log shows that it changed, not the number itself.
      const mask = (v: string) => (v ? `****${v.trim().slice(-4)}` : '空');
      const fields: [string, string, string][] = [
        ['收款人', billing.beneficiary, form.beneficiary],
        ['开户行', billing.bankName, form.bankName],
        ['账号', mask(billing.accountNumber), mask(form.accountNumber)],
        ['SWIFT', billing.swiftCode, form.swiftCode],
        ['开户行地址', billing.bankAddress, form.bankAddress],
        ['付款备注', billing.remarks, form.remarks]
      ];
      const changes = fields.filter(([, a, b]) => (a || '').trim() !== (b || '').trim()).map(([k, a, b]) => `${k}：${a || '空'} → ${b || '空'}`);
      if (changes.length) adminApi.addAuditLog('修改报价单收款账户', '报价单收款账户', changes.join('；'));
      setNotice({ ok: true, text: '已保存。之后开具的报价单都会使用这个收款账户。' });
    } catch (err) {
      setNotice({ ok: false, text: `保存失败：${(err as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      as="form"
      onSubmit={handleSubmit}
      className="mt-4 sm:mt-5"
      title="报价单收款账户"
      actions={
        <button type="submit" disabled={saving || loading} className="btn btn-sm btn-dark">
          <Save className="w-4 h-4" />
          {saving ? '保存中…' : '保存'}
        </button>
      }
    >
      {!loading && !configured && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <span>
            还没有填写收款账户。在此之前，报价单上会写「银行信息另行提供」，不会出现任何账号。请填写公司真实的对公账户，并核对两遍。
          </span>
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">读取失败：{error}</div>}
      {notice && (
        <div className={`anim-pop mb-4 rounded-lg px-3.5 py-2.5 text-sm ${notice.ok ? 'bg-sky-wash text-night' : 'bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </div>
      )}
      <p className="mb-4 text-sm text-slate-500 max-w-[70ch]">
        只有员工能看到这些信息，官网访客看不到。修改只影响之后开具的报价单，已经发出的不会变。
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <FormField label="收款人户名（Beneficiary）">
          <input
            type="text"
            required
            value={form.beneficiary}
            onChange={e => set({ beneficiary: e.target.value })}
            placeholder="与营业执照一致的英文名称"
            className="field field-sm"
          />
        </FormField>
        <FormField label="开户行（Bank）">
          <input type="text" required value={form.bankName} onChange={e => set({ bankName: e.target.value })} placeholder="银行及分行英文名称" className="field field-sm" />
        </FormField>
        <FormField label="账号（Account No.）">
          <input
            type="text"
            required
            value={form.accountNumber}
            onChange={e => set({ accountNumber: e.target.value })}
            className="field field-sm font-sign"
            autoComplete="off"
          />
        </FormField>
        <FormField label="SWIFT 代码">
          <input type="text" value={form.swiftCode} onChange={e => set({ swiftCode: e.target.value })} placeholder="外币收款必填" className="field field-sm font-sign" />
        </FormField>
        <FormField label="开户行地址" className="xl:col-span-2">
          <input type="text" value={form.bankAddress} onChange={e => set({ bankAddress: e.target.value })} className="field field-sm" />
        </FormField>
        <FormField label="付款备注" className="sm:col-span-2 xl:col-span-3" hint="会印在报价单上，例如「请在汇款附言中注明报价单号」。">
          <input type="text" value={form.remarks} onChange={e => set({ remarks: e.target.value })} className="field field-sm" />
        </FormField>
      </div>
    </Panel>
  );
};
