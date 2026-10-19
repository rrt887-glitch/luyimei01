export type LeadStage = 'new' | 'following' | 'quoted' | 'negotiating' | 'won' | 'lost';

export interface LeadFollowUpNote {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface AdminLead {
  id: string;
  customerName: string;
  company?: string;
  phone: string;
  needType: string;
  location: string;
  message: string;
  /** undefined = not valued yet (never counted in pipeline totals). */
  estimatedValueUsd?: number;
  stage: LeadStage;
  /** undefined in the UI model = public pool ('' in Firestore). */
  assignedStaffId?: string;
  assignedStaffName?: string;
  buyerUid?: string;
  buyerEmail?: string;
  /** Linked CRM customer archive, set server-side by the onInquiryCreated Cloud Function. */
  customerId?: string;
  createdAt: string;
  updatedAt: string;
  notes: LeadFollowUpNote[];
  followUpNotes?: LeadFollowUpNote[];
}

export interface CustomerProfile {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  status: 'active' | 'vip' | 'frozen';
  savedProductIds: string[];
  inquiryCount: number;
  lastActiveAt: string;
  totalQuotationUsd: number;
  source?: string; // 客户来源: '官网注册客户' | '官网询价自动建档' | '后台手工录入'
  registeredAt?: string;
}

export type StaffRole = 'super_admin' | 'sales_rep';

export interface StaffAccount {
  id: string;
  uid?: string;
  name: string;
  phone: string;
  email: string;
  role: StaffRole;
  status: 'active' | 'suspended';
  lastLoginAt: string;
  assignedLeadsCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuotationItem {
  productId: string;
  productName: string;
  model: string;
  unitPriceUsd: number;
  quantity: number;
  unit: string;
  amountUsd: number;
}

export interface QuotationSheet {
  id: string;
  quotationNumber: string;
  clientName: string;
  clientCompany: string;
  clientCountry: string;
  date: string;
  validUntil: string;
  portOfLoading: string;
  paymentTerms: string;
  currency: string;
  items: QuotationItem[];
  totalAmountUsd: number;
  notes: string;
  createdBy?: string;
  createdByUid?: string;
  createdAt?: string;
  leadId?: string;
  customerId?: string;
  lang?: 'en' | 'bilingual' | 'ar' | 'ru';
}

export interface AuditLogItem {
  id: string;
  operator: string;
  operatorRole: StaffRole;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}
