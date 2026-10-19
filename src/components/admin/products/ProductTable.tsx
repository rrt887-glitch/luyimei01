import React from 'react';
import { Product } from '../../../types';
import { Image as ImageIcon, Play, Star, Truck, Pencil, Trash2, Package } from 'lucide-react';
import { EmptyState } from '../AdminUI';
import { zh } from '../../../i18n/locales/zh';
import { ProductCategoryDef } from '../../../config/categories';

const displayName = (p: Product) =>
  p.customName || (zh.productsData as Record<string, string>)[p.nameKey] || p.model;

interface ProductTableProps {
  products: Product[];
  categories: ProductCategoryDef[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onPreviewVideo: (url: string | null) => void;
  onToggleFeatured: (product: Product) => void;
  onToggleStock: (product: Product) => void;
  onOpenQuickSupply: (product: Product) => void;
  onOpenEdit: (product: Product) => void;
  onRequestDelete: (target: { id: string; model: string }) => void;
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  categories,
  selectedIds,
  onSelectAll,
  onToggleSelect,
  onPreviewVideo,
  onToggleFeatured,
  onToggleStock,
  onOpenQuickSupply,
  onOpenEdit,
  onRequestDelete
}) => {
  const categoryName = (id: string) => categories.find(c => c.id === id)?.name.zh || '';
  if (products.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={<Package className="w-5 h-5" />} title="没有符合条件的商品" hint="换个筛选条件，或添加新商品。" />
      </div>
    );
  }

  const allSelected = selectedIds.size === products.length && products.length > 0;

  return (
    <div className="panel relative overflow-x-auto">
      <table className="tbl min-w-[920px]">
        <thead>
          <tr>
            <th className="w-10">
              <input type="checkbox" className="adm-check" checked={allSelected} onChange={onSelectAll} aria-label="全选" />
            </th>
            <th>商品</th>
            <th className="text-end">标价（USD）</th>
            <th>供货</th>
            <th className="text-center">置顶</th>
            <th>库存</th>
            <th>
              <span className="sr-only">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map(product => {
            const isSelected = selectedIds.has(product.id);
            const imgCount = product.images?.length || 0;
            return (
              <tr key={product.id} data-selected={isSelected}>
                <td>
                  <input
                    type="checkbox"
                    className="adm-check"
                    checked={isSelected}
                    onChange={() => onToggleSelect(product.id)}
                    aria-label={`选择 ${product.model}`}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenEdit(product)}
                      className="relative flex items-center justify-center w-14 h-14 shrink-0 overflow-hidden rounded-lg bg-concrete"
                      aria-label={`编辑 ${product.model}`}
                    >
                      {imgCount > 0 ? (
                        <img src={product.images![0]} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <button type="button" onClick={() => onOpenEdit(product)} className="font-semibold text-night hover:text-sky-deep text-start truncate block max-w-[18rem]">
                        {displayName(product)}
                      </button>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        {displayName(product) !== product.model && <span className="font-sign">{product.model}</span>}
                        <span className={categoryName(product.type) ? '' : 'text-amber-700'}>{categoryName(product.type) || '未分类'}</span>
                        {imgCount > 0 && <span>{imgCount} 张图</span>}
                        {product.videoUrl && (
                          <button
                            type="button"
                            onClick={() => onPreviewVideo(product.videoUrl || null)}
                            className="inline-flex items-center gap-0.5 font-medium text-sky-deep hover:underline"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            视频
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="text-end whitespace-nowrap">
                  <div className="font-sign font-semibold">{product.price}</div>
                  {product.tierPrices?.[0]?.priceUsd && (
                    <div className="font-sign text-xs text-slate-500">批量 {product.tierPrices[0].priceUsd}</div>
                  )}
                </td>
                <td className="max-w-[16rem]">
                  <button
                    type="button"
                    onClick={() => onOpenQuickSupply(product)}
                    className="group text-start"
                    title="修改供货信息"
                  >
                    <span className="flex items-center gap-1.5 text-night group-hover:text-sky-deep">
                      <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{product.supplySpecs?.leadTime || '现货 / 48h 出库'}</span>
                    </span>
                    <span className="block text-xs text-slate-500 truncate">
                      起订 {product.supplySpecs?.moq || '—'}
                    </span>
                  </button>
                </td>
                <td className="text-center">
                  <button
                    onClick={() => onToggleFeatured(product)}
                    className={`icon-btn ${product.featured ? '!text-amber-500' : '!text-slate-300 hover:!text-amber-400'}`}
                    aria-pressed={!!product.featured}
                    aria-label={product.featured ? '取消置顶' : '置顶'}
                    title={product.featured ? '取消置顶' : '在官网置顶'}
                  >
                    <Star className={`w-4 h-4 ${product.featured ? 'fill-amber-400' : ''}`} />
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={product.inStock}
                    onClick={() => onToggleStock(product)}
                    className="inline-flex items-center gap-2 text-[13px] text-slate-600"
                    title="切换在售 / 缺货"
                  >
                    <span className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${product.inStock ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span
                        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[inset-inline-start] duration-200 ${
                          product.inStock ? 'start-[16px]' : 'start-[2px]'
                        }`}
                      />
                    </span>
                    {product.inStock ? '在售' : '缺货'}
                  </button>
                </td>
                <td>
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={() => onOpenEdit(product)} className="icon-btn" aria-label="编辑" title="编辑">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => onRequestDelete({ id: product.id, model: product.model })} className="icon-btn danger" aria-label="删除" title="删除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
