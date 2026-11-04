/**
 * Firestore Data Sanitizer Utility
 *
 * Firestore strictly rejects documents or nested objects containing `undefined` values,
 * as well as `NaN` or `Infinity` numbers, and security rules enforce `hasOnly` field whitelists
 * defined in `firebase-blueprint.json`.
 *
 * This module recursively strips `undefined` properties and enforces strict schema field
 * whitelists before any `setDoc`, `addDoc`, or `updateDoc` call.
 */

export function sanitizeForFirestore<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'number') {
    return (Number.isFinite(input) ? input : 0) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as unknown as T;
  }

  if (typeof input === 'object' && !(input instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
      if (value === undefined) {
        continue;
      }
      if (typeof value === 'string') {
        result[key] = value;
      } else {
        result[key] = sanitizeForFirestore(value);
      }
    }
    return result as T;
  }

  return input;
}

export function pickAllowedFields<T extends Record<string, any>>(
  data: T,
  allowedKeys: readonly string[]
): Record<string, any> {
  const sanitized = sanitizeForFirestore(data);
  const picked: Record<string, any> = {};
  const allowedSet = new Set(allowedKeys);

  for (const [key, value] of Object.entries(sanitized)) {
    if (allowedSet.has(key) && value !== undefined) {
      picked[key] = value;
    }
  }
  return picked;
}

// ============================================================================
// Schema Whitelists Strictly Aligned with firebase-blueprint.json & firestore.rules
// ============================================================================

export const PRODUCT_ALLOWED_KEYS = [
  'id',
  'nameKey',
  'type',
  'catKey',
  'model',
  'descKey',
  'price',
  'unitKey',
  'specKey',
  'inStock',
  'isDeleted',
  'year',
  'brand',
  'condition',
  'status',
  'customName',
  'customSpec',
  'customDesc',
  'featured',
  'videoUrl',
  'videoThumbnail',
  'images',
  'unit',
  'tierPrices',
  'supplySpecs',
  'translations',
  'userModified',
  'updatedAt',
  'newArrivalAt',
  'thumbs'
] as const;

export const INQUIRY_ALLOWED_KEYS = [
  'id',
  'name',
  'customerName',
  'company',
  'phone',
  'needType',
  'location',
  'message',
  'buyerUid',
  'buyerEmail',
  'createdAt',
  'updatedAt',
  'status',
  'stage',
  'assignedStaffId',
  'assignedStaffName',
  'estimatedValueUsd',
  'notes',
  'followUpNotes',
  'customerId'
] as const;

export const FAVORITE_ALLOWED_KEYS = [
  'id',
  'productId',
  'userId',
  'createdAt'
] as const;

export const BUYER_PROFILE_ALLOWED_KEYS = [
  'id',
  'uid',
  'email',
  'name',
  'company',
  'phone',
  'country',
  'role',
  'registeredAt',
  'updatedAt'
] as const;

export const CUSTOMER_ALLOWED_KEYS = [
  'id',
  'name',
  'company',
  'email',
  'phone',
  'country',
  'status',
  'source',
  'inquiryCount',
  'totalQuotationUsd',
  'registeredAt',
  'lastActiveAt'
] as const;

export const STAFF_ALLOWED_KEYS = [
  'id',
  'uid',
  'name',
  'phone',
  'email',
  'role',
  'status',
  'lastLoginAt',
  'assignedLeadsCount',
  'createdAt',
  'updatedAt'
] as const;

export const AUDIT_LOG_ALLOWED_KEYS = [
  'id',
  'operator',
  'operatorRole',
  'action',
  'target',
  'details',
  'timestamp'
] as const;

export const BILLING_CONFIG_ALLOWED_KEYS = [
  'beneficiary',
  'bankName',
  'bankAddress',
  'accountNumber',
  'swiftCode',
  'remarks',
  'updatedAt'
] as const;

export const CATEGORY_CONFIG_ALLOWED_KEYS = ['items', 'updatedAt'] as const;

export const QUOTATION_CONFIG_ALLOWED_KEYS = [
  'companyNameEn',
  'companyNameZh',
  'addressEn',
  'phone',
  'email',
  'website',
  'stampImage',
  'defaultIncoterm',
  'defaultPortOfLoading',
  'defaultPaymentTerms',
  'defaultDepositPercent',
  'defaultDeliveryTime',
  'defaultValidityDays',
  'defaultPacking',
  'standardTerms',
  'updatedAt'
] as const;

export const SITE_CONTACT_CONFIG_ALLOWED_KEYS = [
  'whatsappNumber',
  'whatsappDisplay',
  'hotlinePhone',
  'wechatId',
  'officialEmail',
  'address',
  'addressEn',
  'wechatQrUrl',
  'alibabaUrl',
  'facebookUrl',
  'linkedinUrl',
  'youtubeUrl',
  'tiktokUrl',
  'updatedAt'
] as const;

export const FACTORY_PHOTO_ALLOWED_KEYS = ['id', 'imageUrl', 'thumbUrl', 'title', 'desc', 'translations', 'order', 'createdAt', 'updatedAt'] as const;
export const NEWS_POST_ALLOWED_KEYS = [
  'id',
  'title',
  'summary',
  'content',
  'coverUrl',
  'coverThumbUrl',
  'images',
  'date',
  'published',
  'translations',
  'createdAt',
  'updatedAt'
] as const;

const toCanonicalMedia = (u: string) =>
  u.startsWith('/__api/storage/') ? `https://firebasestorage.googleapis.com${u.slice('/__api/storage'.length)}` : u;

/** Drops empty foreign texts so a cleared field falls back to English / Chinese on the website. */
function cleanContentTranslations(t: unknown): Record<string, Record<string, string>> | undefined {
  if (!t || typeof t !== 'object') return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const lang of ['en', 'ar', 'ru']) {
    const src = (t as Record<string, unknown>)[lang];
    if (!src || typeof src !== 'object') continue;
    const texts: Record<string, string> = {};
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) texts[k] = v.trim();
    }
    if (Object.keys(texts).length) out[lang] = texts;
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeFactoryPhotoForFirestore(photo: Record<string, any>): Record<string, any> {
  const cleaned = pickAllowedFields({ ...photo, translations: cleanContentTranslations(photo.translations) }, FACTORY_PHOTO_ALLOWED_KEYS);
  if (typeof cleaned.imageUrl === 'string') cleaned.imageUrl = toCanonicalMedia(cleaned.imageUrl);
  if (typeof cleaned.thumbUrl === 'string') cleaned.thumbUrl = toCanonicalMedia(cleaned.thumbUrl);
  if (!cleaned.thumbUrl) delete cleaned.thumbUrl;
  if (typeof cleaned.desc === 'string' && !cleaned.desc.trim()) delete cleaned.desc;
  return cleaned;
}

export function sanitizeNewsPostForFirestore(post: Record<string, any>): Record<string, any> {
  const cleaned = pickAllowedFields({ ...post, translations: cleanContentTranslations(post.translations) }, NEWS_POST_ALLOWED_KEYS);
  if (typeof cleaned.coverUrl === 'string') cleaned.coverUrl = toCanonicalMedia(cleaned.coverUrl);
  if (typeof cleaned.coverUrl === 'string' && !cleaned.coverUrl) delete cleaned.coverUrl;
  if (typeof cleaned.coverThumbUrl === 'string') cleaned.coverThumbUrl = toCanonicalMedia(cleaned.coverThumbUrl);
  if (!cleaned.coverUrl || !cleaned.coverThumbUrl) delete cleaned.coverThumbUrl;
  if (Array.isArray(cleaned.images)) cleaned.images = cleaned.images.filter((u: unknown) => typeof u === 'string' && u).map(toCanonicalMedia);
  if (typeof cleaned.summary === 'string' && !cleaned.summary.trim()) delete cleaned.summary;
  return cleaned;
}

export function sanitizeProductForFirestore(product: Record<string, any>): Record<string, any> {
  const cleaned = pickAllowedFields(product, PRODUCT_ALLOWED_KEYS);
  const toCanonical = (u: string) =>
    u.startsWith('/__api/storage/')
      ? `https://firebasestorage.googleapis.com${u.slice('/__api/storage'.length)}`
      : u;
  if (Array.isArray(cleaned.images)) {
    cleaned.images = cleaned.images.map((img: unknown) => (typeof img === 'string' ? toCanonical(img) : img));
  }
  if (typeof cleaned.videoUrl === 'string') {
    cleaned.videoUrl = toCanonical(cleaned.videoUrl);
  }
  if (typeof cleaned.videoThumbnail === 'string') {
    cleaned.videoThumbnail = toCanonical(cleaned.videoThumbnail);
  }
  // Thumbnails: canonical URLs, only for pictures the product still has.
  if (cleaned.thumbs && typeof cleaned.thumbs === 'object') {
    const keep = new Set(Array.isArray(cleaned.images) ? cleaned.images : []);
    const thumbs: Record<string, string> = {};
    for (const [full, small] of Object.entries(cleaned.thumbs as Record<string, unknown>)) {
      const key = toCanonical(full);
      if (typeof small === 'string' && small && keep.has(key)) thumbs[key] = toCanonical(small);
    }
    if (Object.keys(thumbs).length) cleaned.thumbs = thumbs;
    else delete cleaned.thumbs;
  }
  if (typeof cleaned.customName === 'string' && cleaned.customName.trim() === '') {
    delete cleaned.customName;
  }
  if (typeof cleaned.customDesc === 'string' && cleaned.customDesc.trim() === '') {
    delete cleaned.customDesc;
  }
  if (typeof cleaned.customSpec === 'string' && cleaned.customSpec.trim() === '') {
    delete cleaned.customSpec;
  }
  if (typeof cleaned.videoUrl === 'string' && cleaned.videoUrl.trim() === '') {
    delete cleaned.videoUrl;
  }
  return cleaned;
}

export function sanitizeInquiryForFirestore(inquiry: Record<string, any>): Record<string, any> {
  const cleaned = pickAllowedFields(inquiry, INQUIRY_ALLOWED_KEYS);
  // `assignedStaffId` is always present: '' means "public pool" (required by firestore.rules so that
  // sales reps can query `where('assignedStaffId', 'in', ['', uid])`).
  cleaned.assignedStaffId =
    typeof cleaned.assignedStaffId === 'string' ? cleaned.assignedStaffId.trim() : '';
  if (typeof cleaned.assignedStaffName === 'string' && cleaned.assignedStaffName.trim() === '') {
    delete cleaned.assignedStaffName;
  }
  if (typeof cleaned.buyerUid === 'string' && cleaned.buyerUid.trim() === '') {
    delete cleaned.buyerUid;
  }
  if (typeof cleaned.buyerEmail === 'string' && cleaned.buyerEmail.trim() === '') {
    delete cleaned.buyerEmail;
  }
  return cleaned;
}

export const sanitizeLeadForFirestore = sanitizeInquiryForFirestore;

export function sanitizeFavoriteForFirestore(fav: Record<string, any>): Record<string, any> {
  return pickAllowedFields(fav, FAVORITE_ALLOWED_KEYS);
}

export function sanitizeBuyerProfileForFirestore(profile: Record<string, any>): Record<string, any> {
  return pickAllowedFields(profile, BUYER_PROFILE_ALLOWED_KEYS);
}

export const sanitizeBuyerForFirestore = sanitizeBuyerProfileForFirestore;

export function sanitizeCustomerForFirestore(customer: Record<string, any>): Record<string, any> {
  return pickAllowedFields(customer, CUSTOMER_ALLOWED_KEYS);
}

export function sanitizeStaffForFirestore(staff: Record<string, any>): Record<string, any> {
  return pickAllowedFields(staff, STAFF_ALLOWED_KEYS);
}


export function sanitizeAuditLogForFirestore(log: Record<string, any>): Record<string, any> {
  return pickAllowedFields(log, AUDIT_LOG_ALLOWED_KEYS);
}

export const QUOTATION_ALLOWED_KEYS = [
  'id',
  'quotationNumber',
  'leadId',
  'customerId',
  'clientName',
  'clientCompany',
  'clientCountry',
  'date',
  'validUntil',
  'portOfLoading',
  'paymentTerms',
  'currency',
  'items',
  'totalAmountUsd',
  'notes',
  'lang',
  'details',
  'createdBy',
  'createdByUid',
  'createdAt'
] as const;

const QUOTATION_ITEM_KEYS = [
  'productId',
  'productName',
  'model',
  'name',
  'nameZh',
  'spec',
  'specZh',
  'unitPriceUsd',
  'quantity',
  'unit',
  'amountUsd'
] as const;

export function sanitizeQuotationForFirestore(quotation: Record<string, any>): Record<string, any> {
  const cleaned = pickAllowedFields(quotation, QUOTATION_ALLOWED_KEYS);
  if (Array.isArray(cleaned.items)) {
    cleaned.items = cleaned.items.map((item: Record<string, any>) => pickAllowedFields(item, QUOTATION_ITEM_KEYS));
  }
  for (const key of ['leadId', 'customerId'] as const) {
    if (typeof cleaned[key] === 'string' && cleaned[key].trim() === '') {
      delete cleaned[key];
    }
  }
  return cleaned;
}

export function sanitizeSiteContactConfigForFirestore(
  cfg: Record<string, any>
): Record<string, any> {
  return pickAllowedFields(cfg, SITE_CONTACT_CONFIG_ALLOWED_KEYS);
}

export function sanitizeBillingConfigForFirestore(cfg: Record<string, any>): Record<string, any> {
  return pickAllowedFields(cfg, BILLING_CONFIG_ALLOWED_KEYS);
}

export function sanitizeCategoryConfigForFirestore(cfg: Record<string, any>): Record<string, any> {
  return pickAllowedFields(cfg, CATEGORY_CONFIG_ALLOWED_KEYS);
}

export function sanitizeQuotationConfigForFirestore(cfg: Record<string, any>): Record<string, any> {
  return pickAllowedFields(cfg, QUOTATION_CONFIG_ALLOWED_KEYS);
}
