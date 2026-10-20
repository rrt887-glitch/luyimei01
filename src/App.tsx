/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { Product, ProductFilterCategory } from './types';
import { StaffAccount } from './types/admin';
import { api } from './services/api';
import { readAdminSession } from './services/adminSession';
import { loadReadOnlyCachedProducts, subscribeToFirestoreProducts } from './services/productStorage';
import { initialProducts } from './data/products';

import { Header } from './components/layout/Header';
import { HeroSection } from './components/sections/HeroSection';
import { ProductCatalog } from './components/sections/ProductCatalog';
import { EngineeringSection } from './components/sections/EngineeringSection';
import { ServicesSection } from './components/sections/ServicesSection';
import { ContactSection } from './components/sections/ContactSection';
import { RecordsTable } from './components/sections/RecordsTable';
import { Footer } from './components/layout/Footer';
import { Toast } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { DialogBoundary } from './components/common/DialogBoundary';

// Dialogs and the staff console are separate downloads: the first screen only needs the page itself.
const loadDetail = () => import('./components/modals/ProductDetailModal');
const loadInquiry = () => import('./components/modals/ProductInquiryModal');
const loadAccount = () => import('./components/modals/AccountModal');
const ProductDetailModal = lazy(() => loadDetail().then(m => ({ default: m.ProductDetailModal })));
const ProductInquiryModal = lazy(() => loadInquiry().then(m => ({ default: m.ProductInquiryModal })));
const AccountModal = lazy(() => loadAccount().then(m => ({ default: m.AccountModal })));
const AdminAuthModal = lazy(() => import('./components/modals/AdminAuthModal').then(m => ({ default: m.AdminAuthModal })));
const AdminConsole = lazy(() => import('./components/admin/AdminConsole'));

const ConsoleFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center gap-3 bg-concrete text-sm text-slate-500">
    <span className="w-4 h-4 rounded-full border-2 border-sky border-t-transparent animate-spin" aria-hidden="true" />
    正在加载中台…
  </div>
);

const MainApp: React.FC = () => {
  const { d } = useI18n();
  const dictRef = useRef(d);
  dictRef.current = d;
  const [viewMode, setViewMode] = useState<'portal' | 'admin'>('portal');
  const [adminSession, setAdminSession] = useState<StaffAccount | null>(readAdminSession);

  const [products, setProducts] = useState<Product[]>(() => {
    // Built-in catalogue only on a first visit (no cache yet); an empty cached list stays empty.
    return loadReadOnlyCachedProducts().filter(p => !p.isDeleted);
  });
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<ProductFilterCategory>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [syncingFavId, setSyncingFavId] = useState<string | null>(null);

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [inquiryProduct, setInquiryProduct] = useState<Product | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(current => (current === msg ? null : current)), 3500);
  }, []);

  const setVisibleProducts = useCallback((list: Product[]) => setProducts(list.filter(p => !p.isDeleted)), []);

  // Catalogue: instant first paint from the local cache, then one real-time listener.
  useEffect(() => {
    const unsubscribeProducts = subscribeToFirestoreProducts(initialProducts, setVisibleProducts, err =>
      console.warn('Real-time products sync warning:', err)
    );
    const unsubscribeFavs = api.subscribeToFavorites(setSavedIds, err => {
      console.warn('Real-time sync error:', err);
      showToast(dictRef.current.misc.syncFailed);
    });
    return () => {
      unsubscribeProducts();
      unsubscribeFavs();
    };
  }, [showToast, setVisibleProducts]);

  // Once the page is idle, fetch the dialogs in the background so opening one feels instant.
  useEffect(() => {
    const prefetch = () => {
      void loadDetail();
      void loadInquiry();
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(prefetch, { timeout: 4000 });
    else setTimeout(prefetch, 2500);
  }, []);

  const enterConsole = useCallback((staff: StaffAccount) => {
    // Signing in as staff replaces any buyer signed in in this browser: drop that buyer's profile
    // so the website does not keep showing it next to the staff account.
    api.clearBuyerSession();
    setAdminSession(staff);
    setViewMode('admin');
  }, []);

  // Open the console: re-check the staff record in the database before granting access.
  const handleOpenAdmin = useCallback(async () => {
    if (!readAdminSession()) {
      setIsAdminAuthOpen(true);
      return;
    }
    const { adminApi } = await import('./services/adminApi');
    const check = await adminApi.validateCurrentSession();
    if (!check.valid && check.reason === 'network_error') {
      showToast('暂时无法连接云端校验员工身份，请检查网络后重试。');
      return;
    }
    if (!check.valid) {
      setAdminSession(null);
      setViewMode('portal');
      showToast(
        check.reason === 'deleted'
          ? '访问受阻：该员工账号在数据库中已被删除，会话已作废！'
          : check.reason === 'suspended'
            ? '访问受阻：该员工账号目前处于停用冻结状态，无权访问管理中台！'
            : '登录会话已失效，请重新验证登录。'
      );
      setIsAdminAuthOpen(true);
      return;
    }
    enterConsole(check.staff || readAdminSession()!);
    showToast(`欢迎回来，${check.staff?.name || ''}`);
  }, [enterConsole, showToast]);

  // Hidden shortcut for staff: Ctrl/Cmd + Shift + A
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')) {
        e.preventDefault();
        void handleOpenAdmin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleOpenAdmin]);

  const handleToggleFavorite = async (id: string) => {
    if (syncingFavId) return;
    setSyncingFavId(id);
    try {
      const saved = await api.toggleFavorite(id, savedIds.has(id));
      showToast(saved ? d.misc.favAdded : d.misc.favRemoved);
    } catch (error) {
      if ((error as Error)?.name === 'FavoritePendingError') {
        showToast(d.misc.favPending);
        return;
      }
      console.warn('Cloud favorite sync error:', error);
      showToast(d.misc.favFailed);
    } finally {
      setSyncingFavId(null);
    }
  };

  const scrollToProducts = () => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });

  const handleToggleOnlyFavorites = () => {
    const next = !onlyFavorites;
    setOnlyFavorites(next);
    if (next) scrollToProducts();
  };

  const handleSelectNavCategory = (cat: string) => {
    setActiveCategory(cat);
    setOnlyFavorites(false);
    scrollToProducts();
  };

  // A quote request for one product opens a short form over the page.
  const handleInquireProduct = (product: Product) => {
    setDetailProduct(null);
    setInquiryProduct(product);
  };

  const handleBackToPortal = useCallback(() => setViewMode('portal'), []);

  const handleSessionEnded = useCallback(() => {
    setAdminSession(null);
    setViewMode('portal');
  }, []);

  if (viewMode === 'admin' && adminSession) {
    return (
      <Suspense fallback={<ConsoleFallback />}>
        <AdminConsole
          session={adminSession}
          products={products}
          onProductsChange={setVisibleProducts}
          onBackToPortal={handleBackToPortal}
          onSessionEnded={handleSessionEnded}
          toastMessage={toastMessage}
          showToast={showToast}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-white text-night flex flex-col font-sans selection:bg-sky selection:text-night">
      <Header
        savedCount={savedIds.size}
        onlyFavorites={onlyFavorites}
        onToggleOnlyFavorites={handleToggleOnlyFavorites}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenAdminConsole={handleOpenAdmin}
        onSelectNavCategory={handleSelectNavCategory}
        adminStaffSession={adminSession}
      />

      <main className="flex-1">
        <HeroSection />
        <ProductCatalog
          products={products}
          savedIds={savedIds}
          onToggleFavorite={handleToggleFavorite}
          syncingFavId={syncingFavId}
          onOpenDetail={setDetailProduct}
          onInquire={handleInquireProduct}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          onlyFavorites={onlyFavorites}
          onClearOnlyFavorites={() => setOnlyFavorites(false)}
        />
        <EngineeringSection />
        <ServicesSection onSelectCategory={handleSelectNavCategory} />
        <ContactSection onInquirySubmitted={showToast} />
        <RecordsTable products={products} onOpenDetail={setDetailProduct} />
      </main>

      <Footer onSelectCategory={handleSelectNavCategory} onOpenAdminConsole={handleOpenAdmin} />

      <DialogBoundary
        onError={msg => {
          setDetailProduct(null);
          setInquiryProduct(null);
          setIsAccountOpen(false);
          setIsAdminAuthOpen(false);
          showToast(msg);
        }}
      >
      <Suspense fallback={null}>
        {detailProduct && <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} onInquire={handleInquireProduct} />}
        {inquiryProduct && (
          <ProductInquiryModal
            product={inquiryProduct}
            onClose={() => setInquiryProduct(null)}
            onNotify={showToast}
            onOpenAccount={() => setIsAccountOpen(true)}
          />
        )}
        {isAccountOpen && (
          <AccountModal
            isOpen
            onClose={() => setIsAccountOpen(false)}
            onNotification={showToast}
            onOpenAdminLogin={handleOpenAdmin}
            onSuccessAdminLogin={enterConsole}
          />
        )}
        {isAdminAuthOpen && <AdminAuthModal isOpen onClose={() => setIsAdminAuthOpen(false)} onSuccessLogin={enterConsole} onShowToast={showToast} />}
      </Suspense>
      </DialogBoundary>

      <Toast message={toastMessage} />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <MainApp />
      </I18nProvider>
    </ErrorBoundary>
  );
}
