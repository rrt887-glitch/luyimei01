/** Category id from site_config/categories (built-ins: 'material', 'equipment'). See src/config/categories.ts. */
export type ProductCategory = string;

/** 'all' or a category id. */
export type ProductFilterCategory = string;

/** Free-text product fields that can be translated for the website's other languages. */
export interface ProductTextFields {
  name?: string;
  desc?: string;
  spec?: string;
  leadTime?: string;
  moq?: string;
  capacityLabel?: string;
  baseLocation?: string;
  packaging?: string;
}

/** Translations keyed by site language. Chinese is the product's own fields. */
export type ProductTranslations = Partial<Record<'en' | 'ar' | 'ru', ProductTextFields>>;

export interface SupplyCollaborationSpecs {
  leadTime: string; // 供货周期 / 交期 (例如: 现货 / 24-48小时发货, 7-10天定制周期)
  moq: string; // 最小起订量 (例如: 1台, 10桶 / 250kg)
  capacityStatus: 'ample' | 'moderate' | 'tight' | 'custom'; // 产能储备状态
  capacityLabel?: string; // 产能说明 (例如: 月产800吨 · 常备库存200吨)
  baseLocation?: string; // 生产基地 / 发货仓 (例如: 广州黄埔智造基地)
  packaging?: string; // 供货包装 (例如: 25kg防潮桶装 / 托盘定制)
}

export interface Product {
  id: string;
  nameKey: string;
  type: ProductCategory;
  catKey: string;
  model: string;
  descKey: string;
  price: string;
  unitKey: string;
  specKey: string;
  inStock: boolean;
  isDeleted?: boolean;
  year: number;
  brand: string;
  condition: 'new' | 'certified';
  status?: 'draft' | 'published' | 'archived' | 'out_of_stock';
  featured?: boolean;
  /** Set when the product is shown in the homepage "New arrivals" row (ISO time it was added there). */
  newArrivalAt?: string;
  videoUrl?: string;
  videoThumbnail?: string;
  images?: string[];
  mediaType?: 'image' | 'video' | 'mixed';
  tierPrices?: { minQty: number; priceUsd: string }[];
  supplySpecs?: SupplyCollaborationSpecs;
  translations?: ProductTranslations;
  isCustom?: boolean;
  userModified?: boolean;
  customImagesCount?: number;
  customName?: string;
  customSpec?: string;
  customDesc?: string;
  unit?: string;
  updatedAt?: string;
}

export interface InquiryFormData {
  name: string;
  company?: string;
  phone: string;
  needType: string;
  location: string;
  message: string;
}

export interface InquiryRecord extends InquiryFormData {
  id: string;
  createdAt: string;
  status: 'pending' | 'reviewing' | 'contacted';
  buyerUid?: string;
  buyerEmail?: string;
  syncStatus?: 'synced' | 'queued_local';
}

export interface SubmitInquiryResult extends InquiryRecord {
  syncedToCloud: boolean;
  queuedOffline: boolean;
  pendingOutboxCount: number;
}

export type SupportedLanguage = 'zh' | 'en' | 'ar' | 'ru';

export interface UserAccount {
  id: string;
  email: string;
  company?: string;
  name?: string;
  phone?: string;
  country?: string;
  role?: string;
  registeredAt?: string;
  token?: string;
}

/** Foreign-language texts of a website content item (Chinese is the item's own fields). */
export type ContentTranslations<K extends string> = Partial<Record<'en' | 'ar' | 'ru', Partial<Record<K, string>>>>;

/** One picture of the "工厂介绍" section (factory_photos/{id}). */
export interface FactoryPhoto {
  id: string;
  imageUrl: string;
  /** Where the picture was taken, e.g. 生产车间 / 原料仓库. */
  title: string;
  desc?: string;
  translations?: ContentTranslations<'title' | 'desc'>;
  /** Display order, smallest first. */
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** One article of the "公司新闻" section (news/{id}). */
export interface NewsPost {
  id: string;
  title: string;
  summary?: string;
  /** Plain text; blank lines separate paragraphs. */
  content: string;
  coverUrl?: string;
  /** More pictures shown under the article. */
  images?: string[];
  /** Date shown on the website, YYYY-MM-DD. */
  date: string;
  /** Drafts are visible in the console only. */
  published: boolean;
  translations?: ContentTranslations<'title' | 'summary' | 'content'>;
  createdAt?: string;
  updatedAt?: string;
}
