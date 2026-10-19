import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { SupportedLanguage } from '../../types';
import { Heart, Menu, X, Globe, LayoutDashboard, UserRound, ChevronDown } from 'lucide-react';
import { categoryLabel, useProductCategories } from '../../config/categories';
import { useDialog } from '../../hooks/useDialog';
import { api } from '../../services/api';
import { StaffAccount } from '../../types/admin';
import { BrandLogo } from '../common/BrandMark';

interface HeaderProps {
  savedCount: number;
  onlyFavorites: boolean;
  onToggleOnlyFavorites: () => void;
  onOpenAccount: () => void;
  onOpenAdminConsole: () => void;
  onSelectNavCategory: (category: string) => void;
  adminStaffSession?: StaffAccount | null;
}

type NavItem = { href: string; label: string; category?: string };

export const Header: React.FC<HeaderProps> = ({
  savedCount,
  onlyFavorites,
  onToggleOnlyFavorites,
  onOpenAccount,
  onOpenAdminConsole,
  onSelectNavCategory,
  adminStaffSession
}) => {
  const { d, lang, setLang } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const productsRef = useRef<HTMLDivElement>(null);
  const { categories } = useProductCategories();
  useDialog(mobileMenuOpen, () => setMobileMenuOpen(false), { lockScroll: false });
  useDialog(productsOpen, () => setProductsOpen(false), { lockScroll: false });

  useEffect(() => {
    if (!productsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!productsRef.current?.contains(e.target as Node)) setProductsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [productsOpen]);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const buyer = api.getCurrentUser();

  const productItems: NavItem[] = [
    { href: '#products', label: d.nav.allProducts, category: 'all' },
    ...categories.map(c => ({ href: '#products', label: categoryLabel(c, lang), category: c.id }))
  ];
  const navItems: NavItem[] = [
    { href: '#process', label: d.nav.process },
    { href: '#cases', label: d.nav.cases },
    { href: '#contact', label: d.nav.contact }
  ];

  const handleNavClick = (category?: string) => {
    setMobileMenuOpen(false);
    setProductsOpen(false);
    if (category) onSelectNavCategory(category);
  };

  const accountLabel = buyer ? buyer.name || d.account.buyerCenter : d.account.tabLogin;

  return (
    <header className={`sticky top-0 z-40 bg-white md:bg-white/95 md:backdrop-blur-md border-b transition-shadow duration-300 ${scrolled ? 'border-line shadow-[0_6px_20px_-12px_rgb(15_37_54/0.35)]' : 'border-transparent'}`}>
      <div className="page-wrap h-16 flex items-center justify-between gap-6">
        <a
          href="#home"
          aria-label={d.nav.brandName}
          className="flex items-center gap-2.5 shrink-0 rounded-md"
          onClick={() => handleNavClick()}
        >
          <BrandLogo className="h-9 sm:h-10 w-auto" />
        </a>

        <nav className="hidden lg:flex items-center gap-1 text-[15px]" aria-label="Main">
          <div
            ref={productsRef}
            className="relative"
            onMouseEnter={() => setProductsOpen(true)}
            onMouseLeave={() => setProductsOpen(false)}
          >
            <button
              type="button"
              aria-expanded={productsOpen}
              aria-haspopup="true"
              onClick={() => setProductsOpen(o => !o)}
              className={`inline-flex items-center gap-1 px-3 py-2 transition-colors ${productsOpen ? 'text-night' : 'text-slate-600 hover:text-night'}`}
            >
              {d.nav.products}
              <ChevronDown className={`w-4 h-4 transition-transform ${productsOpen ? 'rotate-180' : ''}`} />
            </button>
            {productsOpen && (
              <div className="absolute start-0 top-full pt-3 z-50">
                <ul className="anim-pop min-w-[14rem] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-xl">
                  {productItems.map(item => (
                    <li key={item.category}>
                      <a
                        href={item.href}
                        onClick={() => handleNavClick(item.category)}
                        className={`block rounded-lg px-3 py-2 text-[15px] hover:bg-sky-wash hover:text-night ${
                          item.category === 'all' ? 'font-semibold text-night' : 'text-slate-600'
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {navItems.map(item => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => handleNavClick(item.category)}
              className="relative px-3 py-2 text-slate-600 hover:text-night transition-colors after:absolute after:left-3 after:right-3 after:-bottom-[13px] after:h-[3px] after:rounded-full after:bg-sky after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <label className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm text-slate-600 hover:bg-concrete transition-colors cursor-pointer">
            <Globe className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              aria-label="Language"
              value={lang}
              onChange={e => setLang(e.target.value as SupportedLanguage)}
              className="bg-transparent text-sm text-slate-700 cursor-pointer focus:outline-none"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="ru">Русский</option>
            </select>
          </label>

          <button
            onClick={onToggleOnlyFavorites}
            aria-pressed={onlyFavorites}
            aria-label={`${d.nav.favorites}（${savedCount}）`}
            className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm transition-colors ${
              onlyFavorites ? 'bg-sky-wash text-sky-deep' : 'text-slate-600 hover:bg-concrete hover:text-night'
            }`}
          >
            <Heart className={`w-4 h-4 ${onlyFavorites ? 'fill-sky text-sky-deep' : ''}`} />
            <span className="font-sign font-semibold">{savedCount}</span>
          </button>

          {adminStaffSession && (
            <button
              onClick={onOpenAdminConsole}
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-night text-white text-sm font-semibold hover:bg-night-soft transition-colors"
              title={`${adminStaffSession.name}（${adminStaffSession.role === 'super_admin' ? '超级管理员' : '销售代表'}）`}
            >
              <LayoutDashboard className="w-4 h-4 text-sky" />
              <span>进入中台</span>
            </button>
          )}

          <button
            onClick={onOpenAccount}
            className="hidden sm:inline-flex btn btn-sm btn-outline"
            title={d.misc.accountTitle}
          >
            {buyer ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
            ) : (
              <UserRound className="w-4 h-4 text-sky-deep" />
            )}
            <span className="max-w-[10rem] truncate">{accountLabel}</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={d.nav.openMenu}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-night hover:bg-concrete transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="lg:hidden border-t border-line bg-white anim-pop" aria-label="Mobile">
          <div className="page-wrap py-3 flex flex-col">
            <p className="pt-2 pb-1 text-[13px] font-semibold text-slate-500">{d.nav.products}</p>
            <div className="grid grid-cols-2 gap-x-4 pb-2 border-b border-concrete">
              {productItems.map(item => (
                <a
                  key={item.category}
                  href={item.href}
                  onClick={() => handleNavClick(item.category)}
                  className="py-2.5 text-[15px] text-night truncate"
                >
                  {item.label}
                </a>
              ))}
            </div>
            {navItems.map(item => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => handleNavClick(item.category)}
                className="py-3 text-base font-medium text-night border-b border-concrete"
              >
                {item.label}
              </a>
            ))}
            <div className="flex items-center justify-between gap-3 pt-4 pb-1">
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <Globe className="w-4 h-4 text-slate-500" />
                <select
                  aria-label="Language"
                  value={lang}
                  onChange={e => setLang(e.target.value as SupportedLanguage)}
                  className="bg-transparent text-sm text-slate-700 focus:outline-none"
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                  <option value="ru">Русский</option>
                </select>
              </label>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAccount();
                }}
                className="btn btn-sm btn-outline"
              >
                <UserRound className="w-4 h-4 text-sky-deep" />
                <span>{accountLabel}</span>
              </button>
            </div>
            {adminStaffSession && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAdminConsole();
                }}
                className="mt-3 btn bg-night text-white hover:bg-night-soft"
              >
                <LayoutDashboard className="w-4 h-4 text-sky" />
                <span>进入中台（{adminStaffSession.name}）</span>
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};
