import React, { useState, useMemo, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { Product, ProductFilterCategory } from '../../types';
import { ProductIllustration } from '../common/SvgIllustrations';
import { Search, Heart, ChevronLeft, ChevronRight, SlidersHorizontal, X, Loader2, MessageCircle, Play, ChevronDown, Info } from 'lucide-react';
import { getWhatsAppInquiryUrl, hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import { ProductVideoModal } from '../modals/ProductVideoModal';
import { Reveal } from '../common/Motion';
import { categoryLabel, useProductCategories } from '../../config/categories';
import { localizeProduct } from '../../utils/productText';

interface ProductCatalogProps {
  products: Product[];
  savedIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  syncingFavId?: string | null;
  onOpenDetail: (product: Product) => void;
  onInquire: (product: Product) => void;
  activeCategory: ProductFilterCategory;
  onSelectCategory: (category: ProductFilterCategory) => void;
  onlyFavorites: boolean;
  onClearOnlyFavorites: () => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  products,
  savedIds,
  onToggleFavorite,
  syncingFavId,
  onOpenDetail,
  onInquire,
  activeCategory,
  onSelectCategory,
  onlyFavorites,
  onClearOnlyFavorites
}) => {
  const { d, lang } = useI18n();
  const { categories } = useProductCategories();
  useSiteContactConfig(); // Subscribe to real-time contact config updates
  const waConfigured = hasConfiguredWhatsApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCondition, setFilterCondition] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [activePhotoIndices, setActivePhotoIndices] = useState<Record<string, number>>({});
  const [videoModalProduct, setVideoModalProduct] = useState<Product | null>(null);

  // Show a few rows first: 3 rows of 3 on wide screens, 3 rows of 2 (or 6 single cards) below.
  const pageSize = usePageSize();
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const texts = useMemo(() => new Map(products.map(p => [p.id, localizeProduct(p, lang, d, categories)])), [products, lang, d, categories]);

  // A category picked from the menu that has since been deleted falls back to "all".
  const effectiveCategory = activeCategory === 'all' || categories.some(c => c.id === activeCategory) ? activeCategory : 'all';

  const filteredProducts = useMemo(() => {
    const list = products.filter(p => {
      // Category filter
      if (effectiveCategory !== 'all' && p.type !== effectiveCategory) {
        return false;
      }
      // Favorites filter
      if (onlyFavorites && !savedIds.has(p.id)) {
        return false;
      }
      // Advanced filters
      if (filterBrand !== 'all' && p.brand !== filterBrand) return false;
      if (filterCondition !== 'all' && p.condition !== filterCondition) return false;
      if (filterStock !== 'all' && filterStock === 'sale' && !p.inStock) return false;
      if (filterYear !== 'all' && String(p.year) !== filterYear) return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const t = texts.get(p.id);
      return [t?.name, t?.desc, t?.spec, t?.kind, t?.category, p.model].some(v => (v || '').toLowerCase().includes(q));
    });

    // Sort featured (置顶) items to the top
    return list.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });
  }, [products, effectiveCategory, onlyFavorites, savedIds, filterBrand, filterCondition, filterStock, filterYear, searchQuery, texts]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, effectiveCategory, onlyFavorites, filterBrand, filterCondition, filterStock, filterYear, searchQuery]);

  const shownProducts = filteredProducts.slice(0, visibleCount);
  const remaining = filteredProducts.length - shownProducts.length;


  const resetFilters = () => {
    setSearchQuery('');
    onSelectCategory('all');
    setFilterBrand('all');
    setFilterCondition('all');
    setFilterStock('all');
    setFilterYear('all');
  };

  const showPhoto = (productId: string, total: number, step: number) => {
    setActivePhotoIndices(prev => {
      const curr = prev[productId] || 0;
      return { ...prev, [productId]: (curr + step + total) % total };
    });
  };


  const filterSelects: { label: string; value: string; set: (v: string) => void; options: [string, string][] }[] = [
    { label: d.catalog.brandLabel, value: filterBrand, set: setFilterBrand, options: [['all', d.catalog.allOption], ['lym', d.catalog.brandLYM]] },
    { label: d.catalog.conditionLabel, value: filterCondition, set: setFilterCondition, options: [['all', d.catalog.allOption], ['new', d.catalog.conditionNew]] },
    { label: d.catalog.stockLabel, value: filterStock, set: setFilterStock, options: [['all', d.catalog.allOption], ['sale', d.catalog.inStock]] },
    { label: d.catalog.yearLabel, value: filterYear, set: setFilterYear, options: [['all', d.catalog.allOption], ['2026', '2026']] }
  ];

  // One tab per category that has products (or is selected), in the order set in the console.
  const tabs: { id: ProductFilterCategory; label: string; count: number }[] = [
    { id: 'all', label: d.catalog.allProducts, count: products.length },
    ...categories
      .map(c => ({ id: c.id, label: categoryLabel(c, lang), count: products.filter(p => p.type === c.id).length }))
      .filter(tab => tab.count > 0 || tab.id === effectiveCategory)
  ];

  return (
    <section id="products" className="pt-14 pb-20 md:pt-20 md:pb-24 bg-white">
      <div className="page-wrap">
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,26rem)] md:items-end mb-8">
          <h2 className="section-title">{d.catalog.title}</h2>
          <p className="text-[15px] text-slate-600 leading-relaxed">{d.catalog.subtitle}</p>
        </div>

        {/* Categories: wrapping chips; on phones a dropdown once there are more than a few. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div role="group" aria-label={d.catalog.categoryGroup} className={`${tabs.length > 4 ? 'hidden sm:flex' : 'flex'} flex-wrap gap-2 min-w-0`}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                aria-pressed={effectiveCategory === tab.id}
                onClick={() => onSelectCategory(tab.id)}
                className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-sm font-medium transition-colors ${
                  effectiveCategory === tab.id ? 'border-night bg-night text-white' : 'border-line bg-white text-slate-600 hover:border-slate-400 hover:text-night'
                }`}
              >
                {tab.label}
                <span className={`font-sign text-xs ${effectiveCategory === tab.id ? 'text-white/60' : 'text-slate-400'}`}>{tab.count}</span>
              </button>
            ))}
          </div>
          {tabs.length > 4 && (
            <label className="sm:hidden relative block">
              <span className="sr-only">{d.catalog.categoryLabel}</span>
              <select value={effectiveCategory} onChange={e => onSelectCategory(e.target.value)} className="field font-medium">
                {tabs.map(tab => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}（{tab.count}）
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-2 lg:shrink-0">
            <label className="relative flex-1 sm:w-72">
              <span className="sr-only">{d.catalog.searchPlaceholder}</span>
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={d.catalog.searchPlaceholder}
                className="field ps-9 pe-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-night"
                  aria-label={d.catalog.clearFilters}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              aria-expanded={showAdvancedFilters}
              className={`btn shrink-0 ${showAdvancedFilters ? 'bg-night text-white' : 'btn-outline'}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">{d.catalog.moreFilters}</span>
            </button>
          </div>
        </div>

        {showAdvancedFilters && (
          <div className="anim-pop grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 p-4 sm:p-5 rounded-xl bg-concrete">
            {filterSelects.map(f => (
              <label key={f.label} className="block">
                <span className="field-label">{f.label}</span>
                <select value={f.value} onChange={e => f.set(e.target.value)} className="field">
                  {f.options.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {onlyFavorites && (
          <div className="anim-pop flex items-center justify-between gap-3 mt-4 px-4 py-3 rounded-lg bg-sky-wash text-sm text-night">
            <span className="inline-flex items-center gap-2">
              <Heart className="w-4 h-4 fill-sky text-sky-deep" />
              {d.catalog.onlyFavorites}（{savedIds.size}）
            </span>
            <button onClick={onClearOnlyFavorites} className="font-semibold text-sky-deep hover:underline">
              {d.catalog.showAll}
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 mt-8">
          {shownProducts.map((product, i) => {
            const isSaved = savedIds.has(product.id);
            const isSyncing = syncingFavId === product.id;
            const { name, desc, kind: cat, unit, spec } = texts.get(product.id) || localizeProduct(product, lang, d, categories);
            const photos = product.images || [];
            const photoIdx = activePhotoIndices[product.id] || 0;

            return (
              <Reveal
                as="article"
                index={i % 3}
                key={product.id}
                className="group flex flex-col rounded-xl border border-line bg-white overflow-hidden transition-colors hover:border-slate-400"
              >
                <div className="relative aspect-[4/3] bg-concrete overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(product)}
                    className="absolute inset-0 w-full h-full"
                    aria-label={`${d.catalog.details}：${name}`}
                  >
                    {photos.length > 0 ? (
                      <img
                        key={photoIdx}
                        src={photos[photoIdx]}
                        alt={name}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="animate-in w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="flex w-full h-full items-center justify-center p-8">
                        <ProductIllustration id={product.id} className="max-h-full w-auto" />
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => onToggleFavorite(product.id)}
                    disabled={isSyncing}
                    aria-pressed={isSaved}
                    aria-label={`${d.catalog.saveProduct}：${name}`}
                    className={`absolute top-3 end-3 inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                      isSaved ? 'bg-sky text-night' : 'bg-white/90 text-slate-600 hover:text-night hover:bg-white'
                    } ${isSyncing ? 'cursor-wait' : ''}`}
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-[18px] h-[18px] ${isSaved ? 'fill-night' : ''}`} />}
                  </button>

                  {product.videoUrl && (
                    <span className="absolute top-3 start-3 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-night/75 text-white text-xs font-medium backdrop-blur-sm pointer-events-none">
                      <Play className="w-3 h-3 fill-sky text-sky" />
                      {d.catalog.watchVideo}
                    </span>
                  )}

                  {photos.length > 1 && (
                    <div className="absolute bottom-3 start-3 flex items-center gap-1 rounded-full bg-night/75 text-white backdrop-blur-sm p-1">
                      <button
                        type="button"
                        aria-label={d.dialog.prevPhoto}
                        onClick={() => showPhoto(product.id, photos.length, -1)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-white/15"
                      >
                        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                      </button>
                      <span className="font-sign text-xs px-1" aria-live="polite">
                        {photoIdx + 1}/{photos.length}
                      </span>
                      <button
                        type="button"
                        aria-label={d.dialog.nextPhoto}
                        onClick={() => showPhoto(product.id, photos.length, 1)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-white/15"
                      >
                        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-3 text-[13px] text-slate-500">
                    <span className="truncate">{cat}</span>
                    <span className="font-sign shrink-0 truncate max-w-[45%]">{product.model}</span>
                  </div>
                  <h3 className="mt-1.5 text-lg font-bold text-night leading-snug line-clamp-2">{name}</h3>
                  {desc && <p className="mt-1.5 text-sm text-slate-600 leading-relaxed line-clamp-2">{desc}</p>}
                  {spec && <p className="mt-2 text-[13px] text-slate-500 line-clamp-1">{spec}</p>}

                  <div className="flex-1 min-h-4" aria-hidden="true" />
                  <div className="pt-4 border-t border-concrete">
                    <div className="text-night">
                      <span className="font-sign font-semibold text-xl">{product.price}</span>
                      {unit && <span className="ms-1 text-sm text-slate-500">{unit}</span>}
                    </div>

                    {/* Actions: WhatsApp (or the quote form) is always first; video only when the product has one. */}
                    <div className="mt-3 flex items-center gap-2">
                      {waConfigured ? (
                        <a
                          href={getWhatsAppInquiryUrl(name, product.model, lang)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm flex-1 bg-[#25D366] text-night hover:bg-[#20bd5a]"
                          aria-label={`${d.catalog.inquiry}：${name}`}
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
                      {product.videoUrl && (
                        <button
                          type="button"
                          onClick={() => setVideoModalProduct(product)}
                          className="btn btn-sm btn-outline shrink-0"
                          aria-label={`${d.catalog.watchVideo}：${name}`}
                        >
                          <Play className="w-3.5 h-3.5 fill-sky-deep text-sky-deep" />
                          {d.catalog.watchVideo}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenDetail(product)}
                        className="btn btn-sm btn-outline shrink-0"
                        aria-label={`${d.catalog.details}：${name}`}
                      >
                        <Info className="w-3.5 h-3.5 sm:hidden" />
                        <span className="max-sm:sr-only">{d.catalog.details}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {remaining > 0 && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <button type="button" onClick={() => setVisibleCount(c => c + pageSize)} className="btn btn-outline min-w-[14rem]">
              {d.catalog.loadMore}
              <span className="text-slate-500 font-normal">· {d.catalog.remaining.replace('{n}', String(remaining))}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {filteredProducts.length === 0 && (
          <div className="mt-8 py-16 px-6 rounded-xl border border-dashed border-line text-center">
            <p className="text-base text-slate-600">{d.catalog.emptyState}</p>
            <button onClick={resetFilters} className="btn btn-sm btn-outline mt-4">
              {d.catalog.clearFilters}
            </button>
          </div>
        )}

        <p className={`text-sm text-slate-500 ${remaining > 0 ? 'mt-3 text-center' : 'mt-6'}`}>
          {remaining > 0
            ? d.catalog.shownOf.replace('{shown}', String(shownProducts.length)).replace('{total}', String(filteredProducts.length))
            : d.catalog.resultCount.replace('{count}', String(filteredProducts.length))}
        </p>
      </div>

      <ProductVideoModal product={videoModalProduct} onClose={() => setVideoModalProduct(null)} onInquire={onInquire} />
    </section>
  );
};

/** 9 cards (3 rows × 3) on wide screens, 6 below. Follows window resizes. */
function usePageSize(): number {
  const query = '(min-width: 1024px)';
  const get = () => (typeof window !== 'undefined' && window.matchMedia?.(query).matches ? 9 : 6);
  const [size, setSize] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setSize(get());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return size;
}
