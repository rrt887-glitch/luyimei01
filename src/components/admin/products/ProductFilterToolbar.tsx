import React, { useState } from 'react';
import { Search, Trash2, X, Settings2 } from 'lucide-react';
import { ProductCategoryDef } from '../../../config/categories';
import { Modal } from '../AdminUI';

type Status = 'all' | 'in_stock' | 'out_of_stock' | 'featured';

interface ProductFilterToolbarProps {
  totalCount: number;
  categories: ProductCategoryDef[];
  countsByCategory: Record<string, number>;
  categoryFilter: string;
  onChangeCategory: (cat: string) => void;
  onManageCategories: () => void;
  statusFilter: Status;
  onChangeStatus: (status: Status) => void;
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  selectedCount: number;
  onBatchStatus: (inStock: boolean) => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
}

const STATUSES: { key: Status; label: string }[] = [
  { key: 'all', label: '全部状态' },
  { key: 'in_stock', label: '在售' },
  { key: 'out_of_stock', label: '缺货' },
  { key: 'featured', label: '置顶' }
];

export const ProductFilterToolbar: React.FC<ProductFilterToolbarProps> = ({
  totalCount,
  categories,
  countsByCategory,
  categoryFilter,
  onChangeCategory,
  onManageCategories,
  statusFilter,
  onChangeStatus,
  searchQuery,
  onChangeSearch,
  selectedCount,
  onBatchStatus,
  onBatchDelete,
  onClearSelection
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <div className="flex items-end gap-2">
        <div className="tabs-underline flex-1 min-w-0 overflow-x-auto" role="tablist" aria-label="按分类筛选">
          <button role="tab" aria-selected={categoryFilter === 'all'} onClick={() => onChangeCategory('all')}>
            全部
            <span className="count">{totalCount}</span>
          </button>
          {categories.map(c => (
            <button key={c.id} role="tab" aria-selected={categoryFilter === c.id} onClick={() => onChangeCategory(c.id)}>
              {c.name.zh}
              <span className="count">{countsByCategory[c.id] || 0}</span>
            </button>
          ))}
          {countsByCategory.__none > 0 && (
            <button role="tab" aria-selected={categoryFilter === '__none'} onClick={() => onChangeCategory('__none')} className="!text-amber-700">
              未分类
              <span className="count">{countsByCategory.__none}</span>
            </button>
          )}
        </div>
        <button type="button" onClick={onManageCategories} className="btn btn-sm btn-ghost shrink-0 mb-1">
          <Settings2 className="w-4 h-4" />
          管理分类
        </button>
      </div>

      <div className="mt-4 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="segmented max-w-full overflow-x-auto" role="group" aria-label="按状态筛选">
          {STATUSES.map(st => (
            <button key={st.key} aria-pressed={statusFilter === st.key} onClick={() => onChangeStatus(st.key)}>
              {st.label}
            </button>
          ))}
        </div>
        <label className="relative md:w-80">
          <span className="sr-only">搜索商品</span>
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => onChangeSearch(e.target.value)}
            placeholder="搜索型号、价格或规格"
            className="field field-sm ps-9"
          />
        </label>
      </div>

      {selectedCount > 0 && (
        <div className="batch-bar fixed bottom-5 left-1/2 lg:left-[calc(50%+116px)] z-40 w-[calc(100%-2rem)] max-w-[600px] flex flex-wrap items-center gap-2 rounded-xl bg-night text-white px-4 py-3 shadow-2xl">
          <span className="text-sm font-semibold me-1">
            已选 <span className="font-sign text-sky">{selectedCount}</span> 款
          </span>
          <button onClick={() => onBatchStatus(true)} className="btn btn-sm text-white hover:bg-white/10">
            标为在售
          </button>
          <button onClick={() => onBatchStatus(false)} className="btn btn-sm text-white hover:bg-white/10">
            标为缺货
          </button>
          <button onClick={() => setConfirmingDelete(true)} className="btn btn-sm text-rose-200 hover:bg-rose-500/20">
            <Trash2 className="w-4 h-4" />
            删除
          </button>
          <button onClick={onClearSelection} className="icon-btn ms-auto !text-white/70 hover:!bg-white/10" aria-label="取消选择">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        size="sm"
        title={`删除选中的 ${selectedCount} 款商品？`}
        footer={
          <>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onBatchDelete();
              }}
              className="btn btn-sm btn-danger"
            >
              <Trash2 className="w-4 h-4" />
              删除 {selectedCount} 款
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">这些商品会立即从官网下线，无法恢复。</p>
      </Modal>
    </>
  );
};
