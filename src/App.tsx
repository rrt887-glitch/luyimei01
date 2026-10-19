/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { I18nProvider } from './i18n';
import { Product, ProductFilterCategory } from './types';
import { api } from './services/api';
import { adminApi } from './services/adminApi';
import { AdminLead, CustomerProfile, StaffAccount, AuditLogItem } from './types/admin';

// Front portal layout & sections
import { Header } from './components/layout/Header';
import { HeroSection } from './components/sections/HeroSection';
import { ProductCatalog } from './components/sections/ProductCatalog';
import { EngineeringSection } from './components/sections/EngineeringSection';
import { ServicesSection } from './components/sections/ServicesSection';
import { ContactSection } from './components/sections/ContactSection';
import { RecordsTable } from './components/sections/RecordsTable';
import { Footer } from './components/layout/Footer';
import { ProductDetailModal } from './components/modals/ProductDetailModal';
import { ProductInquiryModal } from './components/modals/ProductInquiryModal';
import { AccountModal } from './components/modals/AccountModal';
import { AdminAuthModal } from './components/modals/AdminAuthModal';
import { Toast } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Admin console layout & views are code-split: public visitors never download the back office.
import { AdminTab, isAdminTabAllowed } from './config/adminTabs';
const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const DashboardView = lazy(() => import('./components/admin/DashboardView').then(m => ({ default: m.DashboardView })));
const ProductManageView = lazy(() =>
  import('./components/admin/ProductManageView').then(m => ({ default: m.ProductManageView }))
);
const LeadsCrmView = lazy(() => import('./components/admin/LeadsCrmView').then(m => ({ default: m.LeadsCrmView })));
const CustomerView = lazy(() => import('./components/admin/CustomerView').then(m => ({ default: m.CustomerView })));
const QuotationView = lazy(() => import('./components/admin/QuotationView').then(m => ({ default: m.QuotationView })));
const TeamRbacView = lazy(() => import('./components/admin/TeamRbacView').then(m => ({ default: m.TeamRbacView })));
const AuditLogsView = lazy(() => import('./components/admin/AuditLogsView').then(m => ({ default: m.AuditLogsView })));

const AdminLoadingFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center gap-3 bg-concrete text-sm text-slate-500">
    <span className="w-4 h-4 rounded-full border-2 border-sky border-t-transparent animate-spin" aria-hidden="true" />
    正在加载中台…
  </div>
);

const SAFE_UNAUTHENTICATED_STAFF: StaffAccount = {
  id: '',
  name: '未登录访客',
  email: '',
  phone: '',
  role: 'sales_rep',
  status: 'suspended',
  assignedLeadsCount: 0,
  lastLoginAt: ''
};

function isSameStaffSession(a: StaffAccount | null, b: StaffAccount | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    (a.uid || '') === (b.uid || '') &&
    a.role === b.role &&
    a.status === b.status &&
    a.name === b.name &&
    a.phone === b.phone
  );
}

const MainApp: React.FC = () => {

  // Mode: Front Portal vs Business Admin Console
  const [viewMode, setViewMode] = useState<'portal' | 'admin'>('portal');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  // Products state (shared between portal and admin)
  const [products, setProducts] = useState<Product[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<ProductFilterCategory>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Admin entities state
  const [adminLeads, setAdminLeads] = useState<AdminLead[]>([]);
  const [adminCustomers, setAdminCustomers] = useState<CustomerProfile[]>([]);
  const [adminStaff, setAdminStaff] = useState<StaffAccount[]>([]);
  const [currentStaff, setCurrentStaff] = useState<StaffAccount | null>(adminApi.getCurrentStaff());
  const [adminSession, setAdminSession] = useState<StaffAccount | null>(adminApi.getAdminSession());
  const [adminAuditLogs, setAdminAuditLogs] = useState<AuditLogItem[]>([]);

  // Modals & Navigation
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [inquiryProduct, setInquiryProduct] = useState<Product | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Prefilled contact form
  const [syncingFavId, setSyncingFavId] = useState<string | null>(null);

  // Real-time Database Sync Status State
  const [lastSyncTime, setLastSyncTime] = useState<string>(
    new Date().toLocaleTimeString('zh-CN', { hour12: false })
  );
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | undefined>(undefined);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(true);

  // Cross-module linkage states between Dashboard, Leads CRM, and Quotation PI
  const [activeLeadIdForModal, setActiveLeadIdForModal] = useState<string | null>(null);
  const [activeLeadIdForQuotation, setActiveLeadIdForQuotation] = useState<string | null>(null);

  // Show Toast
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(current => (current === msg ? null : current));
    }, 3500);
  }, []);

  const updateAdminSessionStable = useCallback((next: StaffAccount | null) => {
    setAdminSession(prev => (isSameStaffSession(prev, next) ? prev : next));
  }, []);

  const updateCurrentStaffStable = useCallback((next: StaffAccount | null) => {
    setCurrentStaff(prev => (isSameStaffSession(prev, next) ? prev : next));
  }, []);

  const refreshAdminData = useCallback(() => {
    setProducts(adminApi.getProducts());
    setAdminLeads(adminApi.getLeads());
    setAdminCustomers(adminApi.getCustomers());
    setAdminStaff(adminApi.getStaffList());
    updateCurrentStaffStable(adminApi.getCurrentStaff());
    updateAdminSessionStable(adminApi.getAdminSession());
    setAdminAuditLogs(adminApi.getAuditLogs());
  }, [updateAdminSessionStable, updateCurrentStaffStable]);

  const handleManualDbSync = useCallback(async () => {
    setIsSyncingDb(true);
    const startMs = performance.now();
    try {
      const persistedProds = await adminApi.initProductsPersistence();
      const elapsed = Math.max(1, Math.round(performance.now() - startMs));
      setDbLatencyMs(elapsed);
      setIsDbConnected(true);
      setProducts(persistedProds);
      refreshAdminData();
      setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      showToast(`数据库全量数据已实时同步校验完成（响应耗时 ${elapsed}ms）！`);
    } catch (err) {
      console.warn('Manual sync warning:', err);
      setIsDbConnected(false);
      refreshAdminData();
      showToast('全量数据本地缓存校验完成！');
    } finally {
      setIsSyncingDb(false);
    }
  }, [refreshAdminData, showToast]);

  // Initialize public catalog data & isolated buyer favorites for Front Portal
  useEffect(() => {
    // Instant first paint from the read-only cache, then a SINGLE real-time listener
    // (no extra one-off getDocs: the listener's first snapshot already contains the full catalog).
    setProducts(adminApi.getProducts());
    const initStart = performance.now();
    let firstSnapshot = true;

    const unsubscribeProducts = adminApi.subscribeToProducts(
      cloudProds => {
        if (firstSnapshot) {
          firstSnapshot = false;
          setDbLatencyMs(Math.max(1, Math.round(performance.now() - initStart)));
          setIsDbConnected(true);
        }
        setProducts(cloudProds);
        setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      },
      error => {
        console.warn('Real-time products sync warning:', error);
        setIsDbConnected(false);
      }
    );

    // Buyer favorites listener (strictly isolated by Firebase Auth UID)
    const unsubscribeFavs = api.subscribeToFavorites(
      cloudSavedIds => {
        setSavedIds(cloudSavedIds);
        setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      },
      error => {
        console.warn('Real-time sync error:', error);
        showToast('云端数据实时同步异常，请检查网络连接');
      }
    );

    return () => {
      unsubscribeProducts();
      unsubscribeFavs();
    };
  }, [showToast]);

  const activeAdminUid = adminSession?.uid || adminSession?.id || '';
  const activeAdminRole = adminSession?.role || '';

  // Strictly on-demand CRM Leads, Staff, Customers & Audit Logs subscriptions:
  // ONLY active after entering Admin Console with verified Firebase Auth session.
  // Depends on primitive activeAdminUid/activeAdminRole to prevent re-subscription loops.
  useEffect(() => {
    if (viewMode !== 'admin' || !activeAdminUid) {
      setAdminLeads([]);
      setAdminStaff([]);
      setAdminCustomers([]);
      setAdminAuditLogs([]);
      return;
    }

    refreshAdminData();

    const unsubscribeLeads = adminApi.subscribeToLeads(
      cloudLeads => {
        setAdminLeads(cloudLeads);
        setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      },
      error => {
        console.warn('Real-time leads sync warning:', error);
      }
    );

    const unsubscribeStaff = adminApi.subscribeToStaff(
      cloudStaff => {
        setAdminStaff(cloudStaff);
        updateCurrentStaffStable(adminApi.getCurrentStaff());
        updateAdminSessionStable(adminApi.getAdminSession());
        // Re-evaluate leads visibility when staff role updates
        setAdminLeads(adminApi.getLeads());

        // Instant zero-trust session revocation check
        const activeSession = adminApi.getAdminSession();
        if (activeSession && activeSession.id) {
          const allStaff = adminApi.getStaffList();
          const matched = allStaff.find(
            s => s.id === activeSession.id || (activeSession.uid && s.uid === activeSession.uid)
          );
          if (allStaff.length > 0 && !matched) {
            adminApi.clearAdminSession();
            setAdminSession(null);
            setCurrentStaff(null);
            setViewMode('portal');
            showToast('安全警示：您的员工账号已被移除，中台会话已立即终止！');
          } else if (matched && matched.status === 'suspended') {
            adminApi.clearAdminSession();
            setAdminSession(null);
            setCurrentStaff(null);
            setViewMode('portal');
            showToast('安全警示：您的员工账号已被停用，中台通行权限已强制终止！');
          }
        }
      },
      error => {
        console.warn('Real-time staff sync warning:', error);
      }
    );

    // Customers & audit logs are super-admin only (firestore.rules); reps never open these listeners.
    const isSuperAdminSession = activeAdminRole === 'super_admin';
    const noop = () => {};

    const unsubscribeCustomers = !isSuperAdminSession ? noop : adminApi.subscribeToCustomers(
      cloudCustomers => {
        setAdminCustomers(cloudCustomers);
        setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      },
      error => {
        console.warn('Real-time customers sync warning:', error);
      }
    );

    const unsubscribeAuditLogs = !isSuperAdminSession ? noop : adminApi.subscribeToAuditLogs(
      cloudLogs => {
        setAdminAuditLogs(cloudLogs);
        setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      },
      error => {
        console.warn('Real-time audit logs sync warning:', error);
      }
    );

    return () => {
      unsubscribeLeads();
      unsubscribeStaff();
      unsubscribeCustomers();
      unsubscribeAuditLogs();
    };
  }, [
    viewMode,
    activeAdminUid,
    activeAdminRole,
    refreshAdminData,
    updateAdminSessionStable,
    updateCurrentStaffStable,
    showToast
  ]);

  // Safe Admin Logout: clears session and returns to front portal
  const handleAdminLogout = useCallback(() => {
    adminApi.clearAdminSession();
    setAdminSession(null);
    setCurrentStaff(null);
    setAdminLeads([]);
    setAdminStaff([]);
    setAdminCustomers([]);
    setAdminAuditLogs([]);
    setViewMode('portal');
    showToast('已安全退出管理中台。');
  }, [showToast]);

  // Open Admin Console: real-time database validation before granting access
  const handleOpenAdmin = useCallback(async () => {
    const session = adminApi.getAdminSession();
    if (!session) {
      setIsAdminAuthOpen(true);
      return;
    }

    // Verify current employee status directly with Firestore and sync currentStaff role
    const check = await adminApi.validateCurrentSession();
    if (!check.valid && check.reason === 'network_error') {
      // Session is kept; the staff member can simply retry once the network recovers.
      showToast('暂时无法连接云端校验员工身份，请检查网络后重试。');
      return;
    }
    if (!check.valid) {
      setAdminSession(null);
      setCurrentStaff(null);
      setViewMode('portal');
      refreshAdminData();
      if (check.reason === 'deleted') {
        showToast('访问受阻：该员工账号在数据库中已被删除，会话已作废！');
      } else if (check.reason === 'suspended') {
        showToast('访问受阻：该员工账号目前处于停用冻结状态，无权访问管理中台！');
      } else {
        showToast('登录会话已失效，请重新验证登录。');
      }
      setIsAdminAuthOpen(true);
      return;
    }

    if (check.staff) {
      setCurrentStaff(check.staff);
      setAdminSession(check.staff);
    }
    setViewMode('admin');
    refreshAdminData();
    showToast(`欢迎回来，已验证中台管理会话（${check.staff?.name || session.name}）`);
  }, [refreshAdminData, showToast]);

  // Global hidden shortcut for staff portal: Ctrl/Cmd + Shift + A
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')) {
        e.preventDefault();
        handleOpenAdmin();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleOpenAdmin]);

  // Strict cloud-confirmed toggle favorite
  const handleToggleFavorite = async (id: string) => {
    if (syncingFavId) return; // Prevent concurrent writes
    const currentlySaved = savedIds.has(id);
    setSyncingFavId(id);

    try {
      const newSavedState = await api.toggleFavorite(id, currentlySaved);
      showToast(newSavedState ? '已同步加入云端收藏' : '已从云端收藏移除');
    } catch (error) {
      console.error('Cloud favorite sync error:', error);
      showToast('云端保存失败：操作未能写入数据库，已保持原样');
    } finally {
      setSyncingFavId(null);
    }
  };

  // Switch only favorites
  const handleToggleOnlyFavorites = () => {
    const next = !onlyFavorites;
    setOnlyFavorites(next);
    if (next) {
      const el = document.getElementById('products');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Nav category selection
  const handleSelectNavCategory = (cat: string) => {
    setActiveCategory(cat);
    setOnlyFavorites(false);
    const el = document.getElementById('products');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  // Trigger inquiry from product
  // A quote request for one product opens a short form over the page (signed-in buyers only confirm;
  // visitors give name + WhatsApp) instead of sending people down to the general enquiry form.
  const handleInquireProduct = (product: Product) => {
    setDetailProduct(null);
    setInquiryProduct(product);
  };

  const activeStaffProfile: StaffAccount = currentStaff || adminSession || SAFE_UNAUTHENTICATED_STAFF;

  // Never render a tab the current role is not allowed to use (e.g. after a role change).
  useEffect(() => {
    if (viewMode === 'admin' && activeAdminRole && !isAdminTabAllowed(adminTab, activeAdminRole)) {
      setAdminTab('dashboard');
    }
  }, [viewMode, adminTab, activeAdminRole]);

  // If in Business Admin Console mode
  if (viewMode === 'admin') {
    return (
      <Suspense fallback={<AdminLoadingFallback />}>
      <AdminLayout
        currentTab={adminTab}
        onSelectTab={setAdminTab}
        onBackToPortal={() => setViewMode('portal')}
        currentStaff={activeStaffProfile}
        allStaff={adminStaff}
        pendingLeadsCount={adminLeads.filter(l => l.stage === 'new' && !l.assignedStaffId).length}
        onLogout={handleAdminLogout}
      >
        {adminTab === 'dashboard' && (
          <DashboardView
            leads={adminLeads}
            products={products}
            canEditSiteConfig={activeStaffProfile.role === 'super_admin'}
            onNavigateTab={setAdminTab}
            onSelectLeadForFollowUp={leadId => {
              setActiveLeadIdForModal(leadId);
              setAdminTab('leads');
            }}
            syncInfo={{
              isConnected: isDbConnected,
              lastSyncTime,
              isSyncing: isSyncingDb,
              latencyMs: dbLatencyMs,
              onManualSync: handleManualDbSync
            }}
          />
        )}

        {adminTab === 'products' && (
          <ProductManageView
            products={products}
            onRefreshProducts={refreshAdminData}
            onShowToast={showToast}
          />
        )}

        {adminTab === 'leads' && (
          <LeadsCrmView
            leads={adminLeads}
            staffList={adminStaff}
            onRefreshLeads={refreshAdminData}
            onShowToast={showToast}
            initialOpenLeadId={activeLeadIdForModal}
            onClearInitialOpenLeadId={() => setActiveLeadIdForModal(null)}
            onNavigateToQuotationWithLead={lead => {
              setActiveLeadIdForQuotation(lead.id);
              setAdminTab('quotation');
              showToast(`已载入客户 [${lead.customerName}] 商机信息，导出报价单后将自动回写估值与阶段！`);
            }}
          />
        )}

        {adminTab === 'customers' && (
          <CustomerView
            customers={adminCustomers}
            leads={adminLeads}
            onRefreshCustomers={refreshAdminData}
            onShowToast={showToast}
          />
        )}

        {adminTab === 'quotation' && (
          <QuotationView
            products={products}
            leads={adminLeads}
            initialLeadId={activeLeadIdForQuotation}
            onClearInitialLeadId={() => setActiveLeadIdForQuotation(null)}
            onRefreshData={refreshAdminData}
            onShowToast={showToast}
          />
        )}

        {adminTab === 'team' && (
          <TeamRbacView
            staffList={adminStaff}
            currentStaff={activeStaffProfile}
            leads={adminLeads}
            onRefreshStaff={refreshAdminData}
            onShowToast={showToast}
          />
        )}

        {adminTab === 'audit' && (
          <AuditLogsView logs={adminAuditLogs} />
        )}

        <Toast message={toastMessage} />
      </AdminLayout>
      </Suspense>
    );
  }

  // Front Portal Mode
  return (
    <div className="min-h-screen bg-white text-night flex flex-col font-sans selection:bg-sky selection:text-night">
      {/* Top Header */}
      <Header
        savedCount={savedIds.size}
        onlyFavorites={onlyFavorites}
        onToggleOnlyFavorites={handleToggleOnlyFavorites}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenAdminConsole={handleOpenAdmin}
        onSelectNavCategory={handleSelectNavCategory}
        adminStaffSession={adminSession}
      />

      {/* Main Content Sections */}
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

        <RecordsTable
          products={products}
          onOpenDetail={setDetailProduct}
        />
      </main>

      {/* Footer */}
      <Footer
        onSelectCategory={handleSelectNavCategory}
        onOpenAdminConsole={handleOpenAdmin}
      />

      {/* Detail Modal */}
      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onInquire={handleInquireProduct}
      />

      {/* One-product quote request */}
      <ProductInquiryModal
        product={inquiryProduct}
        onClose={() => setInquiryProduct(null)}
        onNotify={showToast}
        onOpenAccount={() => setIsAccountOpen(true)}
      />

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        onNotification={showToast}
        onOpenAdminLogin={handleOpenAdmin}
        onSuccessAdminLogin={(staff) => {
          setAdminSession(staff);
          setCurrentStaff(staff);
          setViewMode('admin');
          refreshAdminData();
        }}
      />

      {/* Hidden Admin / Staff Auth Modal */}
      <AdminAuthModal
        isOpen={isAdminAuthOpen}
        onClose={() => setIsAdminAuthOpen(false)}
        onSuccessLogin={(staff) => {
          setAdminSession(staff);
          setCurrentStaff(staff);
          setViewMode('admin');
          refreshAdminData();
        }}
        onShowToast={showToast}
      />

      {/* Global Toast */}
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
