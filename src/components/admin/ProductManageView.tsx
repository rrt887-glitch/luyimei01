import React, { useState, useRef } from 'react';
import { Product, ProductTranslations } from '../../types';
import { initialProducts } from '../../data/products';
import { useProductCategories } from '../../config/categories';
import { hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import { adminApi } from '../../services/adminApi';
import { Plus, MessageCircle } from 'lucide-react';
import { PageHeader } from './AdminUI';
import { zh } from '../../i18n/locales/zh';

/** Built-in catalogue text for a translation key such as 'p1Spec' (undefined for free text). */
const builtinText = (key?: string): string | undefined =>
  key ? (zh.productsData as Record<string, string>)[key] : undefined;
import { deleteUploadedMedia } from '../../services/mediaStorage';
import { useMediaUploads } from './products/useMediaUploads';
import { ProductFilterToolbar } from './products/ProductFilterToolbar';
import { ProductTable } from './products/ProductTable';
import { ProductFormModal, ProductFormState } from './products/ProductFormModal';
import { ProductQuickModals } from './products/ProductQuickModals';
import { CategoryManagerModal } from './products/CategoryManagerModal';

/** Drop empty translation fields so Firestore only stores what was actually written. */
function cleanTranslations(t: ProductTranslations): ProductTranslations | undefined {
  const out: ProductTranslations = {};
  for (const lang of ['en', 'ar', 'ru'] as const) {
    const fields = Object.fromEntries(
      Object.entries(t[lang] || {})
        .map(([k, v]) => [k, String(v || '').trim()])
        .filter(([, v]) => v)
    );
    if (Object.keys(fields).length > 0) out[lang] = fields;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface ProductManageViewProps {
  products: Product[];
  onRefreshProducts: () => void;
  onShowToast: (msg: string) => void;
}

const INITIAL_FORM_STATE: ProductFormState = {
  model: '',
  customName: '',
  price: '$500–$800',
  tierPrice: '$450 (10+批发起订)',
  type: 'material',
  spec: '标准工业出口防护包装 / 25kg防潮桶装',
  customDesc: '',
  year: '2026',
  inStock: true,
  featured: false,
  videoUrl: '',
  images: [],
  videoThumbnail: '',
  supplyLeadTime: '现货 / 24-48小时发货',
  supplyMoq: '1台 / 10桶',
  supplyCapacityStatus: 'ample',
  supplyCapacityLabel: '月产800吨 · 常备库存200吨',
  supplyBaseLocation: '广州黄埔智造基地',
  supplyPackaging: '标准工业出口防护包装',
  translations: {}
};

export const ProductManageView: React.FC<ProductManageViewProps> = ({
  products,
  onRefreshProducts,
  onShowToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { categories } = useProductCategories();
  useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const categoryIds = new Set(categories.map(c => c.id));
  const countsByCategory: Record<string, number> = { __none: 0 };
  for (const p of products) {
    if (categoryIds.has(p.type)) countsByCategory[p.type] = (countsByCategory[p.type] || 0) + 1;
    else countsByCategory.__none += 1;
  }
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'out_of_stock' | 'featured'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; model: string } | null>(null);
  const [quickSupplyProduct, setQuickSupplyProduct] = useState<Product | null>(null);
  const [previewVideoModal, setPreviewVideoModal] = useState<string | null>(null);

  const [form, setForm] = useState<ProductFormState>(INITIAL_FORM_STATE);
  // ID reserved when the "new product" form opens, so uploads land in products/{id}/... from the start.
  const [draftProductId, setDraftProductId] = useState<string>('');
  // Storage URLs uploaded during the current form session (cleaned up if they end up unused).
  const sessionUploadsRef = useRef<string[]>([]);

  const mediaTargetId = editingProduct?.id || draftProductId;

  /** Delete files uploaded in this session that are not referenced by `keep`. */
  const cleanupSessionUploads = (keep: string[]) => {
    const keepSet = new Set(keep.filter(Boolean));
    const unused = sessionUploadsRef.current.filter(url => !keepSet.has(url));
    sessionUploadsRef.current = [];
    if (unused.length > 0) {
      void deleteUploadedMedia(unused);
    }
  };

  const formMediaUrls = () => [...form.images, form.videoUrl, form.videoThumbnail];
  const [newImageUrlInput, setNewImageUrlInput] = useState('');
  const uploads = useMediaUploads(
    mediaTargetId,
    url => {
      sessionUploadsRef.current.push(url);
      setForm(prev => {
        const images = [...prev.images, url].slice(0, 20);
        return { ...prev, images, videoThumbnail: prev.videoThumbnail || images[0] || '' };
      });
    },
    url => {
      sessionUploadsRef.current.push(url);
      setForm(prev => ({ ...prev, videoUrl: url }));
      onShowToast('视频已上传');
    }
  );

  const handleChangeForm = (updates: Partial<ProductFormState>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  /** Saving is blocked while files are still uploading or a failed upload has not been dealt with. */
  const uploadsBlockSave = (): boolean => {
    if (uploads.busy) {
      onShowToast('还有文件正在上传，请等上传完成后再保存');
      return true;
    }
    if (uploads.failed > 0) {
      onShowToast(`有 ${uploads.failed} 个文件上传失败：请点「重试」或移除后再保存`);
      return true;
    }
    return false;
  };

  const handleAddImageUrl = () => {
    if (!newImageUrlInput.trim()) return;
    setForm(prev => ({
      ...prev,
      images: [...prev.images, newImageUrlInput.trim()]
    }));
    setNewImageUrlInput('');
    onShowToast('已添加图片链接');
  };

  const handleRemoveImage = (index: number) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, idx) => idx !== index)
    }));
    onShowToast('已移除该图片');
  };

  const handleSetPrimaryImage = (index: number) => {
    if (index === 0) return;
    setForm(prev => {
      const item = prev.images[index];
      const rest = prev.images.filter((_, idx) => idx !== index);
      return {
        ...prev,
        images: [item, ...rest]
      };
    });
    onShowToast('已设为主图');
  };

  const filteredProducts = products.filter(p => {
    if (categoryFilter === '__none' ? categoryIds.has(p.type) : categoryFilter !== 'all' && p.type !== categoryFilter) return false;
    if (statusFilter === 'in_stock' && !p.inStock) return false;
    if (statusFilter === 'out_of_stock' && p.inStock) return false;
    if (statusFilter === 'featured' && !p.featured) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.model.toLowerCase().includes(q) ||
        (p.customName || '').toLowerCase().includes(q) ||
        p.price.toLowerCase().includes(q) ||
        p.specKey.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchStatus = async (inStock: boolean) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await adminApi.batchUpdateProductStatus(Array.from(selectedIds), inStock);
      setSelectedIds(new Set());
      onRefreshProducts();
      onShowToast(`已将 ${count} 款商品${inStock ? '标为在售' : '标为缺货'}`);
    } catch (err) {
      onShowToast((err as Error).message || '批量更新商品状态失败，请检查网络或管理员权限');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await adminApi.batchDeleteProducts(Array.from(selectedIds));
      setSelectedIds(new Set());
      onRefreshProducts();
      onShowToast(`已删除 ${count} 款商品`);
    } catch (err) {
      onShowToast((err as Error).message || '批量删除商品同步失败，请检查网络或权限');
    }
  };

  const handleOpenAdd = () => {
    setForm({
      ...INITIAL_FORM_STATE,
      type: categoryFilter !== 'all' && categoryIds.has(categoryFilter) ? categoryFilter : categories[0]?.id || 'material',
      model: 'LYM-NEW-' + Math.floor(Math.random() * 900 + 100)
    });
    setEditingProduct(null);
    setDraftProductId(adminApi.createDraftProductId());
    sessionUploadsRef.current = [];
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadsBlockSave()) return;
    if (form.videoUrl.startsWith('data:video/')) {
      onShowToast('视频请用上传按钮或填写 https 链接，不能直接粘贴文件内容');
      return;
    }
    try {
      await adminApi.addProduct({
        nameKey: form.customName.trim() ? form.customName.trim() : 'p1Name',
        customName: form.customName.trim() || undefined,
        type: form.type,
        catKey: form.type,
        model: form.model,
        descKey: form.customDesc.trim() ? form.customDesc.trim() : 'p1Desc',
        customDesc: form.customDesc.trim() || undefined,
        price: form.price,
        unitKey: form.type === 'equipment' ? 'p3Unit' : 'p1Unit',
        specKey: form.spec,
        customSpec: form.spec.trim() || undefined,
        inStock: form.inStock,
        year: Number(form.year) || 2026,
        brand: 'lym',
        condition: 'new',
        featured: form.featured,
        videoUrl: form.videoUrl.trim() || undefined,
        videoThumbnail: form.videoThumbnail || form.images[0],
        images: form.images,
        tierPrices: form.tierPrice ? [{ minQty: 10, priceUsd: form.tierPrice }] : [],
        supplySpecs: {
          leadTime: form.supplyLeadTime.trim() || '现货 / 24-48小时发货',
          moq: form.supplyMoq.trim() || '1台 / 10桶',
          capacityStatus: form.supplyCapacityStatus,
          capacityLabel: form.supplyCapacityLabel.trim() || '常备现货储备',
          baseLocation: form.supplyBaseLocation.trim() || '广州智造基地',
          packaging: form.supplyPackaging.trim() || '标准工业防护包装'
        },
        translations: cleanTranslations(form.translations)
      }, draftProductId);
      cleanupSessionUploads(formMediaUrls());
      setDraftProductId('');
      setIsAddModalOpen(false);
      onRefreshProducts();
      onShowToast('商品已添加，官网同步显示');
    } catch (err) {
      onShowToast((err as Error).message || '商品写入云端失败，请检查网络连接或字段限制');
    }
  };

  const handleOpenEdit = (p: Product) => {
    sessionUploadsRef.current = [];
    setEditingProduct(p);
    setForm({
      model: p.model,
      customName: p.customName || (p.nameKey.startsWith('p') ? '' : p.nameKey) || '',
      price: p.price,
      tierPrice: p.tierPrices?.[0]?.priceUsd || '$420 (批发优惠价)',
      type: p.type,
      // Show the readable built-in spec instead of its translation key (e.g. 'p1Spec').
      spec: p.customSpec || builtinText(p.specKey) || p.specKey || '',
      customDesc: p.customDesc || (p.descKey.startsWith('p') ? '' : p.descKey) || '',
      year: String(p.year),
      inStock: p.inStock,
      featured: !!p.featured,
      videoUrl: p.videoUrl || '',
      videoThumbnail: p.videoThumbnail || '',
      images: p.images || [],
      supplyLeadTime: p.supplySpecs?.leadTime || '现货 / 24-48小时发货',
      supplyMoq: p.supplySpecs?.moq || '1台 / 10桶',
      supplyCapacityStatus: p.supplySpecs?.capacityStatus || 'ample',
      supplyCapacityLabel: p.supplySpecs?.capacityLabel || '月产800吨 · 产能充沛',
      supplyBaseLocation: p.supplySpecs?.baseLocation || '广州黄埔智造基地',
      supplyPackaging: p.supplySpecs?.packaging || '标准工业出口防护包装',
      // Built-in products start from the translations shipped with the site.
      translations: JSON.parse(JSON.stringify(p.translations || initialProducts.find(cp => cp.id === p.id)?.translations || {}))
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (uploadsBlockSave()) return;
    if (form.videoUrl.startsWith('data:video/')) {
      onShowToast('视频请用上传按钮或填写 https 链接，不能直接粘贴文件内容');
      return;
    }
    const originalBuiltinSpec = builtinText(editingProduct.specKey);
    const specKeepsBuiltin =
      !editingProduct.customSpec && !!originalBuiltinSpec && form.spec.trim() === originalBuiltinSpec;
    try {
      await adminApi.updateProduct(editingProduct.id, {
        model: form.model,
        customName: form.customName.trim() || undefined,
        nameKey: form.customName.trim() || (editingProduct.nameKey.startsWith('p') ? editingProduct.nameKey : 'p1Name'),
        price: form.price,
        type: form.type,
        specKey: specKeepsBuiltin ? editingProduct.specKey : form.spec.trim() || editingProduct.specKey,
        // Untouched built-in specs stay as translation keys so every site language keeps its own text.
        customSpec: specKeepsBuiltin ? undefined : form.spec.trim() || undefined,
        customDesc: form.customDesc.trim() || undefined,
        descKey: form.customDesc.trim() || (editingProduct.descKey.startsWith('p') ? editingProduct.descKey : 'p1Desc'),
        year: Number(form.year) || 2026,
        inStock: form.inStock,
        featured: form.featured,
        videoUrl: form.videoUrl.trim() || undefined,
        videoThumbnail: form.videoThumbnail || form.images[0],
        images: form.images,
        tierPrices: form.tierPrice ? [{ minQty: 10, priceUsd: form.tierPrice }] : [],
        supplySpecs: {
          leadTime: form.supplyLeadTime.trim() || '现货 / 24-48小时发货',
          moq: form.supplyMoq.trim() || '1台 / 10桶',
          capacityStatus: form.supplyCapacityStatus,
          capacityLabel: form.supplyCapacityLabel.trim() || '常备现货储备',
          baseLocation: form.supplyBaseLocation.trim() || '广州智造基地',
          packaging: form.supplyPackaging.trim() || '标准工业防护包装'
        },
        translations: cleanTranslations(form.translations)
      });
      cleanupSessionUploads(formMediaUrls());
      setEditingProduct(null);
      onRefreshProducts();
      onShowToast('商品已保存，官网同步更新');
    } catch (err) {
      onShowToast((err as Error).message || '云端保存失败，未修改的数据已保留在弹窗中');
    }
  };

  const handleOpenQuickSupply = (p: Product) => {
    setQuickSupplyProduct(p);
    handleChangeForm({
      supplyLeadTime: p.supplySpecs?.leadTime || '现货 / 24-48小时发货',
      supplyMoq: p.supplySpecs?.moq || '1台 / 10桶',
      supplyCapacityStatus: p.supplySpecs?.capacityStatus || 'ample',
      supplyCapacityLabel: p.supplySpecs?.capacityLabel || '月产800吨 · 产能充沛',
      supplyBaseLocation: p.supplySpecs?.baseLocation || '广州黄埔智造基地',
      supplyPackaging: p.supplySpecs?.packaging || '标准工业出口防护包装'
    });
  };

  const handleSaveQuickSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupplyProduct) return;
    try {
      await adminApi.updateProduct(quickSupplyProduct.id, {
        supplySpecs: {
          leadTime: form.supplyLeadTime.trim() || '现货 / 24-48小时发货',
          moq: form.supplyMoq.trim() || '1台 / 10桶',
          capacityStatus: form.supplyCapacityStatus,
          capacityLabel: form.supplyCapacityLabel.trim() || '常备现货储备',
          baseLocation: form.supplyBaseLocation.trim() || '广州智造基地',
          packaging: form.supplyPackaging.trim() || '标准工业防护包装'
        }
      });
      setQuickSupplyProduct(null);
      onRefreshProducts();
      onShowToast(`已更新 ${quickSupplyProduct.model} 的供货信息`);
    } catch (err) {
      onShowToast((err as Error).message || '更新供货参数至云端失败');
    }
  };

  const handleToggleFeatured = async (product: Product) => {
    try {
      await adminApi.updateProduct(product.id, { featured: !product.featured });
      onRefreshProducts();
      onShowToast(`已${!product.featured ? '置顶推荐' : '取消置顶'}：${product.model}`);
    } catch (err) {
      onShowToast((err as Error).message || '更新置顶状态失败');
    }
  };

  const handleToggleStock = async (product: Product) => {
    try {
      await adminApi.updateProduct(product.id, { inStock: !product.inStock });
      onRefreshProducts();
      onShowToast(`${product.model} 已${!product.inStock ? '标为在售' : '标为缺货'}`);
    } catch (err) {
      onShowToast((err as Error).message || '更新库存状态失败');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    try {
      await adminApi.deleteProduct(deleteConfirmTarget.id);
      setDeleteConfirmTarget(null);
      onRefreshProducts();
      onShowToast(`已删除 ${deleteConfirmTarget.model}`);
    } catch (err) {
      onShowToast((err as Error).message || '云端删除商品失败');
    }
  };

  const inStockCount = products.filter(p => p.inStock).length;

  return (
    <div className="adm-page">
      <PageHeader
        title="商品库"
        description={`在售 ${inStockCount} 款，共 ${products.length} 款。这里的修改会实时同步到官网产品目录和供货信息表。`}
        actions={
          <button onClick={handleOpenAdd} className="btn btn-sm btn-primary">
            <Plus className="w-4 h-4" />
            添加商品
          </button>
        }
      />

      {!waConfigured && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <MessageCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <p>
            还没有填写官网 WhatsApp 号码，所以官网产品卡片上显示的是「询价」（跳到询价表单），而不是「WhatsApp 咨询」。
            到「经营概览」→「官网联系方式」填写 WhatsApp 号码并保存后，每款产品都会出现一键跳转 WhatsApp 的按钮，并自动带上产品名称和型号。
          </p>
        </div>
      )}

      <ProductFilterToolbar
        totalCount={products.length}
        categories={categories}
        countsByCategory={countsByCategory}
        onManageCategories={() => setIsCategoryManagerOpen(true)}
        categoryFilter={categoryFilter}
        onChangeCategory={setCategoryFilter}
        statusFilter={statusFilter}
        onChangeStatus={setStatusFilter}
        searchQuery={searchQuery}
        onChangeSearch={setSearchQuery}
        selectedCount={selectedIds.size}
        onBatchStatus={handleBatchStatus}
        onBatchDelete={handleBatchDelete}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      <ProductTable
        products={filteredProducts}
        categories={categories}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        onToggleSelect={handleToggleSelect}
        onPreviewVideo={setPreviewVideoModal}
        onToggleFeatured={handleToggleFeatured}
        onToggleStock={handleToggleStock}
        onOpenQuickSupply={handleOpenQuickSupply}
        onOpenEdit={handleOpenEdit}
        onRequestDelete={setDeleteConfirmTarget}
      />

      <ProductFormModal
        isOpen={isAddModalOpen || !!editingProduct}
        builtinSpec={editingProduct && !editingProduct.customSpec ? builtinText(editingProduct.specKey) : undefined}
        categories={categories}
        onManageCategories={() => setIsCategoryManagerOpen(true)}
        editingProduct={editingProduct}
        form={form}
        onChangeForm={handleChangeForm}
        newImageUrlInput={newImageUrlInput}
        onChangeNewImageUrlInput={setNewImageUrlInput}
        onAddImageUrl={handleAddImageUrl}
        onRemoveImage={handleRemoveImage}
        onSetPrimaryImage={handleSetPrimaryImage}
        uploads={uploads}
        onSubmit={editingProduct ? handleSaveEdit : handleSaveAdd}
        onClose={() => {
          // Cancelled: stop uploads; nothing uploaded in this session is referenced by a saved product.
          uploads.reset();
          cleanupSessionUploads([]);
          setDraftProductId('');
          setIsAddModalOpen(false);
          setEditingProduct(null);
        }}
      />

      <CategoryManagerModal
        open={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={categories}
        products={products}
        onSaved={msg => {
          onRefreshProducts();
          onShowToast(msg);
        }}
        onError={onShowToast}
      />

      <ProductQuickModals
        deleteConfirmTarget={deleteConfirmTarget}
        onCancelDelete={() => setDeleteConfirmTarget(null)}
        onConfirmDelete={handleConfirmDelete}
        quickSupplyProduct={quickSupplyProduct}
        form={form}
        onChangeForm={handleChangeForm}
        onSaveQuickSupply={handleSaveQuickSupply}
        onCloseQuickSupply={() => setQuickSupplyProduct(null)}
        previewVideoModal={previewVideoModal}
        onClosePreviewVideo={() => setPreviewVideoModal(null)}
      />
    </div>
  );
};
