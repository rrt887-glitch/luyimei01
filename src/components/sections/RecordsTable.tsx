import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Product } from '../../types';
import { Truck, ChevronDown, ChevronUp } from 'lucide-react';
import { categoryLabel, useProductCategories } from '../../config/categories';
import { localizeProduct } from '../../utils/productText';

const COLLAPSED_ROWS = 8;

interface RecordsTableProps {
  products: Product[];
  onOpenDetail: (product: Product) => void;
}

export const RecordsTable: React.FC<RecordsTableProps> = ({ products, onOpenDetail }) => {
  const { d, lang } = useI18n();
  const { categories } = useProductCategories();
  const [filterType, setFilterType] = useState<string>('all');
  const [expanded, setExpanded] = useState(false);

  const tabs = useMemo(
    () => [
      { id: 'all', label: d.cases.allTab },
      ...categories.filter(c => products.some(p => p.type === c.id)).map(c => ({ id: c.id, label: categoryLabel(c, lang) }))
    ],
    [categories, products, lang, d]
  );
  const activeType = tabs.some(t => t.id === filterType) ? filterType : 'all';
  // Pinned (官网置顶) products first; the table starts with 8 rows so a long catalogue
  // does not push the rest of the page away.
  const matching = products
    .filter(p => activeType === 'all' || p.type === activeType)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(!!b.p.featured) - Number(!!a.p.featured) || a.i - b.i)
    .map(x => x.p);
  const displayedProducts = expanded ? matching : matching.slice(0, COLLAPSED_ROWS);
  const hiddenCount = matching.length - COLLAPSED_ROWS;

  return (
    <section id="cases" className="py-16 md:py-24 bg-white">
      <div className="page-wrap">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-8">
          <div>
            <h2 className="section-title">{d.cases.title}</h2>
            <p className="mt-3 text-[15px] text-slate-600">{d.cases.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end lg:max-w-[60%]" role="group" aria-label={d.cases.groupLabel}>
            {tabs.map(t => (
              <button
                key={t.id}
                aria-pressed={activeType === t.id}
                onClick={() => {
                  setFilterType(t.id);
                  setExpanded(false);
                }}
                className={`h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors ${
                  activeType === t.id ? 'border-night bg-night text-white' : 'border-line bg-white text-slate-600 hover:border-slate-400 hover:text-night'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[820px] text-start border-collapse">
            <thead>
              <tr className="bg-concrete text-[13px] text-slate-600 text-start">
                <th className="py-3.5 px-5 font-semibold text-start">{d.cases.thProduct}</th>
                <th className="py-3.5 px-4 font-semibold text-start">{d.cases.thCategory}</th>
                <th className="py-3.5 px-4 font-semibold text-start">{d.cases.thPrice}</th>
                <th className="py-3.5 px-4 font-semibold text-start">{d.cases.thLeadTime}</th>
                <th className="py-3.5 px-4 font-semibold text-start">{d.cases.thMoq}</th>
                <th className="py-3.5 px-4 font-semibold text-start">{d.cases.thCapacity}</th>
                <th className="py-3.5 px-4 font-semibold text-start">{d.cases.thStatus}</th>
                <th className="py-3.5 px-5">
                  <span className="sr-only">{d.cases.thAction}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-sm">
              {displayedProducts.map(p => {
                const t = localizeProduct(p, lang, d, categories);
                return (
                  <tr key={p.id} className="hover:bg-concrete/50 transition-colors align-top">
                    <td className="py-4 px-5">
                      <div className="font-semibold text-night">{t.name}</div>
                      <div className="font-sign text-slate-500 text-[13px] mt-0.5">{p.model}</div>
                    </td>
                    <td className="py-4 px-4 text-slate-600 whitespace-nowrap">{t.kind}</td>
                    <td className="py-4 px-4 font-sign font-semibold text-night whitespace-nowrap">
                      {p.price} <span className="font-sans font-normal text-slate-500">{t.unit}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-start gap-1.5 text-night">
                        <Truck className="w-4 h-4 text-sky-deep shrink-0 mt-0.5" />
                        {t.leadTime || '—'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-700">{t.moq || '—'}</td>
                    <td className="py-4 px-4">
                      <div className="text-night">{t.capacityLabel || '—'}</div>
                      {t.baseLocation && <div className="text-[13px] text-slate-500 mt-0.5">{t.baseLocation}</div>}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${p.inStock ? 'text-emerald-700' : 'text-amber-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.inStock ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                        {p.inStock ? d.cases.statusOnSale : d.cases.statusMadeToOrder}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-end whitespace-nowrap">
                      <button onClick={() => onOpenDetail(p)} className="btn btn-sm btn-outline">
                        {d.cases.viewDetail}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {hiddenCount > 0 && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (expanded) document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth' });
                setExpanded(v => !v);
              }}
              aria-expanded={expanded}
              className="btn btn-outline"
            >
              {expanded ? d.cases.collapse : d.cases.showAll.replace('{n}', String(matching.length))}
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
