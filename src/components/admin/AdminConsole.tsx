import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Product } from '../../types';
import { AdminLead, AuditLogItem, CustomerProfile, StaffAccount } from '../../types/admin';
import { adminApi } from '../../services/adminApi';
import { AdminTab, isAdminTabAllowed } from '../../config/adminTabs';
import { AdminLayout } from './AdminLayout';
import { Toast } from '../common/Toast';

const DashboardView = lazy(() => import('./DashboardView').then(m => ({ default: m.DashboardView })));
const ProductManageView = lazy(() => import('./ProductManageView').then(m => ({ default: m.ProductManageView })));
const LeadsCrmView = lazy(() => import('./LeadsCrmView').then(m => ({ default: m.LeadsCrmView })));
const CustomerView = lazy(() => import('./CustomerView').then(m => ({ default: m.CustomerView })));
const QuotationView = lazy(() => import('./QuotationView').then(m => ({ default: m.QuotationView })));
const TeamRbacView = lazy(() => import('./TeamRbacView').then(m => ({ default: m.TeamRbacView })));
const AuditLogsView = lazy(() => import('./AuditLogsView').then(m => ({ default: m.AuditLogsView })));

const TabFallback: React.FC = () => (
  <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
    <span className="w-4 h-4 rounded-full border-2 border-sky border-t-transparent animate-spin" aria-hidden="true" />
    正在加载…
  </div>
);

function isSameStaff(a: StaffAccount | null, b: StaffAccount | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && (a.uid || '') === (b.uid || '') && a.role === b.role && a.status === b.status && a.name === b.name && a.phone === b.phone;
}

const clock = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

interface AdminConsoleProps {
  session: StaffAccount;
  products: Product[];
  onProductsChange: (products: Product[]) => void;
  /** Back to the website, keeping the console session. */
  onBackToPortal: () => void;
  /** The session ended (logout, account removed or suspended). */
  onSessionEnded: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

/**
 * The staff console: its data subscriptions and views. Loaded only when a staff member opens it,
 * so none of this reaches visitors' browsers.
 */
const AdminConsole: React.FC<AdminConsoleProps> = ({ session, products, onProductsChange, onBackToPortal, onSessionEnded, toastMessage, showToast }) => {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [currentStaff, setCurrentStaff] = useState<StaffAccount>(adminApi.getCurrentStaff() || session);
  const [leadIdForModal, setLeadIdForModal] = useState<string | null>(null);
  const [leadIdForQuotation, setLeadIdForQuotation] = useState<string | null>(null);

  const [lastSyncTime, setLastSyncTime] = useState(clock);
  const [isSyncing, setIsSyncing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(true);

  const updateCurrentStaff = useCallback((next: StaffAccount | null) => {
    if (next) setCurrentStaff(prev => (isSameStaff(prev, next) ? prev : next));
  }, []);

  const refresh = useCallback(() => {
    onProductsChange(adminApi.getProducts());
    setLeads(adminApi.getLeads());
    setCustomers(adminApi.getCustomers());
    setStaff(adminApi.getStaffList());
    updateCurrentStaff(adminApi.getCurrentStaff());
    setAuditLogs(adminApi.getAuditLogs());
  }, [onProductsChange, updateCurrentStaff]);

  const endSession = useCallback(
    (message: string) => {
      adminApi.clearAdminSession();
      onSessionEnded();
      showToast(message);
    },
    [onSessionEnded, showToast]
  );

  const uid = session.uid || session.id;
  const role = currentStaff.role;

  useEffect(() => {
    refresh();
    const started = performance.now();
    let first = true;
    const unsubProducts = adminApi.subscribeToProducts(
      list => {
        if (first) {
          first = false;
          setLatencyMs(Math.max(1, Math.round(performance.now() - started)));
          setIsConnected(true);
        }
        onProductsChange(list);
        setLastSyncTime(clock());
      },
      () => setIsConnected(false)
    );
    const unsubLeads = adminApi.subscribeToLeads(
      list => {
        setLeads(list);
        setLastSyncTime(clock());
      },
      err => console.warn('Real-time leads sync warning:', err)
    );
    const unsubStaff = adminApi.subscribeToStaff(
      list => {
        setStaff(list);
        updateCurrentStaff(adminApi.getCurrentStaff());
        setLeads(adminApi.getLeads());
        // Removed or suspended staff lose the console immediately.
        const active = adminApi.getAdminSession();
        if (active && list.length > 0) {
          const me = list.find(s => s.id === active.id || (active.uid && s.uid === active.uid));
          if (!me) endSession('安全警示：您的员工账号已被移除，中台会话已立即终止！');
          else if (me.status === 'suspended') endSession('安全警示：您的员工账号已被停用，中台通行权限已强制终止！');
        }
      },
      err => console.warn('Real-time staff sync warning:', err)
    );
    // Customers & audit logs are super-admin only (firestore.rules); reps never open these listeners.
    const isSuper = role === 'super_admin';
    const unsubCustomers = isSuper
      ? adminApi.subscribeToCustomers(
          list => {
            setCustomers(list);
            setLastSyncTime(clock());
          },
          err => console.warn('Real-time customers sync warning:', err)
        )
      : () => {};
    const unsubAudit = isSuper
      ? adminApi.subscribeToAuditLogs(
          list => {
            setAuditLogs(list);
            setLastSyncTime(clock());
          },
          err => console.warn('Real-time audit logs sync warning:', err)
        )
      : () => {};
    return () => {
      unsubProducts();
      unsubLeads();
      unsubStaff();
      unsubCustomers();
      unsubAudit();
    };
  }, [uid, role, refresh, onProductsChange, updateCurrentStaff, endSession]);

  // Never render a tab the current role is not allowed to use (e.g. after a role change).
  useEffect(() => {
    if (!isAdminTabAllowed(tab, role)) setTab('dashboard');
  }, [tab, role]);

  const manualSync = useCallback(async () => {
    setIsSyncing(true);
    const started = performance.now();
    try {
      onProductsChange(await adminApi.initProductsPersistence());
      const elapsed = Math.max(1, Math.round(performance.now() - started));
      setLatencyMs(elapsed);
      setIsConnected(true);
      refresh();
      setLastSyncTime(clock());
      showToast(`数据已同步（响应 ${elapsed}ms）`);
    } catch (err) {
      console.warn('Manual sync warning:', err);
      setIsConnected(false);
      refresh();
      showToast('连不上数据库，显示的是本机缓存的数据');
    } finally {
      setIsSyncing(false);
    }
  }, [onProductsChange, refresh, showToast]);

  const clearLeadForModal = useCallback(() => setLeadIdForModal(null), []);
  const clearLeadForQuotation = useCallback(() => setLeadIdForQuotation(null), []);

  const logout = () => endSession('已安全退出管理中台。');

  return (
    <AdminLayout
      currentTab={tab}
      onSelectTab={setTab}
      onBackToPortal={onBackToPortal}
      currentStaff={currentStaff}
      allStaff={staff}
      pendingLeadsCount={leads.filter(l => l.stage === 'new' && !l.assignedStaffId).length}
      onLogout={logout}
    >
      <Suspense fallback={<TabFallback />}>
        {tab === 'dashboard' && (
          <DashboardView
            leads={leads}
            products={products}
            canEditSiteConfig={role === 'super_admin'}
            onNavigateTab={setTab}
            onSelectLeadForFollowUp={leadId => {
              setLeadIdForModal(leadId);
              setTab('leads');
            }}
            syncInfo={{ isConnected, lastSyncTime, isSyncing, latencyMs, onManualSync: manualSync }}
          />
        )}
        {tab === 'products' && <ProductManageView products={products} onRefreshProducts={refresh} onShowToast={showToast} />}
        {tab === 'leads' && (
          <LeadsCrmView
            leads={leads}
            staffList={staff}
            onRefreshLeads={refresh}
            onShowToast={showToast}
            initialOpenLeadId={leadIdForModal}
            onClearInitialOpenLeadId={clearLeadForModal}
            onNavigateToQuotationWithLead={lead => {
              setLeadIdForQuotation(lead.id);
              setTab('quotation');
              showToast(`已带入客户「${lead.customerName}」，开具报价单后会自动更新估值和阶段`);
            }}
          />
        )}
        {tab === 'customers' && <CustomerView customers={customers} leads={leads} onRefreshCustomers={refresh} onShowToast={showToast} />}
        {tab === 'quotation' && (
          <QuotationView
            products={products}
            leads={leads}
            initialLeadId={leadIdForQuotation}
            onClearInitialLeadId={clearLeadForQuotation}
            onRefreshData={refresh}
            onShowToast={showToast}
          />
        )}
        {tab === 'team' && <TeamRbacView staffList={staff} currentStaff={currentStaff} leads={leads} onRefreshStaff={refresh} onShowToast={showToast} />}
        {tab === 'audit' && <AuditLogsView logs={auditLogs} />}
      </Suspense>
      <Toast message={toastMessage} />
    </AdminLayout>
  );
};

export default AdminConsole;
