import { AdminLead, CustomerProfile, QuotationSheet } from '../../types/admin';
import { toCents } from '../../utils/format';

/**
 * A sales rep's 客户档案: built from the leads assigned to them (the customer archive itself is
 * super-admin only in firestore.rules). One row per customer: the lead's linked customer id when
 * the server set it, else the contact. 累计报价 = the rep's own quotations for those leads.
 */
export function customersFromOwnLeads(leads: AdminLead[], quotations: QuotationSheet[], myId: string): CustomerProfile[] {
  const mine = leads.filter(l => l.assignedStaffId === myId);
  const byKey = new Map<string, { profile: CustomerProfile; leadIds: Set<string> }>();
  for (const l of mine) {
    const contact = (l.phone || '').trim();
    const key = l.customerId || `lead-contact:${contact.toLowerCase() || l.id}`;
    const isEmail = contact.includes('@');
    const existing = byKey.get(key);
    const created = (l.createdAt || '').slice(0, 10);
    const active = (l.updatedAt || l.createdAt || '').slice(0, 10);
    if (existing) {
      existing.leadIds.add(l.id);
      existing.profile.inquiryCount += 1;
      if (!existing.profile.company && l.company) existing.profile.company = l.company;
      if (created && (!existing.profile.registeredAt || created < existing.profile.registeredAt)) existing.profile.registeredAt = created;
      if (active > existing.profile.lastActiveAt) existing.profile.lastActiveAt = active;
      continue;
    }
    byKey.set(key, {
      leadIds: new Set([l.id]),
      profile: {
        id: l.customerId || key,
        name: l.customerName || '未命名客户',
        company: l.company || '',
        email: isEmail ? contact : l.buyerEmail || '',
        phone: isEmail ? '' : contact,
        country: l.location || '',
        status: 'active',
        savedProductIds: [],
        inquiryCount: 1,
        totalQuotationUsd: 0,
        source: '我名下的线索',
        registeredAt: created,
        lastActiveAt: active
      }
    });
  }
  const out: CustomerProfile[] = [];
  for (const { profile, leadIds } of byKey.values()) {
    const total = quotations
      .filter(q => q.leadId && leadIds.has(q.leadId) && (!q.createdByUid || q.createdByUid === myId))
      .reduce((sum, q) => sum + (Number(q.totalAmountUsd) || 0), 0);
    out.push({ ...profile, totalQuotationUsd: toCents(total) });
  }
  return out.sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
}
