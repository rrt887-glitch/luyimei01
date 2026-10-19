/**
 * Static schema contract tests (no emulator needed):
 *   firestore.rules  <->  firebase-blueprint.json  <->  src/utils/firestoreSanitizer.ts
 * plus a payload check for every client write path.
 *
 * Behavioural security tests live in tests/firestore.rules.emulator.test.ts (run with `npm run test:emulator`).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import blueprint from '../firebase-blueprint.json';
import { initialProducts } from '../src/data/products';
import {
  PRODUCT_ALLOWED_KEYS,
  INQUIRY_ALLOWED_KEYS,
  FAVORITE_ALLOWED_KEYS,
  BUYER_PROFILE_ALLOWED_KEYS,
  CUSTOMER_ALLOWED_KEYS,
  STAFF_ALLOWED_KEYS,
  AUDIT_LOG_ALLOWED_KEYS,
  SITE_CONTACT_CONFIG_ALLOWED_KEYS,
  BILLING_CONFIG_ALLOWED_KEYS,
  CATEGORY_CONFIG_ALLOWED_KEYS,
  QUOTATION_CONFIG_ALLOWED_KEYS,
  sanitizeQuotationConfigForFirestore,
  QUOTATION_ALLOWED_KEYS,
  sanitizeQuotationForFirestore,
  sanitizeProductForFirestore,
  sanitizeInquiryForFirestore,
  sanitizeLeadForFirestore,
  sanitizeFavoriteForFirestore,
  sanitizeBuyerProfileForFirestore,
  sanitizeCustomerForFirestore,
  sanitizeStaffForFirestore,
  sanitizeAuditLogForFirestore,
  sanitizeSiteContactConfigForFirestore,
  sanitizeBillingConfigForFirestore
} from '../src/utils/firestoreSanitizer';

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

/**
 * Extract `hasOnlyAllowedFields([...])` and `hasRequiredFields([...])` arrays
 * for a given validator function in `firestore.rules`.
 */
function extractRuleValidatorFields(validatorName: string): {
  required: string[];
  allowed: string[];
} {
  const fnStart = rulesContent.indexOf(`function ${validatorName}(`);
  if (fnStart === -1) {
    throw new Error(`Validator function ${validatorName} not found in firestore.rules`);
  }
  const nextFn = rulesContent.indexOf('function ', fnStart + 10);
  const block = rulesContent.slice(fnStart, nextFn === -1 ? undefined : nextFn);

  const reqMatch = block.match(/hasRequiredFields\(\[([\s\S]*?)\]\)/);
  const allowMatch = block.match(/hasOnlyAllowedFields\(\[([\s\S]*?)\]\)/);

  const parseList = (raw?: string): string[] => {
    if (!raw) return [];
    return Array.from(raw.matchAll(/'([^']+)'/g)).map(m => m[1]);
  };

  return {
    required: parseList(reqMatch?.[1]),
    allowed: parseList(allowMatch?.[1])
  };
}

describe('Firestore Rules, Blueprint & Sanitizer 3-Way Alignment', () => {
  const collectionSpecs = [
    {
      collection: 'inquiries',
      entityName: 'Inquiry' as const,
      validatorName: 'isValidInquiry',
      sanitizerKeys: INQUIRY_ALLOWED_KEYS
    },
    {
      collection: 'favorites',
      entityName: 'Favorite' as const,
      validatorName: 'isValidFavorite',
      sanitizerKeys: FAVORITE_ALLOWED_KEYS
    },
    {
      collection: 'products',
      entityName: 'Product' as const,
      validatorName: 'isValidProduct',
      sanitizerKeys: PRODUCT_ALLOWED_KEYS
    },
    {
      collection: 'buyers',
      entityName: 'BuyerProfile' as const,
      validatorName: 'isValidBuyerProfile',
      sanitizerKeys: BUYER_PROFILE_ALLOWED_KEYS
    },
    {
      collection: 'customers',
      entityName: 'CustomerProfile' as const,
      validatorName: 'isValidCustomerProfile',
      sanitizerKeys: CUSTOMER_ALLOWED_KEYS
    },
    {
      collection: 'audit_logs',
      entityName: 'AuditLog' as const,
      validatorName: 'isValidAuditLog',
      sanitizerKeys: AUDIT_LOG_ALLOWED_KEYS
    },
    {
      collection: 'staff',
      entityName: 'StaffAccount' as const,
      validatorName: 'isValidStaffDoc',
      sanitizerKeys: STAFF_ALLOWED_KEYS
    },
    {
      collection: 'site_config',
      entityName: 'SiteContactConfig' as const,
      validatorName: 'isValidSiteContactConfig',
      sanitizerKeys: SITE_CONTACT_CONFIG_ALLOWED_KEYS
    },
    {
      collection: 'site_config/billing',
      entityName: 'BillingConfig' as const,
      validatorName: 'isValidBillingConfig',
      sanitizerKeys: BILLING_CONFIG_ALLOWED_KEYS
    },
    {
      collection: 'site_config/quotation',
      entityName: 'QuotationConfig' as const,
      validatorName: 'isValidQuotationConfig',
      sanitizerKeys: QUOTATION_CONFIG_ALLOWED_KEYS
    },
    {
      collection: 'site_config/categories',
      entityName: 'CategoryConfig' as const,
      validatorName: 'isValidCategoryConfig',
      sanitizerKeys: CATEGORY_CONFIG_ALLOWED_KEYS
    },
    {
      collection: 'quotations',
      entityName: 'Quotation' as const,
      validatorName: 'isValidQuotation',
      sanitizerKeys: QUOTATION_ALLOWED_KEYS
    }
  ];

  for (const spec of collectionSpecs) {
    it(`[${spec.collection}] matches allowed & required fields across firestore.rules, firebase-blueprint.json, and firestoreSanitizer.ts`, () => {
      const entity = blueprint.entities[spec.entityName];
      expect(entity).toBeDefined();

      const blueprintAllowed = Object.keys(entity.properties).sort();
      const blueprintRequired = [...entity.required].sort();
      const sanitizerAllowed = [...spec.sanitizerKeys].sort();

      const ruleFields = extractRuleValidatorFields(spec.validatorName);
      const ruleAllowed = [...ruleFields.allowed].sort();
      const ruleRequired = [...ruleFields.required].sort();

      expect(ruleAllowed).toEqual(blueprintAllowed);
      expect(sanitizerAllowed).toEqual(blueprintAllowed);
      expect(ruleRequired).toEqual(blueprintRequired);
    });
  }
});

describe('Write Path Payload Contract Verification (Every Collection Write Path)', () => {
  it('1. Pre-provisioned Super Admin first login & session validation staff write payload passes isValidStaffDoc', () => {
    const ruleFields = extractRuleValidatorFields('isValidStaffDoc');
    const adminStaffPayload = sanitizeStaffForFirestore({
      id: 'uid_admin_001',
      uid: 'uid_admin_001',
      name: '系统超级管理员',
      email: 'admin@luyimei.com',
      phone: '00000000000',
      role: 'super_admin',
      status: 'active',
      assignedLeadsCount: 0,
      lastLoginAt: new Date().toISOString(),
      // Ensure any accidental legacy or sensitive fields are stripped:
      passwordHash: 'forbidden',
      salt: 'forbidden',
      lastLogin: 'legacy_field'
    });

    const keys = Object.keys(adminStaffPayload);
    for (const reqKey of ruleFields.required) {
      expect(keys).toContain(reqKey);
    }
    for (const k of keys) {
      expect(ruleFields.allowed).toContain(k);
    }
    expect(adminStaffPayload.passwordHash).toBeUndefined();
    expect(adminStaffPayload.salt).toBeUndefined();
  });

  it('2. Public visitor & buyer inquiry submission payload passes isValidInquiry', () => {
    const ruleFields = extractRuleValidatorFields('isValidInquiry');
    const inquiryPayload = sanitizeInquiryForFirestore({
      id: 'INQ-M8Z91A',
      name: '张工',
      customerName: '张工',
      company: '广东路桥建设集团',
      phone: '+86 13922223333',
      needType: '沥青冷补料采购',
      location: '广州',
      message: '采购200桶冷补料，请发FOB报价单',
      buyerUid: undefined,
      buyerEmail: '',
      createdAt: new Date().toISOString(),
      status: 'pending',
      stage: 'new'
    });

    const keys = Object.keys(inquiryPayload);
    for (const reqKey of ruleFields.required) {
      expect(keys).toContain(reqKey);
    }
    for (const k of keys) {
      expect(ruleFields.allowed).toContain(k);
      expect(inquiryPayload[k]).not.toBeUndefined();
    }
    // Empty optional buyerUid/buyerEmail should be stripped cleanly
    expect('buyerUid' in inquiryPayload).toBe(false);
    expect('buyerEmail' in inquiryPayload).toBe(false);
  });

  it('3. Admin manual lead creation & CRM stage/assignment batch update payload passes isValidInquiry', () => {
    const ruleFields = extractRuleValidatorFields('isValidInquiry');
    const leadPayload = sanitizeLeadForFirestore({
      id: 'LEAD-1710000000',
      name: 'Ahmed Al-Mansoor',
      customerName: 'Ahmed Al-Mansoor',
      company: 'Gulf Highway Corp',
      phone: '+971501234567',
      needType: '路面灌缝机',
      location: 'Dubai, UAE',
      message: 'Need 5 units of crack sealing machines',
      estimatedValueUsd: 35000,
      stage: 'quoted',
      assignedStaffId: undefined, // Unassigned lead: must become the '' pool marker, never undefined
      assignedStaffName: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: [{ id: 'N1', authorName: '管理员', content: '已发送正式报价', createdAt: '2026-10-15' }],
      followUpNotes: [{ id: 'N1', authorName: '管理员', content: '已发送正式报价', createdAt: '2026-10-15' }]
    });

    const keys = Object.keys(leadPayload);
    for (const reqKey of ruleFields.required) {
      expect(keys).toContain(reqKey);
    }
    for (const k of keys) {
      expect(ruleFields.allowed).toContain(k);
      expect(leadPayload[k]).not.toBeUndefined();
    }
    // Every lead carries assignedStaffId; '' is the public pool (required so reps can query `in ['', uid]`).
    expect(leadPayload.assignedStaffId).toBe('');
    expect('assignedStaffName' in leadPayload).toBe(false);
  });

  it('4. Product save & Product deletion tombstone records both pass isValidProduct', () => {
    const ruleFields = extractRuleValidatorFields('isValidProduct');

    // 4a. Normal product update with empty customName/customDesc
    const normalProductPayload = sanitizeProductForFirestore({
      ...initialProducts[0],
      customName: '',
      customDesc: undefined,
      isDeleted: false,
      userModified: true,
      updatedAt: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(normalProductPayload)).toContain(reqKey);
    }
    for (const k of Object.keys(normalProductPayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
    expect('customName' in normalProductPayload).toBe(false);
    expect('customDesc' in normalProductPayload).toBe(false);

    // 4b. Deleted default product tombstone
    const defaultTombstonePayload = sanitizeProductForFirestore({
      ...initialProducts[0],
      id: initialProducts[0].id,
      isDeleted: true,
      inStock: false,
      status: 'archived',
      updatedAt: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(defaultTombstonePayload)).toContain(reqKey);
    }
    for (const k of Object.keys(defaultTombstonePayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
    expect(defaultTombstonePayload.isDeleted).toBe(true);
    expect(defaultTombstonePayload.status).toBe('archived');

    // 4c. Deleted custom product tombstone (not in initialProducts)
    const customTombstonePayload = sanitizeProductForFirestore({
      id: 'custom_prod_99',
      type: 'material',
      nameKey: 'deleted_product',
      catKey: 'p1Cat',
      descKey: 'deleted_product',
      specKey: 'p1Spec',
      model: 'DELETED',
      price: '$0',
      unitKey: 'p1Unit',
      inStock: false,
      status: 'archived',
      isDeleted: true,
      updatedAt: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(customTombstonePayload)).toContain(reqKey);
    }
    for (const k of Object.keys(customTombstonePayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
    expect(customTombstonePayload.isDeleted).toBe(true);
  });

  it('5. Authenticated buyer favorite payload passes isValidFavorite', () => {
    const ruleFields = extractRuleValidatorFields('isValidFavorite');
    const favPayload = sanitizeFavoriteForFirestore({
      id: 'fav_buyer123_0',
      productId: '0',
      userId: 'buyer123',
      createdAt: new Date().toISOString()
    });

    expect(Object.keys(favPayload).sort()).toEqual([...ruleFields.required].sort());
    for (const k of Object.keys(favPayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
  });

  it('6. Buyer registration profile payload passes isValidBuyerProfile', () => {
    const ruleFields = extractRuleValidatorFields('isValidBuyerProfile');
    const buyerPayload = sanitizeBuyerProfileForFirestore({
      id: 'buyer_uid_01',
      uid: 'buyer_uid_01',
      email: 'procurement@roadcorp.com',
      name: 'John Miller',
      company: 'RoadCorp International',
      phone: '+1 555 234 5678',
      country: 'USA',
      role: '官网注册采购会员',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(buyerPayload)).toContain(reqKey);
    }
    for (const k of Object.keys(buyerPayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
  });

  it('7. CRM Customer archive payload passes isValidCustomerProfile', () => {
    const ruleFields = extractRuleValidatorFields('isValidCustomerProfile');
    const customerPayload = sanitizeCustomerForFirestore({
      id: 'CUST-buyer_uid_01',
      name: 'John Miller',
      company: 'RoadCorp International',
      email: 'procurement@roadcorp.com',
      phone: '+1 555 234 5678',
      country: 'USA',
      status: 'active',
      source: '官网注册客户',
      inquiryCount: 2,
      totalQuotationUsd: 18500,
      registeredAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(customerPayload)).toContain(reqKey);
    }
    for (const k of Object.keys(customerPayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
  });

  it('8. Audit log payload passes isValidAuditLog', () => {
    const ruleFields = extractRuleValidatorFields('isValidAuditLog');
    const logPayload = sanitizeAuditLogForFirestore({
      id: 'LOG-1710000000-ab12',
      operator: '系统超级管理员',
      operatorRole: 'super_admin',
      action: '预置超级管理员登录',
      target: '系统超级管理员',
      details: '通过 Firebase 控制台预置管理员账号登录',
      timestamp: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(logPayload)).toContain(reqKey);
    }
    for (const k of Object.keys(logPayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
  });

  it('9. Site contact config payload passes isValidSiteContactConfig', () => {
    const ruleFields = extractRuleValidatorFields('isValidSiteContactConfig');
    const configPayload = sanitizeSiteContactConfigForFirestore({
      whatsappNumber: '8613928889999',
      whatsappDisplay: '+86 139 2888 9999',
      hotlinePhone: '+86-20-38889999',
      wechatId: 'LYM-Engineering-GZ',
      officialEmail: 'business@luyimei.com',
      address: '中国 · 广州高新技术产业开发区中新知识城智造产业园',
      updatedAt: new Date().toISOString()
    });

    for (const reqKey of ruleFields.required) {
      expect(Object.keys(configPayload)).toContain(reqKey);
    }
    for (const k of Object.keys(configPayload)) {
      expect(ruleFields.allowed).toContain(k);
    }
  });

  it('9b. Billing (bank details) payload passes isValidBillingConfig', () => {
    const ruleFields = extractRuleValidatorFields('isValidBillingConfig');
    const payload = sanitizeBillingConfigForFirestore({
      beneficiary: 'Guangzhou Luyimei Engineering Equipment Co., Ltd.',
      bankName: 'Example Bank, Guangzhou Branch',
      bankAddress: 'Guangzhou, China',
      accountNumber: '6222 0000 0000 0000',
      swiftCode: 'EXAMPLECN',
      remarks: 'Please quote the PI number in the transfer reference.',
      updatedAt: new Date().toISOString(),
      // unknown fields must be dropped by the sanitizer
      internalNote: 'should not be written'
    });

    expect(Object.keys(payload)).not.toContain('internalNote');
    for (const reqKey of ruleFields.required) {
      expect(Object.keys(payload)).toContain(reqKey);
    }
    for (const k of Object.keys(payload)) {
      expect(ruleFields.allowed).toContain(k);
    }
  });

  it('10. Issued quotation payload passes isValidQuotation', () => {
    const ruleFields = extractRuleValidatorFields('isValidQuotation');
    const payload = sanitizeQuotationForFirestore({
      id: 'PI-LYM-20261016-7KQ2ZD',
      quotationNumber: 'PI-LYM-20261016-7KQ2ZD',
      leadId: 'INQ-abc',
      customerId: '',
      clientName: 'Ahmed',
      clientCompany: 'Gulf Pavement',
      clientCountry: 'UAE',
      date: '2026/10/16',
      validUntil: '30 Days',
      portOfLoading: 'Guangzhou',
      paymentTerms: '30% T/T',
      currency: 'USD ($)',
      items: [{ productId: '0', productName: 'Cold patch', model: 'LYM-CP', unitPriceUsd: 420, quantity: 20, unit: 'Ton', amountUsd: 8400, extra: 'x' }],
      totalAmountUsd: 8400,
      notes: 'FOB',
      lang: 'bilingual',
      details: { incoterm: 'CIF', portOfDischarge: 'Jebel Ali', freightUsd: 800, missing: undefined },
      createdBy: '销售甲',
      createdByUid: 'repA',
      createdAt: new Date().toISOString(),
      unknownField: 'dropped'
    });
    for (const reqKey of ruleFields.required) {
      expect(Object.keys(payload)).toContain(reqKey);
    }
    for (const k of Object.keys(payload)) {
      expect(ruleFields.allowed).toContain(k);
    }
    expect(payload.customerId).toBeUndefined();
    expect(payload.items[0].extra).toBeUndefined();
    expect(payload.details).toEqual({ incoterm: 'CIF', portOfDischarge: 'Jebel Ali', freightUsd: 800 });
  });

  it('10b. Quotation settings payload passes isValidQuotationConfig', () => {
    const ruleFields = extractRuleValidatorFields('isValidQuotationConfig');
    const payload = sanitizeQuotationConfigForFirestore({
      companyNameEn: 'GUANGZHOU LUYIMEI ENGINEERING EQUIPMENT CO., LTD.',
      stampImage: 'data:image/png;base64,AAAA',
      defaultIncoterm: 'FOB',
      defaultDepositPercent: 30,
      defaultValidityDays: 30,
      updatedAt: new Date().toISOString(),
      unknownField: 'dropped'
    });
    for (const reqKey of ruleFields.required) expect(Object.keys(payload)).toContain(reqKey);
    for (const k of Object.keys(payload)) expect(ruleFields.allowed).toContain(k);
    expect(rulesContent).toContain("!(configId in ['billing', 'quotation']) || isActiveStaff()");
  });

  it('11. Inquiry payloads always carry the pool marker assignedStaffId', () => {
    const payload = sanitizeInquiryForFirestore({ id: 'INQ-1', phone: '139', needType: 'x', createdAt: 'now' });
    expect(payload.assignedStaffId).toBe('');
  });
});
