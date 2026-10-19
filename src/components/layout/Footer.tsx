import React from 'react';
import { useI18n } from '../../i18n';
import { Phone, Mail, MapPin, MessageSquare, Lock } from 'lucide-react';
import { useSiteContactConfig, hasConfiguredWhatsApp } from '../../config/whatsapp';
import { BrandLogo } from '../common/BrandMark';
import { categoryLabel, useProductCategories } from '../../config/categories';

interface FooterProps {
  onSelectCategory: (category: string) => void;
  onOpenAdminConsole?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectCategory, onOpenAdminConsole }) => {
  const { d, lang } = useI18n();
  const { categories } = useProductCategories();
  const contactCfg = useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const year = new Date().getFullYear();

  const productLinks: { label: string; href: string; onClick?: () => void }[] = [
    ...categories.slice(0, 8).map(c => ({ label: categoryLabel(c, lang), href: '#products', onClick: () => onSelectCategory(c.id) })),
    { label: d.nav.contact, href: '#contact' }
  ];
  const companyLinks = [
    { label: d.footer.aboutLink, href: '#about' },
    { label: d.nav.process, href: '#process' },
    { label: d.nav.cases, href: '#cases' }
  ];
  const contacts = [
    contactCfg.hotlinePhone ? { icon: Phone, label: '商务热线', value: contactCfg.hotlinePhone } : null,
    waConfigured ? { icon: MessageSquare, label: 'WhatsApp', value: contactCfg.whatsappDisplay } : null,
    { icon: MessageSquare, label: '企业微信', value: contactCfg.wechatId || 'LYM-Engineering-GZ' },
    { icon: Mail, label: '邮箱', value: contactCfg.officialEmail || 'business@luyimei.com' }
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string }[];

  return (
    <footer className="cv-auto bg-night text-white/75 border-t border-white/10">
      <div className="page-wrap py-14 md:py-16 grid gap-10 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <a href="#home" className="inline-flex items-center rounded-md" aria-label={d.nav.brandName}>
            <BrandLogo inverse className="h-11 w-auto" />
          </a>
          <p className="mt-4 text-sm leading-relaxed">
            <strong className="block font-semibold text-white">{d.footer.company}</strong>
            {d.footer.subtitle}
          </p>
          <p className="mt-4 flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-sky shrink-0 mt-0.5" />
            <span>广州高新技术产业开发区中新知识城智造产业园</span>
          </p>
        </div>

        <nav className="lg:col-span-2" aria-label={d.footer.productsTitle}>
          <h4 className="text-sm font-semibold text-white mb-4">{d.footer.productsTitle}</h4>
          <ul className="space-y-2.5 text-sm">
            {productLinks.map(l => (
              <li key={l.label}>
                <a href={l.href} onClick={l.onClick} className="hover:text-white transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="lg:col-span-2" aria-label={d.footer.aboutTitle}>
          <h4 className="text-sm font-semibold text-white mb-4">{d.footer.aboutTitle}</h4>
          <ul className="space-y-2.5 text-sm">
            {companyLinks.map(l => (
              <li key={l.label}>
                <a href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="lg:col-span-4">
          <h4 className="text-sm font-semibold text-white mb-4">商务与技术支持</h4>
          <ul className="space-y-2.5 text-sm">
            {contacts.map(c => (
              <li key={c.label} className="flex items-center gap-2.5">
                <c.icon className="w-4 h-4 text-sky shrink-0" />
                <span className="text-white/55 w-16 shrink-0">{c.label}</span>
                <span className="font-sign text-white break-all">{c.value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-lg font-bold text-white">
            {d.footer.mottoMain}
            {d.footer.mottoSub}
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="page-wrap py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[13px] text-white/50">
          <span>{d.footer.copyright.replace('{year}', String(year))}</span>
          {onOpenAdminConsole && (
            <button
              type="button"
              onClick={onOpenAdminConsole}
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              员工登录
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
