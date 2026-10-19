import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Trash2 } from 'lucide-react';
import { Modal, FormField } from '../AdminUI';
import { QuotationConfig, STAMP_MAX_CHARS, saveQuotationConfig } from '../../../config/quotationConfig';
import { INCOTERMS, hasChinese } from './piText';
import { adminApi } from '../../../services/adminApi';

interface Props {
  open: boolean;
  onClose: () => void;
  config: QuotationConfig;
  canEdit: boolean;
  onSaved: (msg: string) => void;
}

/** Shrinks an uploaded stamp to at most 360 px and returns a PNG (or WebP if PNG is too big) data URL. */
async function stampFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('图片打不开，请换一张 PNG 或 JPG'));
      el.src = url;
    });
    const scale = Math.min(1, 360 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/png');
    if (data.length > STAMP_MAX_CHARS) data = canvas.toDataURL('image/webp', 0.9);
    if (data.length > STAMP_MAX_CHARS) throw new Error('图片太大，请裁掉多余空白后再上传');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const LABELS: Partial<Record<keyof QuotationConfig, string>> = {
  companyNameEn: '公司英文名称',
  companyNameZh: '公司中文名称',
  addressEn: '英文地址',
  phone: '电话',
  email: '邮箱',
  website: '网址',
  defaultIncoterm: '价格条款',
  defaultPortOfLoading: '起运港',
  defaultPaymentTerms: '付款方式',
  defaultDepositPercent: '定金比例',
  defaultDeliveryTime: '交货期',
  defaultValidityDays: '有效天数',
  defaultPacking: '包装',
  standardTerms: '标准条款',
  stampImage: '印章'
};

/** Seller details, stamp and default terms used on every new quotation. */
export const QuotationSettingsModal: React.FC<Props> = ({ open, onClose, config, canEdit, onSaved }) => {
  const [form, setForm] = useState<QuotationConfig>(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(config);
      setError('');
    }
    // Only when the dialog opens: a live update must not wipe edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof QuotationConfig>(key: K, value: QuotationConfig[K]) => setForm(f => ({ ...f, [key]: value }));

  const englishFields: (keyof QuotationConfig)[] = ['companyNameEn', 'addressEn', 'defaultPortOfLoading', 'defaultPaymentTerms', 'defaultDeliveryTime', 'defaultPacking', 'standardTerms'];
  const chineseIn = englishFields.filter(k => hasChinese(String(form[k] || '')));

  const onStamp = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      set('stampImage', await stampFromFile(file));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await saveQuotationConfig(form);
      const changed = (Object.keys(LABELS) as (keyof QuotationConfig)[]).filter(k => String(form[k] ?? '') !== String(config[k] ?? ''));
      if (changed.length) {
        adminApi.addAuditLog(
          '修改报价单设置',
          '报价单设置',
          changed.map(k => (k === 'stampImage' ? `印章：${form.stampImage ? '已更新' : '已删除'}` : `${LABELS[k]}：${config[k] || '（空）'} → ${form[k] || '（空）'}`)).join('；')
        );
      }
      onSaved('报价单设置已保存，新开的报价单会使用这些信息');
      onClose();
    } catch (e) {
      setError((e as Error).message || '保存失败，请检查网络后重试');
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof QuotationConfig, opts: { placeholder?: string; area?: boolean; span?: boolean; hint?: string } = {}) => (
    <div className={opts.span ? 'sm:col-span-2' : ''}>
      <FormField label={LABELS[key]!} hint={opts.hint}>
        {opts.area ? (
          <textarea
            value={String(form[key] ?? '')}
            onChange={e => set(key, e.target.value as never)}
            rows={3}
            disabled={!canEdit}
            placeholder={opts.placeholder}
            className="field field-sm resize-y"
          />
        ) : (
          <input
            type="text"
            value={String(form[key] ?? '')}
            onChange={e => set(key, e.target.value as never)}
            disabled={!canEdit}
            placeholder={opts.placeholder}
            className="field field-sm"
          />
        )}
      </FormField>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="报价单设置"
      description="公司信息、印章和默认条款。保存后，新开的报价单都会使用；已开具的报价单保持开具时的内容。"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            {canEdit ? '取消' : '关闭'}
          </button>
          {canEdit && (
            <button type="button" onClick={save} disabled={saving} className="btn btn-sm btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? '保存中…' : '保存'}
            </button>
          )}
        </>
      }
    >
      {!canEdit && <p className="mb-4 rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">只有超级管理员可以修改报价单设置。</p>}
      {error && <div className="anim-pop mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">{error}</div>}

      <h3 className="text-sm font-semibold text-night mb-3">公司信息（按营业执照填写）</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('companyNameEn', { span: true })}
        {text('companyNameZh')}
        {text('addressEn', { placeholder: 'No. xx, xx Road, Huangpu District, Guangzhou, China' })}
        {text('phone', { hint: '不填则使用官网联系方式里的电话' })}
        {text('email', { hint: '不填则使用官网联系方式里的邮箱' })}
        {text('website', { placeholder: 'www.luyimei.com' })}
      </div>

      <h3 className="text-sm font-semibold text-night mt-6 mb-3">印章 / 签名</h3>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-28 w-40 items-center justify-center rounded-lg border border-dashed border-line bg-white">
          {form.stampImage ? <img src={form.stampImage} alt="印章预览" className="max-h-24 max-w-36" /> : <span className="text-xs text-slate-400">未上传</span>}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => onStamp(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline">
              <Upload className="w-4 h-4" />
              上传图片
            </button>
            {form.stampImage && (
              <button type="button" onClick={() => set('stampImage', '')} className="btn btn-sm btn-ghost text-rose-700">
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500 max-w-xs">建议用透明背景的 PNG。印章会盖在卖方签字处，只有员工能看到这张图片。</p>
      </div>

      <h3 className="text-sm font-semibold text-night mt-6 mb-3">默认条款（销售开单时可逐单修改）</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="价格条款">
          <select value={form.defaultIncoterm} onChange={e => set('defaultIncoterm', e.target.value)} disabled={!canEdit} className="field field-sm">
            {INCOTERMS.map(i => (
              <option key={i.key} value={i.key}>
                {i.key}（{i.zh}）
              </option>
            ))}
          </select>
        </FormField>
        {text('defaultPortOfLoading', { placeholder: 'Guangzhou, China' })}
        {text('defaultPaymentTerms', { span: true })}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="定金比例 %">
            <input
              type="number"
              min={0}
              max={100}
              value={form.defaultDepositPercent}
              onChange={e => set('defaultDepositPercent', Number(e.target.value))}
              disabled={!canEdit}
              className="field field-sm font-sign"
            />
          </FormField>
          <FormField label="有效天数">
            <input
              type="number"
              min={1}
              max={365}
              value={form.defaultValidityDays}
              onChange={e => set('defaultValidityDays', Number(e.target.value))}
              disabled={!canEdit}
              className="field field-sm font-sign"
            />
          </FormField>
        </div>
        {text('defaultDeliveryTime')}
        {text('defaultPacking', { span: true, hint: '写实际的包装方式，例如：Fumigation-free plywood cases / Original 200 kg steel drums on pallets' })}
        {text('standardTerms', { span: true, area: true, hint: '每张报价单「备注」里都会带上，例如：Quantity tolerance ±5%. Prices exclude destination duties and taxes.' })}
      </div>
      {chineseIn.length > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-950">
          {chineseIn.map(k => LABELS[k]).join('、')} 里有中文。这些内容会原样印在英文、阿拉伯文和俄文报价单上，建议用英文填写。
        </p>
      )}
    </Modal>
  );
};
