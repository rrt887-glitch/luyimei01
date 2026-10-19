import { toWhatsAppDigits } from '../../config/whatsapp';
import React, { useState } from 'react';
import { AdminLead, CustomerProfile } from '../../types/admin';
import { formatLeadValueUsd, formatDateTime, formatUsd } from '../../utils/format';
import { adminApi } from '../../services/adminApi';
import { buildXlsx, downloadBlob } from '../../utils/xlsx';
import { getStage } from '../../config/leadStages';
import type { Tone } from '../../config/leadStages';
import { Users, Search, MessageCircle, Send, Trash2, Download, X } from 'lucide-react';
import { PageHeader, Chip, EmptyState, Drawer, Modal, Avatar } from './AdminUI';

type CustomerStatus = 'active' | 'vip' | 'frozen';
const CUSTOMER_STATUS: { key: CustomerStatus; label: string; tone: Tone }[] = [
  { key: 'active', label: '正常', tone: 'emerald' },
  { key: 'vip', label: '重点客户', tone: 'amber' },
  { key: 'frozen', label: '已冻结', tone: 'rose' }
];
const statusOf = (key: string) => CUSTOMER_STATUS.find(s => s.key === key) || CUSTOMER_STATUS[0];

interface CustomerViewProps {
  customers: CustomerProfile[];
  /** CRM leads (super-admin view) used to show the leads linked to a customer via `customerId`. */
  leads?: AdminLead[];
  onRefreshCustomers: () => void;
  onShowToast: (msg: string) => void;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  customers,
  leads = [],
  onRefreshCustomers,
  onShowToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const relatedLeads = selectedCustomer ? leads.filter(l => l.customerId === selectedCustomer.id) : [];

  // Batch management state
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [customerToDelete, setCustomerToDelete] = useState<CustomerProfile | null>(null);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'all' | CustomerStatus>('all');

  const filteredCustomers = customers.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
    );
  });

  const handleStatusChange = async (customerId: string, status: 'active' | 'vip' | 'frozen') => {
    try {
      await adminApi.updateCustomerStatus(customerId, status);
      onRefreshCustomers();
      if (selectedCustomer && selectedCustomer.id === customerId) {
        setSelectedCustomer({ ...selectedCustomer, status });
      }
      onShowToast(`客户状态已改为「${statusOf(status).label}」`);
    } catch (err) {
      onShowToast((err as Error).message || '更新客户状态失败，请检查网络或权限');
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedCustomerIds.size === filteredCustomers.length && filteredCustomers.length > 0) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const handleToggleCustomer = (id: string) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchStatusChange = async (status: 'active' | 'vip' | 'frozen') => {
    const ids = Array.from(selectedCustomerIds);
    if (ids.length === 0) return;
    try {
      await adminApi.batchUpdateCustomersStatus(ids, status);
      onRefreshCustomers();
      onShowToast(`已将 ${ids.length} 位客户改为「${statusOf(status).label}」`);
    } catch (err) {
      onShowToast((err as Error).message || '批量更新客户状态失败');
    }
  };

  const handleBatchDeleteConfirm = async () => {
    const ids = Array.from(selectedCustomerIds);
    if (ids.length === 0) return;
    try {
      await adminApi.batchDeleteCustomers(ids);
      setSelectedCustomerIds(new Set());
      setIsConfirmingBatchDelete(false);
      onRefreshCustomers();
      onShowToast(`已删除 ${ids.length} 位客户`);
    } catch (err) {
      onShowToast((err as Error).message || '批量删除客户档案失败');
    }
  };

  const handleSingleDeleteConfirm = async () => {
    if (!customerToDelete) return;
    try {
      await adminApi.deleteCustomer(customerToDelete.id);
      setSelectedCustomerIds(prev => {
        const next = new Set(prev);
        next.delete(customerToDelete.id);
        return next;
      });
      setCustomerToDelete(null);
      onRefreshCustomers();
      onShowToast(`已删除客户：${customerToDelete.name}`);
    } catch (err) {
      onShowToast((err as Error).message || '删除客户档案失败');
    }
  };

  const handleExportSelectedCsv = () => {
    const selectedList = customers.filter(c => selectedCustomerIds.has(c.id));
    if (selectedList.length === 0) return;
    const label = (st: string) => ({ active: '正常', vip: '重点客户', frozen: '已冻结' } as Record<string, string>)[st] || st;
    const filename = `LYM_customers_${selectedList.length}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadBlob(
      buildXlsx([
        {
          name: '客户档案',
          widths: [26, 16, 24, 26, 20, 14, 16, 14, 10, 12],
          rows: [
            ['客户编号', '客户姓名', '所属企业', '电子邮箱', '联系电话', '国家/地区', '来源渠道', '累计报价(USD)', '状态', '注册时间'],
            ...selectedList.map(c => [
              c.id,
              c.name,
              c.company,
              c.email,
              c.phone,
              c.country,
              c.source || '官网注册客户',
              c.totalQuotationUsd || 0,
              label(c.status),
              c.registeredAt || c.lastActiveAt
            ])
          ]
        }
      ]),
      filename
    );
    adminApi.addAuditLog('导出客户档案', filename, `导出 ${selectedList.length} 位客户：${selectedList.slice(0, 20).map(c => c.company || c.name).join('、')}${selectedList.length > 20 ? ' 等' : ''}`);
    onShowToast(`已导出 ${selectedList.length} 位客户`);
  };

  const getWhatsAppUrl = (phone: string, name: string) => {
    const clean = toWhatsAppDigits(phone);
    return `https://wa.me/${clean}?text=${encodeURIComponent(
      `Hello ${name}, this is Luyimei (LYM) Road Pavement Engineering. Thank you for your interest.`
    )}`;
  };

  const getTelegramUrl = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    return `https://t.me/+${clean}`;
  };

  const isAllSelected = selectedCustomerIds.size > 0 && selectedCustomerIds.size === filteredCustomers.length;
  const totalQuoted = customers.reduce((sum, c) => sum + (c.totalQuotationUsd || 0), 0);
  const hasPhone = (phone: string) => phone.replace(/[^0-9]/g, '').length >= 6;

  return (
    <div className="adm-page">
      <PageHeader
        title="客户档案"
        description="官网询价和买家注册会自动建档。累计报价由服务器在开具报价单时累加。"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <div className="panel p-4">
          <div className="stat-label">客户总数</div>
          <div className="stat-value">{customers.length}</div>
        </div>
        <div className="panel p-4">
          <div className="stat-label">重点客户</div>
          <div className="stat-value">{customers.filter(c => c.status === 'vip').length}</div>
        </div>
        <div className="panel p-4">
          <div className="stat-label">已冻结</div>
          <div className="stat-value">{customers.filter(c => c.status === 'frozen').length}</div>
        </div>
        <div className="panel p-4">
          <div className="stat-label">累计报价（USD）</div>
          <div className="stat-value">{formatUsd(totalQuoted)}</div>
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 pt-3 sm:px-5">
          <div className="tabs-underline !border-0 -mb-px" role="tablist" aria-label="按状态筛选">
            <button role="tab" aria-selected={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              全部 <span className="count">{customers.length}</span>
            </button>
            {CUSTOMER_STATUS.map(st => (
              <button key={st.key} role="tab" aria-selected={statusFilter === st.key} onClick={() => setStatusFilter(st.key)}>
                {st.label} <span className="count">{customers.filter(c => c.status === st.key).length}</span>
              </button>
            ))}
          </div>
          <label className="relative md:w-80 pb-3 md:pb-0">
            <span className="sr-only">搜索客户</span>
            <Search className="absolute start-3 top-[18px] md:top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索姓名、公司、国家或邮箱"
              className="field field-sm ps-9"
            />
          </label>
        </div>

        <div className="relative overflow-x-auto border-t border-[#e6ecf0] mt-3">
          {filteredCustomers.length === 0 ? (
            <EmptyState icon={<Users className="w-5 h-5" />} title="没有符合条件的客户" hint="新的官网询价会自动在这里建档。" />
          ) : (
            <table className="tbl min-w-[900px]">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" className="adm-check" checked={isAllSelected} onChange={handleToggleSelectAll} aria-label="全选" />
                  </th>
                  <th>客户</th>
                  <th>公司与地区</th>
                  <th>来源</th>
                  <th className="text-end">询价</th>
                  <th className="text-end">累计报价</th>
                  <th>状态</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(customer => {
                  const isSelected = selectedCustomerIds.has(customer.id);
                  return (
                    <tr key={customer.id} data-selected={isSelected}>
                      <td>
                        <input
                          type="checkbox"
                          className="adm-check"
                          checked={isSelected}
                          onChange={() => handleToggleCustomer(customer.id)}
                          aria-label={`选择 ${customer.name}`}
                        />
                      </td>
                      <td>
                        <button type="button" onClick={() => setSelectedCustomer(customer)} className="flex items-center gap-3 text-start group">
                          <Avatar name={customer.name} size={34} />
                          <span className="min-w-0">
                            <span className="block font-semibold text-night group-hover:text-sky-deep truncate max-w-[14rem]">{customer.name}</span>
                            <span className="block font-sign text-xs text-slate-400 truncate max-w-[14rem]">{customer.email || customer.phone}</span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <div className="text-night truncate max-w-[14rem]">{customer.company || '—'}</div>
                        <div className="text-xs text-slate-500">{customer.country}</div>
                      </td>
                      <td className="text-[13px] text-slate-600 whitespace-nowrap">{customer.source || '官网注册'}</td>
                      <td className="text-end font-sign">{customer.inquiryCount ?? 0}</td>
                      <td className="text-end font-sign font-semibold">{formatUsd(customer.totalQuotationUsd || 0)}</td>
                      <td>
                        <select
                          value={customer.status}
                          onChange={e => handleStatusChange(customer.id, e.target.value as CustomerStatus)}
                          className="field field-sm !min-h-8 w-[7.5rem]"
                          aria-label="客户状态"
                        >
                          {CUSTOMER_STATUS.map(st => (
                            <option key={st.key} value={st.key}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-0.5">
                          {hasPhone(customer.phone) && (
                            <a
                              href={getWhatsAppUrl(customer.phone, customer.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="icon-btn !text-emerald-600 hover:!bg-emerald-50"
                              aria-label="WhatsApp"
                              title="WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                          <button onClick={() => setCustomerToDelete(customer)} className="icon-btn danger" aria-label="删除客户" title="删除客户">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Floating batch bar */}
      {selectedCustomerIds.size > 0 && (
        <div className="batch-bar fixed bottom-5 left-1/2 lg:left-[calc(50%+116px)] z-40 w-[calc(100%-2rem)] max-w-[640px] flex flex-wrap items-center gap-2 rounded-xl bg-night text-white px-4 py-3 shadow-2xl">
          <span className="text-sm font-semibold me-1">
            已选 <span className="font-sign text-sky">{selectedCustomerIds.size}</span> 位
          </span>
          <select
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                handleBatchStatusChange(e.target.value as CustomerStatus);
                e.target.value = '';
              }
            }}
            className="field field-sm w-auto !bg-white/10 !border-white/15 !text-white"
            aria-label="批量修改状态"
          >
            <option value="" disabled>
              改状态
            </option>
            {CUSTOMER_STATUS.map(st => (
              <option key={st.key} value={st.key} className="text-night">
                {st.label}
              </option>
            ))}
          </select>
          <button onClick={handleExportSelectedCsv} className="btn btn-sm text-white hover:bg-white/10">
            <Download className="w-4 h-4" />
            导出
          </button>
          <button onClick={() => setIsConfirmingBatchDelete(true)} className="btn btn-sm text-rose-200 hover:bg-rose-500/20">
            <Trash2 className="w-4 h-4" />
            删除
          </button>
          <button onClick={() => setSelectedCustomerIds(new Set())} className="icon-btn ms-auto !text-white/70 hover:!bg-white/10" aria-label="取消选择">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Customer drawer */}
      <Drawer
        open={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        title={selectedCustomer?.name}
        description={
          selectedCustomer && (
            <span className="flex flex-wrap items-center gap-2">
              <Chip tone={statusOf(selectedCustomer.status).tone}>{statusOf(selectedCustomer.status).label}</Chip>
              <span>
                {selectedCustomer.company}
                {selectedCustomer.country ? `，${selectedCustomer.country}` : ''}
              </span>
            </span>
          )
        }
      >
        {selectedCustomer && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-concrete p-3.5">
                <div className="stat-label">询价次数</div>
                <div className="stat-value !text-2xl">{selectedCustomer.inquiryCount ?? 0}</div>
              </div>
              <div className="rounded-lg bg-concrete p-3.5">
                <div className="stat-label">累计报价（USD）</div>
                <div className="stat-value !text-2xl">{formatUsd(selectedCustomer.totalQuotationUsd || 0)}</div>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-y-3 text-sm">
              <dt className="text-slate-500">电话</dt>
              <dd className="font-sign text-night break-all">{selectedCustomer.phone || '—'}</dd>
              <dt className="text-slate-500">邮箱</dt>
              <dd className="font-sign text-night break-all">{selectedCustomer.email || '—'}</dd>
              <dt className="text-slate-500">来源</dt>
              <dd className="text-night">{selectedCustomer.source || '官网注册'}</dd>
              <dt className="text-slate-500">建档时间</dt>
              <dd className="font-sign text-night">{formatDateTime(selectedCustomer.registeredAt || selectedCustomer.lastActiveAt, false)}</dd>
            </dl>

            {hasPhone(selectedCustomer.phone) && (
              <div className="mt-5 flex gap-2">
                <a href={getWhatsAppUrl(selectedCustomer.phone, selectedCustomer.name)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline flex-1">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  WhatsApp
                </a>
                <a href={getTelegramUrl(selectedCustomer.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline flex-1">
                  <Send className="w-4 h-4 text-sky-deep" />
                  Telegram
                </a>
              </div>
            )}

            <h3 className="mt-7 mb-3 text-sm font-semibold text-night">
              关联线索 <span className="font-sign text-slate-400 font-normal">{relatedLeads.length}</span>
            </h3>
            {relatedLeads.length === 0 ? (
              <p className="text-sm text-slate-500">还没有关联的线索。升级前录入的旧线索需要运行迁移脚本才会关联。</p>
            ) : (
              <ul className="divide-y divide-[#edf1f4] rounded-lg border border-line">
                {relatedLeads.map(lead => {
                  const st = getStage(lead.stage);
                  return (
                    <li key={lead.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block text-night truncate">{lead.needType}</span>
                        <span className="block font-sign text-xs text-slate-400">
                          {lead.id}　{lead.assignedStaffName || '公海'}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-sign">{formatLeadValueUsd(lead.estimatedValueUsd)}</span>
                        <Chip tone={st.tone}>{st.label}</Chip>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className="mt-7 mb-3 text-sm font-semibold text-night">客户状态</h3>
            <div className="segmented w-full" role="group" aria-label="客户状态">
              {CUSTOMER_STATUS.map(st => (
                <button
                  key={st.key}
                  className="flex-1"
                  aria-pressed={selectedCustomer.status === st.key}
                  onClick={() => handleStatusChange(selectedCustomer.id, st.key)}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </>
        )}
      </Drawer>

      <Modal
        open={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        size="sm"
        title="删除这位客户？"
        footer={
          <>
            <button type="button" onClick={() => setCustomerToDelete(null)} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button type="button" onClick={handleSingleDeleteConfirm} className="btn btn-sm btn-danger">
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </>
        }
      >
        {customerToDelete && (
          <p className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-night">{customerToDelete.name}</strong>
            {customerToDelete.company ? `（${customerToDelete.company}）` : ''}的档案会被永久删除。关联的线索会保留。
          </p>
        )}
      </Modal>

      <Modal
        open={isConfirmingBatchDelete}
        onClose={() => setIsConfirmingBatchDelete(false)}
        size="sm"
        title={`删除选中的 ${selectedCustomerIds.size} 位客户？`}
        footer={
          <>
            <button type="button" onClick={() => setIsConfirmingBatchDelete(false)} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button type="button" onClick={handleBatchDeleteConfirm} className="btn btn-sm btn-danger">
              <Trash2 className="w-4 h-4" />
              删除 {selectedCustomerIds.size} 位
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">这些客户档案会被永久删除，无法恢复。关联的线索会保留。</p>
      </Modal>
    </div>
  );
};
