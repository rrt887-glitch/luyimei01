import React, { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { Product } from '../../types';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { SmartImage } from '../common/SmartImage';
import { ProductIllustration } from '../common/SvgIllustrations';
import { useProductCategories } from '../../config/categories';
import { localizeProduct } from '../../utils/productText';
import { getWhatsAppInquiryUrl, hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';

/** How many products the homepage row shows (the newest first). */
export const NEW_ARRIVALS_LIMIT = 8;

/** Products marked "新款推荐" in the console, newest first. */
export function pickNewArrivals(products: Product[]): Product[] {
  return products
    .filter(p => p.newArrivalAt && !p.isDeleted && p.status !== 'draft' && p.status !== 'archived')
    .sort((a, b) => (b.newArrivalAt || '').localeCompare(a.newArrivalAt || ''))
    .slice(0, NEW_ARRIVALS_LIMIT);
}

interface Props {
  products: Product[];
  onOpenDetail: (product: Product) => void;
  onInquire: (product: Product) => void;
}

/** Homepage "New arrivals": a scrolling row on phones, a grid of four on wide screens. Hidden when empty. */
export const NewArrivalsSection: React.FC<Props> = ({ products, onOpenDetail, onInquire }) => {
  const { d, lang } = useI18n();
  const { categories } = useProductCategories();
  useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const list = useMemo(() => pickNewArrivals(products), [products]);
  if (list.length === 0) return null;

  return (
    <section id="new" className="pt-14 pb-4 md:pt-20 md:pb-6 bg-white">
      <div className="page-wrap">
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,26rem)] md:items-end mb-7">
          <h2 className="section-title">{d.site.newTitle}</h2>
          <p className="text-[15px] text-slate-600 leading-relaxed">{d.site.newSubtitle}</p>
        </div>

        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
          {list.map(product => {
            const t = localizeProduct(product, lang, d, categories);
            const photo = product.images?.[0];
            return (
              <article
                key={product.id}
                className="group snap-start shrink-0 w-[72%] sm:w-auto flex flex-col rounded-xl border border-line bg-white overflow-hidden transition-colors hover:border-slate-400"
              >
                <button
                  type="button"
                  onClick={() => onOpenDetail(product)}
                  className="relative block aspect-[4/3] bg-concrete overflow-hidden"
                  aria-label={`${d.catalog.details}：${t.name}`}
                >
                  {photo ? (
                    <SmartImage
                      src={photo}
                      alt={t.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <span className="flex w-full h-full items-center justify-center p-8">
                      <ProductIllustration id={product.id} className="max-h-full w-auto" />
                    </span>
                  )}
                  <span className="absolute top-3 start-3 rounded-full bg-sky px-2.5 py-0.5 text-xs font-bold text-night">{d.site.newBadge}</span>
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[13px] text-slate-500 truncate">{t.kind}</span>
                  <h3 className="mt-1 font-bold text-night leading-snug line-clamp-2">{t.name}</h3>
                  <div className="flex-1 min-h-3" aria-hidden="true" />
                  <div className="mt-2 text-night">
                    <span className="font-sign font-semibold text-lg" dir="ltr">{product.price}</span>
                    {t.unit && <span className="ms-1 text-sm text-slate-500">{t.unit}</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {waConfigured ? (
                      <a
                        href={getWhatsAppInquiryUrl(t.name, product.model, lang)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm flex-1 bg-[#25D366] text-night hover:bg-[#20bd5a]"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span className="truncate">{d.catalog.inquiry}</span>
                      </a>
                    ) : (
                      <button type="button" onClick={() => onInquire(product)} className="btn btn-sm btn-primary flex-1">
                        <MessageCircle className="w-4 h-4" />
                        <span className="truncate">{d.catalog.requestQuote}</span>
                      </button>
                    )}
                    <button type="button" onClick={() => onOpenDetail(product)} className="btn btn-sm btn-outline shrink-0" aria-label={`${d.catalog.details}：${t.name}`}>
                      <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
