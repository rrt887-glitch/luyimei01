import React, { useState } from 'react';
import { Product, ProductTextFields, ProductTranslations } from '../../../types';
import { Upload, Loader2, Film, X, Star, Settings2 } from 'lucide-react';
import { Modal, FormField } from '../AdminUI';
import { ProductCategoryDef } from '../../../config/categories';

export interface ProductFormState {
  model: string;
  customName: string;
  price: string;
  tierPrice: string;
  type: string;
  spec: string;
  customDesc: string;
  year: string;
  inStock: boolean;
  featured: boolean;
  videoUrl: string;
  images: string[];
  videoThumbnail: string;
  supplyLeadTime: string;
  supplyMoq: string;
  supplyCapacityStatus: 'ample' | 'moderate' | 'tight' | 'custom';
  supplyCapacityLabel: string;
  supplyBaseLocation: string;
  supplyPackaging: string;
  translations: ProductTranslations;
}

interface ProductFormModalProps {
  isOpen: boolean;
  /** Built-in spec text of the product being edited (already translated by the site). */
  builtinSpec?: string;
  categories: ProductCategoryDef[];
  onManageCategories: () => void;
  editingProduct: Product | null;
  form: ProductFormState;
  onChangeForm: (updates: Partial<ProductFormState>) => void;
  newImageUrlInput: string;
  onChangeNewImageUrlInput: (val: string) => void;
  onAddImageUrl: () => void;
  onRemoveImage: (index: number) => void;
  onSetPrimaryImage: (index: number) => void;
  isCompressingImages: boolean;
  onPhotoFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingVideo: boolean;
  videoUploadProgress: number;
  onVideoFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  builtinSpec,
  categories,
  onManageCategories,
  editingProduct,
  form,
  onChangeForm,
  newImageUrlInput,
  onChangeNewImageUrlInput,
  onAddImageUrl,
  onRemoveImage,
  onSetPrimaryImage,
  isCompressingImages,
  onPhotoFileUpload,
  isUploadingVideo,
  videoUploadProgress,
  onVideoFileUpload,
  onSubmit,
  onClose
}) => {
  const busy = isCompressingImages || isUploadingVideo;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={editingProduct ? `编辑 ${editingProduct.customName || editingProduct.model}` : '添加商品'}
      description="保存后官网产品目录和供货信息表会同步更新。"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            取消
          </button>
          <button type="submit" form="product-form" disabled={busy} className="btn btn-sm btn-primary">
            {busy ? '等待上传完成…' : '保存'}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-7">
        {/* Basics */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-night">基本信息</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="展示名称">
              <input
                type="text"
                value={form.customName}
                onChange={e => onChangeForm({ customName: e.target.value })}
                placeholder="如 手推式灌缝机"
                className="field field-sm"
              />
            </FormField>
            <FormField label="型号">
              <input
                type="text"
                required
                value={form.model}
                onChange={e => onChangeForm({ model: e.target.value })}
                placeholder="LYM-CUT-800"
                className="field field-sm font-sign"
              />
            </FormField>
            <FormField label="一句话介绍" className="sm:col-span-2">
              <input
                type="text"
                value={form.customDesc}
                onChange={e => onChangeForm({ customDesc: e.target.value })}
                placeholder="如 开袋即用，低温也能施工"
                className="field field-sm"
              />
            </FormField>
            <FormField label="分类">
              <div className="flex gap-2">
                <select required value={form.type} onChange={e => onChangeForm({ type: e.target.value })} className="field field-sm">
                  {!categories.some(c => c.id === form.type) && <option value={form.type}>未分类（请选择）</option>}
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name.zh}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={onManageCategories} className="icon-btn shrink-0 border border-line" aria-label="管理分类" title="管理分类">
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
            </FormField>
            <FormField label="规格">
              <input
                type="text"
                required
                value={form.spec}
                onChange={e => onChangeForm({ spec: e.target.value })}
                placeholder="如 金刚石刀片 / 本田动力"
                className="field field-sm"
              />
            </FormField>
            <FormField label="标价（USD）" hint="可写区间，如 $950–$1,350">
              <input type="text" required value={form.price} onChange={e => onChangeForm({ price: e.target.value })} className="field field-sm font-sign" />
            </FormField>
            <FormField label="批量价（USD）" hint="如 $850（10 台起）">
              <input type="text" value={form.tierPrice} onChange={e => onChangeForm({ tierPrice: e.target.value })} className="field field-sm font-sign" />
            </FormField>
            <FormField label="年份">
              <input type="number" value={form.year} onChange={e => onChangeForm({ year: e.target.value })} className="field field-sm font-sign" />
            </FormField>
            <div className="flex items-end gap-5 pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-night cursor-pointer">
                <input type="checkbox" className="adm-check" checked={form.inStock} onChange={e => onChangeForm({ inStock: e.target.checked })} />
                在售有货
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-night cursor-pointer">
                <input type="checkbox" className="adm-check" checked={form.featured} onChange={e => onChangeForm({ featured: e.target.checked })} />
                官网置顶
              </label>
            </div>
          </div>
        </section>

        {/* Media */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-night">照片与视频</h3>
            <span className="text-xs text-slate-500">
              {form.images.length} 张照片，{form.videoUrl ? '已有视频，官网卡片会显示「视频」按钮' : '没有视频（上传后官网卡片会出现「视频」按钮）'}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {form.images.map((img, idx) => (
              <div key={idx} className="group/img relative aspect-square overflow-hidden rounded-lg bg-concrete">
                <img src={img} alt={`照片 ${idx + 1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                {idx === 0 && (
                  <span className="absolute top-1.5 start-1.5 rounded bg-sky px-1.5 py-0.5 text-[11px] font-semibold text-night">主图</span>
                )}
                <div className="absolute inset-0 flex items-end justify-between gap-1 p-1.5 bg-gradient-to-t from-night/70 to-transparent opacity-0 group-hover/img:opacity-100 focus-within:opacity-100 transition-opacity">
                  {idx !== 0 ? (
                    <button
                      type="button"
                      onClick={() => onSetPrimaryImage(idx)}
                      className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-white/90 text-night hover:bg-white"
                      aria-label="设为主图"
                      title="设为主图"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveImage(idx)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-white/90 text-rose-600 hover:bg-white"
                    aria-label="删除这张照片"
                    title="删除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <label
              className={`aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-[13px] text-slate-500 cursor-pointer hover:border-sky hover:text-sky-deep transition-colors ${
                isCompressingImages ? 'pointer-events-none opacity-70' : ''
              }`}
            >
              {isCompressingImages ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {isCompressingImages ? '上传中…' : '上传照片'}
              <input type="file" multiple accept="image/*" disabled={isCompressingImages} onChange={onPhotoFileUpload} className="sr-only" />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="url"
              value={newImageUrlInput}
              onChange={e => onChangeNewImageUrlInput(e.target.value)}
              placeholder="或粘贴图片链接 https://…"
              className="field field-sm"
            />
            <button type="button" onClick={onAddImageUrl} disabled={!newImageUrlInput.trim()} className="btn btn-sm btn-outline shrink-0">
              添加
            </button>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <label className={`btn btn-sm btn-outline cursor-pointer shrink-0 ${isUploadingVideo ? 'pointer-events-none' : ''}`}>
              {isUploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
              {isUploadingVideo ? `上传中 ${videoUploadProgress}%` : '上传视频'}
              <input
                type="file"
                disabled={isUploadingVideo}
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                onChange={onVideoFileUpload}
                className="sr-only"
              />
            </label>
            <input
              type="url"
              value={form.videoUrl}
              onChange={e => onChangeForm({ videoUrl: e.target.value })}
              placeholder="或填写 MP4 视频链接 https://…"
              className="field field-sm font-sign"
            />
          </div>
          {isUploadingVideo && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-concrete">
              <div className="h-full bg-sky transition-[width] duration-300" style={{ width: `${videoUploadProgress}%` }} />
            </div>
          )}
          {form.videoUrl && !isUploadingVideo && (
            <div className="mt-3 overflow-hidden rounded-lg bg-black">
              <video src={form.videoUrl} controls playsInline className="w-full aspect-video max-h-56 object-contain" />
              <div className="flex justify-end bg-night px-3 py-1.5">
                <button type="button" onClick={() => onChangeForm({ videoUrl: '' })} className="text-xs text-white/70 hover:text-rose-200">
                  移除视频
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Supply */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-night">供货信息</h3>
          <p className="mb-3 text-[13px] text-slate-500">显示在官网「供货信息」表格里。</p>
          <SupplyFields form={form} onChangeForm={onChangeForm} />
        </section>

        {/* Translations */}
        <TranslationFields form={form} onChangeForm={onChangeForm} builtinSpec={builtinSpec} />
      </form>
    </Modal>
  );
};

/** Supply fields, shared by the full product form and the quick supply editor. */
export const SupplyFields: React.FC<{
  form: ProductFormState;
  onChangeForm: (updates: Partial<ProductFormState>) => void;
}> = ({ form, onChangeForm }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <FormField label="交期">
      <input
        type="text"
        required
        value={form.supplyLeadTime}
        onChange={e => onChangeForm({ supplyLeadTime: e.target.value })}
        placeholder="现货 / 24-48 小时发货"
        className="field field-sm"
      />
    </FormField>
    <FormField label="起订量">
      <input type="text" required value={form.supplyMoq} onChange={e => onChangeForm({ supplyMoq: e.target.value })} placeholder="1 台 / 10 桶" className="field field-sm" />
    </FormField>
    <FormField label="产能状态">
      <select
        value={form.supplyCapacityStatus}
        onChange={e => onChangeForm({ supplyCapacityStatus: e.target.value as ProductFormState['supplyCapacityStatus'] })}
        className="field field-sm"
      >
        <option value="ample">充足，现货</option>
        <option value="moderate">正常，按单排产</option>
        <option value="tight">偏紧，需提前预约</option>
        <option value="custom">支持定制</option>
      </select>
    </FormField>
    <FormField label="产能说明">
      <input
        type="text"
        value={form.supplyCapacityLabel}
        onChange={e => onChangeForm({ supplyCapacityLabel: e.target.value })}
        placeholder="月产 800 吨，常备库存 200 吨"
        className="field field-sm"
      />
    </FormField>
    <FormField label="生产基地 / 发货仓">
      <input type="text" value={form.supplyBaseLocation} onChange={e => onChangeForm({ supplyBaseLocation: e.target.value })} placeholder="广州黄埔基地" className="field field-sm" />
    </FormField>
    <FormField label="包装">
      <input type="text" value={form.supplyPackaging} onChange={e => onChangeForm({ supplyPackaging: e.target.value })} placeholder="出口防护包装，可托盘海运" className="field field-sm" />
    </FormField>
  </div>
);

const LANGS: { key: 'en' | 'ar' | 'ru'; label: string; dir?: 'rtl' }[] = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية', dir: 'rtl' },
  { key: 'ru', label: 'Русский' }
];

const TEXT_FIELDS: { key: keyof ProductTextFields; label: string; source: (f: ProductFormState) => string; long?: boolean }[] = [
  { key: 'name', label: '展示名称', source: f => f.customName },
  { key: 'desc', label: '一句话介绍', source: f => f.customDesc, long: true },
  { key: 'spec', label: '规格', source: f => f.spec },
  { key: 'leadTime', label: '交期', source: f => f.supplyLeadTime },
  { key: 'moq', label: '起订量', source: f => f.supplyMoq },
  { key: 'capacityLabel', label: '产能说明', source: f => f.supplyCapacityLabel },
  { key: 'baseLocation', label: '生产基地 / 发货仓', source: f => f.supplyBaseLocation },
  { key: 'packaging', label: '包装', source: f => f.supplyPackaging }
];

/** The website's English / Arabic / Russian text for this product. */
const TranslationFields: React.FC<{
  form: ProductFormState;
  onChangeForm: (updates: Partial<ProductFormState>) => void;
  builtinSpec?: string;
}> = ({ form, onChangeForm, builtinSpec }) => {
  const [lang, setLang] = useState<'en' | 'ar' | 'ru'>('en');
  const current = form.translations[lang] || {};
  const meta = LANGS.find(l => l.key === lang)!;
  // Empty Chinese fields, and the built-in catalogue texts, are not translated here: the site already
  // shows its own text for them in every language.
  const fields = TEXT_FIELDS.filter(f => {
    const source = f.source(form).trim();
    if (!source) return false;
    return !(f.key === 'spec' && builtinSpec && source === builtinSpec);
  });
  const filled = (l: 'en' | 'ar' | 'ru') => fields.filter(f => (form.translations[l]?.[f.key] || '').trim()).length;

  const set = (key: keyof ProductTextFields, value: string) =>
    onChangeForm({ translations: { ...form.translations, [lang]: { ...current, [key]: value } } });

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-night">外语内容</h3>
      <p className="mb-3 text-[13px] text-slate-500">
        访客切换到英文、阿拉伯文或俄文时显示。没填的项会先显示英文，英文也没填就显示中文。修改中文后记得同步这里。
      </p>
      <div className="segmented mb-4" role="group" aria-label="语言">
        {LANGS.map(l => (
          <button key={l.key} type="button" aria-pressed={lang === l.key} onClick={() => setLang(l.key)}>
            <bdi>{l.label}</bdi>
            <span className="ms-1.5 font-sign text-xs text-slate-400">
              {filled(l.key)}/{fields.length}
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(f => {
          const source = f.source(form).trim();
          return (
            <FormField key={f.key} label={f.label} className={f.long ? 'sm:col-span-2' : ''} hint={source ? `中文：${source}` : undefined}>
              <input
                type="text"
                dir={meta.dir}
                value={current[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                maxLength={f.long ? 1000 : 300}
                className="field field-sm"
              />
            </FormField>
          );
        })}
      </div>
    </section>
  );
};
