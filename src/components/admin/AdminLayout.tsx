import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Inbox,
  Users,
  FileText,
  ShieldCheck,
  History,
  LogOut,
  Globe,
  Menu,
  X
} from 'lucide-react';
import { StaffAccount } from '../../types/admin';
import { BrandMark } from '../common/BrandMark';
import { Avatar } from './AdminUI';
import { useDialog } from '../../hooks/useDialog';

import { AdminTab, getAllowedAdminTabs } from '../../config/adminTabs';
export type { AdminTab };

interface AdminLayoutProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onBackToPortal: () => void;
  currentStaff: StaffAccount;
  allStaff?: StaffAccount[];
  /** New, unassigned leads waiting in the pool (shown as a badge on 商机线索). */
  pendingLeadsCount?: number;
  onLogout: () => void;
  children: React.ReactNode;
}

type NavItem = { id: AdminTab; label: string; icon: React.ElementType };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '业务',
    items: [
      { id: 'dashboard', label: '经营概览', icon: LayoutDashboard },
      { id: 'leads', label: '商机线索', icon: Inbox },
      { id: 'quotation', label: '报价单', icon: FileText },
      { id: 'customers', label: '客户档案', icon: Users }
    ]
  },
  {
    label: '管理',
    items: [
      { id: 'products', label: '商品库', icon: Package },
      { id: 'team', label: '团队与权限', icon: ShieldCheck },
      { id: 'audit', label: '操作日志', icon: History }
    ]
  }
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onBackToPortal,
  currentStaff,
  pendingLeadsCount = 0,
  onLogout,
  children
}) => {
  const [navOpen, setNavOpen] = useState(false);
  useDialog(navOpen, () => setNavOpen(false));
  const allowedTabs = getAllowedAdminTabs(currentStaff.role);
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(i => allowedTabs.includes(i.id)) })).filter(
    g => g.items.length > 0
  );
  const currentLabel = groups.flatMap(g => g.items).find(i => i.id === currentTab)?.label || '';
  const roleLabel = currentStaff.role === 'super_admin' ? '超级管理员' : '销售代表';

  useEffect(() => {
    document.title = `${currentLabel} · 路易美中台`;
  }, [currentLabel]);

  const select = (tab: AdminTab) => {
    onSelectTab(tab);
    setNavOpen(false);
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-night text-white">
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0">
        <BrandMark className="w-8 h-8" />
        <div className="leading-tight">
          <div className="text-[15px] font-bold">路易美中台</div>
          <div className="text-xs text-white/50">销售与客户管理</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="中台导航">
        {groups.map(group => (
          <div key={group.label} className="mb-5">
            <div className="px-3 pb-2 text-xs text-white/40">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = currentTab === item.id;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => select(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative w-full flex items-center gap-3 h-10 px-3 rounded-lg text-sm transition-colors ${
                        active ? 'bg-white/10 text-white font-semibold' : 'text-white/65 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {active && <span className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-sky" aria-hidden="true" />}
                      <Icon className={`w-[18px] h-[18px] ${active ? 'text-sky' : ''}`} strokeWidth={1.9} />
                      <span className="flex-1 text-start">{item.label}</span>
                      {item.id === 'leads' && pendingLeadsCount > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-sky text-night text-xs font-sign font-semibold inline-flex items-center justify-center">
                          {pendingLeadsCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={currentStaff.name} size={34} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold truncate">{currentStaff.name}</div>
            <div className="text-xs text-white/50 truncate">{roleLabel}</div>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <button
            onClick={onBackToPortal}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-[13px] text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Globe className="w-4 h-4" />
            查看官网
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-[13px] text-white/70 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-concrete text-night">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 start-0 w-[232px] z-30">{sidebar}</aside>

      {/* Mobile top bar + drawer */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-night text-white">
        <div className="flex items-center gap-2.5">
          <BrandMark className="w-7 h-7" />
          <span className="text-[15px] font-semibold">{currentLabel}</span>
        </div>
        <button onClick={() => setNavOpen(true)} className="w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-white/10" aria-label="打开导航">
          <Menu className="w-5 h-5" />
        </button>
      </div>
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="中台导航">
          <div className="absolute inset-0 bg-night/50 animate-in" onClick={() => setNavOpen(false)} aria-hidden="true" />
          <div className="drawer-panel absolute inset-y-0 start-0 w-[260px] shadow-2xl">
            {sidebar}
            <button
              onClick={() => setNavOpen(false)}
              className="absolute top-3 end-3 w-10 h-10 inline-flex items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
              aria-label="关闭导航"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <main className="lg:ps-[232px]">
        <div key={currentTab} className="view-enter px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
};
