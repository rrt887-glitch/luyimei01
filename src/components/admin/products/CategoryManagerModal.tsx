import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { Modal } from '../AdminUI';
import { Product } from '../../../types';
import { MAX_CATEGORIES, ProductCategoryDef, newCategoryId, saveProductCategories } from '../../../config/categories';
import { adminApi } from '../../../services/adminApi';

interface Row extends ProductCategoryDef {
  isNew?: boolean;
}

interface CategoryManagerModalProps {
  open: boolean;
  onClose: () => void;
  categories: ProductCategoryDef[];
  products: Product[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const FOREIGN: { key: 'en' | 'ar' | 'ru'; label: string; dir?: 'rtl' }[] = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية', dir: 'rtl' },
  { key: 'ru', label: 'Русский' }
];

/**
 * Add, rename, reorder and delete product categories. Changes go live on the website (menu,
 * catalogue tabs, footer, supply table) as soon as they are saved. A category that still has
 * products can only be deleted after choosing where those products move to.
 */
export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ open, onClose, categories, products, onSaved, onError }) => {
  const [rows, setRows] = useState<Row[]>([]);
  // Deleted category id -> category its products move to.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lastAddedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(categories.map(c => ({ ...c, name: { ...c.name } })));
    setMoves({});
    setPendingDelete(null);
    setExpanded(null);
    setError('');
    // Only when the dialog opens: a live update must not wipe edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!lastAddedRef.current) return;
    document.getElementById(`cat-zh-${lastAddedRef.current}`)?.focus();
    lastAddedRef.current = null;
  }, [rows.length]);

  const countFor = (id: string) =>
    products.filter(p => p.type === id).length + Object.entries(moves).filter(([, to]) => to === id).reduce((n, [from]) => n + products.filter(p => p.type === from).length, 0);

  const update = (id: string, patch: Partial<Row['name']>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, name: { ...r.name, ...patch } } : r)));

  const move = (index: number, delta: number) =>
    setRows(prev => {
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const add = () => {
    if (rows.length >= MAX_CATEGORIES) return;
    const id = newCategoryId([...rows, ...categories]);
    lastAddedRef.current = id;
    setRows(prev => [...prev, { id, name: { zh: '' }, isNew: true }]);
    setExpanded(id);
  };

  const requestDelete = (row: Row) => {
    setError('');
    if (rows.length <= 1) {
      setError('至少要保留一个分类。');
      return;
    }
    if (countFor(row.id) === 0) {
      setRows(prev => prev.filter(r => r.id !== row.id));
      return;
    }
    setPendingDelete(row.id);
    setMoveTarget(rows.find(r => r.id !== row.id)?.id || '');
  };

  const confirmDelete = () => {
    if (!pendingDelete || !moveTarget) return;
    const from = pendingDelete;
    setMoves(prev => {
      const next: Record<string, string> = {};
      // Anything already moving into the deleted category now moves on to the new target.
      for (const [k, v] of Object.entries(prev)) next[k] = v === from ? moveTarget : v;
      next[from] = moveTarget;
      return next;
    });
    setRows(prev => prev.filter(r => r.id !== from));
    setPendingDelete(null);
  };

  const handleSave = async () => {
    setError('');
    const names = rows.map(r => r.name.zh.trim());
    if (names.some(n => !n)) {
      setError('每个分类都要填写中文名称。');
      const empty = rows.find(r => !r.name.zh.trim());
      if (empty) document.getElementById(`cat-zh-${empty.id}`)?.focus();
      return;
    }
    if (new Set(names).size !== names.length) {
      setError('分类的中文名称不能重复。');
      return;
    }
    setSaving(true);
    try {
      // Move products out of deleted categories first, so no product is ever left without one.
      const toMove = products.filter(p => moves[p.type]);
      for (const p of toMove) {
        await adminApi.updateProduct(p.id, { type: moves[p.type] });
      }
      await saveProductCategories(rows.map(({ id, name }) => ({ id, name })));
      const nameOf = (id: string) => categories.find(c => c.id === id)?.name.zh || rows.find(r => r.id === id)?.name.zh || id;
      const added = rows.filter(r => !categories.some(c => c.id === r.id)).map(r => r.name.zh);
      const removed = categories.filter(c => !rows.some(r => r.id === c.id)).map(c => `${c.name.zh}（商品移到 ${nameOf(moves[c.id] || '')}）`);
      const renamed = rows
        .map(r => ({ r, old: categories.find(c => c.id === r.id) }))
        .filter(x => x.old && JSON.stringify(x.old.name) !== JSON.stringify(x.r.name))
        .map(x => (x.old!.name.zh !== x.r.name.zh ? `${x.old!.name.zh} → ${x.r.name.zh}` : `${x.r.name.zh}（外语名称）`));
      const reordered = rows.map(r => r.id).filter(id => categories.some(c => c.id === id)).join() !== categories.filter(c => rows.some(r => r.id === c.id)).map(c => c.id).join();
      const parts = [
        added.length ? `新增：${added.join('、')}` : '',
        removed.length ? `删除：${removed.join('、')}` : '',
        renamed.length ? `改名：${renamed.join('、')}` : '',
        reordered ? '调整了顺序' : ''
      ].filter(Boolean);
      if (parts.length) adminApi.addAuditLog('修改商品分类', '商品分类', parts.join('；'));
      onSaved(toMove.length > 0 ? `分类已保存，${toMove.length} 款商品已移到新分类` : '分类已保存，官网已同步更新');
      onClose();
    } catch (err) {
      const msg = (err as Error).message || '保存分类失败，请检查网络后重试';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const deleting = rows.find(r => r.id === pendingDelete);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="管理商品分类"
      description="保存后，官网的产品菜单、产品目录分类和供货信息表会立即同步。排在前面的分类显示在前面。"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            取消
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-sm btn-primary">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {error && <div className="anim-pop mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">{error}</div>}

      <ol className="space-y-2.5">
        {rows.map((row, i) => {
          const count = countFor(row.id);
          const isOpen = expanded === row.id;
          const translated = FOREIGN.filter(f => (row.name[f.key] || '').trim()).length;
          return (
            <li key={row.id} className="rounded-xl border border-line bg-white">
              <div className="flex items-center gap-2 p-2.5">
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="icon-btn !w-7 !h-6" aria-label="上移">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="icon-btn !w-7 !h-6" aria-label="下移">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <label className="flex-1 min-w-0">
                  <span className="sr-only">中文名称</span>
                  <input
                    id={`cat-zh-${row.id}`}
                    type="text"
                    value={row.name.zh}
                    maxLength={40}
                    onChange={e => update(row.id, { zh: e.target.value })}
                    placeholder="中文名称，如 灌缝材料"
                    className="field field-sm"
                  />
                </label>
                <span className="hidden sm:inline text-xs text-slate-500 w-14 text-end shrink-0">{count} 款</span>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  aria-expanded={isOpen}
                  className={`btn btn-sm btn-ghost shrink-0 ${translated < FOREIGN.length ? 'text-amber-700' : ''}`}
                >
                  外语 {translated}/{FOREIGN.length}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <button type="button" onClick={() => requestDelete(row)} className="icon-btn danger shrink-0" aria-label={`删除分类 ${row.name.zh}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {isOpen && (
                <div className="grid gap-2.5 sm:grid-cols-3 border-t border-line px-3 py-3 bg-concrete/50 rounded-b-xl">
                  {FOREIGN.map(f => (
                    <label key={f.key} className="block">
                      <span className="field-label !text-xs">{f.label}</span>
                      <input
                        type="text"
                        dir={f.dir}
                        value={row.name[f.key] || ''}
                        maxLength={60}
                        onChange={e => update(row.id, { [f.key]: e.target.value })}
                        className="field field-sm"
                      />
                    </label>
                  ))}
                  <p className="sm:col-span-3 text-xs text-slate-500">没填的语言会显示英文名称；英文也没填时显示中文。</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={add} disabled={rows.length >= MAX_CATEGORIES} className="btn btn-sm btn-outline mt-3">
        <Plus className="w-4 h-4" />
        添加分类
      </button>

      {deleting && (
        <div className="anim-pop mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-950">
            「{deleting.name.zh || '未命名'}」下还有 <strong>{countFor(deleting.id)}</strong> 款商品。删除前，请选择把它们移到哪个分类：
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} className="field field-sm sm:max-w-xs">
              {rows
                .filter(r => r.id !== deleting.id)
                .map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name.zh || '未命名分类'}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={confirmDelete} className="btn btn-sm btn-danger">
                移过去并删除
              </button>
              <button type="button" onClick={() => setPendingDelete(null)} className="btn btn-sm btn-ghost">
                取消
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-amber-900/80">点「保存」后才会真正生效。</p>
        </div>
      )}
    </Modal>
  );
};
