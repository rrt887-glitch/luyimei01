import { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { sanitizeSiteContactConfigForFirestore } from '../utils/firestoreSanitizer';

export interface SiteContactConfig {
  whatsappNumber: string; // Digits with country code, e.g. "86139..." (empty if not configured)
  whatsappDisplay: string; // Formatted display string
  hotlinePhone: string; // Official landline/hotline (empty if not configured)
  wechatId: string; // Official business WeChat ID
  officialEmail: string; // Official business email
  address: string; // Company headquarters address
  updatedAt?: string;
}

const CONTACT_STORAGE_KEY = 'lym_site_contact_config_v1';

// Known placeholder numbers that must NEVER be used as real destinations
const FORBIDDEN_PLACEHOLDER_NUMBERS = new Set([
  '8613800138000',
  '13800138000',
  '8613800000000',
  '13800000000',
  '862087654321',
  '02087654321',
  '87654321',
  '4008886629'
]);

export function isPlaceholderPhoneNumber(raw: string | undefined | null): boolean {
  if (!raw) return true;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits || digits.length < 7) return true;
  if (FORBIDDEN_PLACEHOLDER_NUMBERS.has(digits)) return true;
  // Also block obvious sequential/repeating test numbers like 1380000...
  if (/^(86)?13800138000$/.test(digits) || /^(86)?13800000000$/.test(digits)) {
    return true;
  }
  return false;
}

function getInitialEnvWhatsApp(): string {
  const raw = (import.meta.env.VITE_WHATSAPP_NUMBER || '').trim();
  return isPlaceholderPhoneNumber(raw) ? '' : raw.replace(/[^0-9]/g, '');
}

function getInitialEnvPhone(): string {
  const raw = (import.meta.env.VITE_COMPANY_PHONE || '').trim();
  return isPlaceholderPhoneNumber(raw) ? '' : raw;
}

const DEFAULT_CONTACT_CONFIG: SiteContactConfig = {
  whatsappNumber: getInitialEnvWhatsApp(),
  whatsappDisplay: getInitialEnvWhatsApp() ? `+${getInitialEnvWhatsApp()}` : '',
  hotlinePhone: getInitialEnvPhone(),
  wechatId: (import.meta.env.VITE_COMPANY_WECHAT || 'LYM-Engineering-GZ').trim(),
  officialEmail: (import.meta.env.VITE_COMPANY_EMAIL || 'business@luyimei.com').trim(),
  address: '中国 · 广州高新技术产业开发区中新知识城智造产业园'
};

let currentContactConfig: SiteContactConfig = loadCachedContactConfig();
const listeners = new Set<(cfg: SiteContactConfig) => void>();
let firestoreSubscribed = false;

function loadCachedContactConfig(): SiteContactConfig {
  try {
    const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SiteContactConfig>;
      const cleanWa = isPlaceholderPhoneNumber(parsed.whatsappNumber)
        ? DEFAULT_CONTACT_CONFIG.whatsappNumber
        : (parsed.whatsappNumber || '').replace(/[^0-9]/g, '');
      const cleanHotline = isPlaceholderPhoneNumber(parsed.hotlinePhone)
        ? DEFAULT_CONTACT_CONFIG.hotlinePhone
        : (parsed.hotlinePhone || '').trim();
      return {
        whatsappNumber: cleanWa,
        whatsappDisplay: cleanWa ? (parsed.whatsappDisplay || `+${cleanWa}`) : '',
        hotlinePhone: cleanHotline,
        wechatId: parsed.wechatId || DEFAULT_CONTACT_CONFIG.wechatId,
        officialEmail: parsed.officialEmail || DEFAULT_CONTACT_CONFIG.officialEmail,
        address: parsed.address || DEFAULT_CONTACT_CONFIG.address,
        updatedAt: parsed.updatedAt
      };
    }
  } catch {
    // Ignore storage error
  }
  return { ...DEFAULT_CONTACT_CONFIG };
}

function syncJsonLdContactPoint(cfg: SiteContactConfig) {
  if (typeof document === 'undefined') return;
  try {
    const scriptEl = document.getElementById('lym-org-jsonld');
    if (!scriptEl) return;
    const data = JSON.parse(scriptEl.textContent || '{}');
    const contactPoint: Record<string, any> = {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: cfg.officialEmail || 'business@luyimei.com',
      availableLanguage: ['Chinese', 'English', 'Russian', 'Arabic']
    };
    if (cfg.hotlinePhone && !isPlaceholderPhoneNumber(cfg.hotlinePhone)) {
      contactPoint.telephone = cfg.hotlinePhone;
    } else if (cfg.whatsappNumber && !isPlaceholderPhoneNumber(cfg.whatsappNumber)) {
      contactPoint.telephone = `+${cfg.whatsappNumber.replace(/[^0-9]/g, '')}`;
    }
    data.contactPoint = [contactPoint];
    scriptEl.textContent = JSON.stringify(data, null, 2);
  } catch {
    // Ignore JSON-LD parse error
  }
}

function notifyListeners(cfg: SiteContactConfig) {
  currentContactConfig = cfg;
  try {
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore
  }
  syncJsonLdContactPoint(cfg);
  listeners.forEach(cb => cb(cfg));
}

export function initSiteContactSubscription() {
  if (firestoreSubscribed) return;
  firestoreSubscribed = true;
  try {
    const docRef = doc(db, 'site_config', 'contact');
    onSnapshot(
      docRef,
      snap => {
        if (snap.exists()) {
          const data = snap.data() as Partial<SiteContactConfig>;
          const cleanWa = isPlaceholderPhoneNumber(data.whatsappNumber)
            ? ''
            : (data.whatsappNumber || '').replace(/[^0-9]/g, '');
          const cleanHotline = isPlaceholderPhoneNumber(data.hotlinePhone)
            ? ''
            : (data.hotlinePhone || '').trim();
          const merged: SiteContactConfig = {
            whatsappNumber: cleanWa,
            whatsappDisplay: cleanWa ? (data.whatsappDisplay || `+${cleanWa}`) : '',
            hotlinePhone: cleanHotline,
            wechatId: (data.wechatId || DEFAULT_CONTACT_CONFIG.wechatId).trim(),
            officialEmail: (data.officialEmail || DEFAULT_CONTACT_CONFIG.officialEmail).trim(),
            address: (data.address || DEFAULT_CONTACT_CONFIG.address).trim(),
            updatedAt: data.updatedAt
          };
          notifyListeners(merged);
        }
      },
      () => {
        // Ignore snapshot errors on offline clients
      }
    );
  } catch {
    // Ignore
  }
}

export function getSiteContactConfig(): SiteContactConfig {
  initSiteContactSubscription();
  return currentContactConfig;
}

export async function saveSiteContactConfig(newConfig: Partial<SiteContactConfig>): Promise<SiteContactConfig> {
  if (!auth.currentUser) {
    throw new Error('未检测到管理员登录凭证，无法保存企业联系方式配置。');
  }

  const rawWa = (newConfig.whatsappNumber ?? currentContactConfig.whatsappNumber).replace(/[^0-9]/g, '');
  if (rawWa && isPlaceholderPhoneNumber(rawWa)) {
    throw new Error('禁止配置示例占位号码（如 13800138000 / 87654321），请输入真实的商务手机号或留空。');
  }

  const rawHotline = (newConfig.hotlinePhone ?? currentContactConfig.hotlinePhone).trim();
  if (rawHotline && isPlaceholderPhoneNumber(rawHotline)) {
    throw new Error('禁止配置示例占位电话号码，请输入真实的企业固话/热线或留空。');
  }

  const updated: SiteContactConfig = {
    whatsappNumber: rawWa,
    whatsappDisplay: rawWa ? (newConfig.whatsappDisplay?.trim() || `+${rawWa}`) : '',
    hotlinePhone: rawHotline,
    wechatId: (newConfig.wechatId ?? currentContactConfig.wechatId).trim() || 'LYM-Engineering-GZ',
    officialEmail: (newConfig.officialEmail ?? currentContactConfig.officialEmail).trim() || 'business@luyimei.com',
    address: (newConfig.address ?? currentContactConfig.address).trim() || DEFAULT_CONTACT_CONFIG.address,
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'site_config', 'contact'), sanitizeSiteContactConfigForFirestore(updated));
  notifyListeners(updated);
  return updated;
}

export function useSiteContactConfig(): SiteContactConfig {
  const [config, setConfig] = useState<SiteContactConfig>(() => getSiteContactConfig());

  useEffect(() => {
    initSiteContactSubscription();
    const handler = (next: SiteContactConfig) => setConfig({ ...next });
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return config;
}

/**
 * Returns true ONLY if a real, non-placeholder WhatsApp number is configured.
 */
export function hasConfiguredWhatsApp(): boolean {
  const wa = getSiteContactConfig().whatsappNumber;
  return Boolean(wa && !isPlaceholderPhoneNumber(wa));
}

/**
 * Generate a direct WhatsApp click-to-chat URL with prefilled product inquiry text.
 * SAFETY GUARD: If no real WhatsApp number is configured, NEVER send the user to a stranger's phone number;
 * instead return '#contact' so the user is directed to the on-page inquiry form.
 */
export function getWhatsAppInquiryUrl(
  productName?: string,
  model?: string,
  lang: string = 'zh'
): string {
  const cleanPhone = getSiteContactConfig().whatsappNumber.replace(/[^0-9]/g, '');
  if (!cleanPhone || isPlaceholderPhoneNumber(cleanPhone)) {
    return '#contact';
  }

  const pName = productName || '路易美道路养护产品';
  const pModel = model || '标准工程型号';

  let text = '';
  switch (lang) {
    case 'en':
      text = `Hello LYM Engineering, I would like to inquire about: ${pName} (Model: ${pModel}). Please share specifications and FOB USD pricing.`;
      break;
    case 'ar':
      text = `مرحباً فريق لوييمي، أود الاستفسار عن منتج: ${pName} (طراز: ${pModel}). يرجى إرسال المواصفات وقائمة الأسعار بالدولار الأمريكي (FOB).`;
      break;
    case 'ru':
      text = `Здравствуйте! Хотел бы запросить информацию о продукции: ${pName} (Модель: ${pModel}). Прошу отправить технические характеристики и цены FOB в долларах США.`;
      break;
    case 'zh':
    default:
      text = `您好，我想咨询路易美道路工程产品：${pName}（型号：${pModel}），请发送产品技术规格与美金（FOB）出口报价。`;
      break;
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Generate a direct WhatsApp follow-up URL targeting a specific CRM customer's phone number,
 * prefilled with personalized sales rep introduction and project context.
 */
export function getClientWhatsAppFollowUpUrl(
  customerPhone: string,
  customerName: string,
  needType: string,
  salesRepName: string
): string {
  let digits = (customerPhone || '').replace(/[^0-9]/g, '');
  if (!digits || isPlaceholderPhoneNumber(digits)) return '';

  // If 11 digits starting with 1 (mainland Chinese mobile), prefix 86
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = '86' + digits;
  }

  const name = customerName || '尊敬的客户';
  const need = needType || '道路工程产品需求';
  const rep = salesRepName || '路易美工程销售代表';

  const message = `Hello ${name}, I am ${rep} from Guangzhou Luyimei Engineering Equipment Co., Ltd. I am reaching out regarding your project inquiry [${need}]. Please let me know how I may assist you with technical specifications and FOB USD pricing. / 您好 ${name}，我是广州路易美工程设备销售代表 ${rep}，关于您在官网咨询的「${need}」项目，我已为您备好技术方案与出口美金报价，随时为您解答。`;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
