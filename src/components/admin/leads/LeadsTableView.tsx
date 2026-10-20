import React, { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime } from '../../../utils/format';
import { AdminLead, LeadStage, StaffAccount } from '../../../types/admin';
import type { StageConfig } from '../../../config/leadStages';
import { STAGE_BAR_COLORS } from '../../../config/leadStages';
import { MessageSquare, Trash2, FileText, Inbox, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '../AdminUI';
import { LeadValueEditor } from './LeadValueEditor';

type SortKey = 'createdAt' | 'lastFollowUp' | 'customerName' | 'value' | 'stage' | 'owner';
type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [20, 50, 100] as const;
const PAGE_SIZE_KEY = 'lym_leads_page_size';

interface LeadsTableViewProps {
  leads: AdminLead[];
  stages: StageConfig[];
  staffList: StaffAccount[];
  isSuperAdmin: boolean;
  currentStaff?: StaffAccount | null;
  selectedLeadIds: Set<string>;
  onSelectIds: (ids: string[], selected: boolean) => void;
  onStageChange: (leadId: string, stage: LeadStage) => void;
  onAssignStaff: (leadId: string, staffId: string) => void;
  onUpdateEstimatedValue?: (leadId: string, newVal: number) => Promise<void>;
  onCreateQuotationForLead?: (lead: AdminLead) => void;
  onOpenNotes: (lead: AdminLead) => void;
  onRequestDelete: (lead: AdminLead) => void;
  /** Changes whenever the filters change, to go back to page 1. */
  resetKey: string;
}

const lastNoteAt = (l: AdminLead): string =>
  (l.notes || []).reduce((max, n) => (n.createdAt > max ? n.createdAt : max), '');

/**
 * The lead list as a table, built for hundreds of rows: sortable columns, pages of 20/50/100,
 * and selection that can cover the current page or every lead that matches the filters.
 */
export const LeadsTableView: React.FC<LeadsTableViewProps> = ({
  leads,
  stages,
  staffList,
  isSuperAdmin,
  currentStaff,
  selectedLeadIds,
  onSelectIds,
  onStageChange,
  onAssignStaff,
  onUpdateEstimatedValue,
  onCreateQuotationForLead,
  onOpenNotes,
  onRequestDelete,
  resetKey
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
      return (PAGE_SIZES as readonly number[]).includes(saved) ? saved : 50;
    } catch {
      return 50;
    }
  });

  useEffect(() => setPage(0), [resetKey, sortKey, sortDir, pageSize]);

  const stageOrder = useMemo(() => new Map(stages.map((s, i) => [s.key, i])), [stages]);
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const value = (l: AdminLead): string | number => {
      switch (sortKey) {
        case 'customerName':
          return l.customerName.toLowerCase();
        case 'value':
          return l.estimatedValueUsd ?? -1;
        case 'stage':
          return stageOrder.get(l.stage) ?? 0;
        case 'owner':
          return l.assignedStaffName || '';
        case 'lastFollowUp':
          return lastNoteAt(l);
        default:
          return l.createdAt;
      }
    };
    return [...leads].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [leads, sortKey, sortDir, stageOrder]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageIds = rows.map(l => l.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selectedLeadIds.has(id));
  const pageSomeSelected = !pageAllSelected && pageIds.some(id => selectedLeadIds.has(id));
  const everythingSelected = leads.length > 0 && leads.every(l => selectedLeadIds.has(l.id));

  if (leads.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={<Inbox className="w-5 h-5" />} title="没有符合条件的线索" hint="换个阶段或清空搜索试试。" />
      </div>
    );
  }

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'customerName' || key === 'owner' || key === 'stage' ? 'asc' : 'desc');
    }
  };

  const SortHeader: React.FC<{ k: SortKey; children: React.ReactNode; className?: string }> = ({ k, children, className = '' }) => (
    <th className={className} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 hover:text-night ${className.includes('text-end') ? 'flex-row-reverse' : ''}`}>
        {children}
        {sortKey === k ? (
          sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-300" />
        )}
      </button>
    </th>
  );

  const first = safePage * pageSize + 1;
  const last = Math.min(sorted.length, (safePage + 1) * pageSize);

  return (
    <div className="panel relative">
      {pageAllSelected && leads.length > rows.length && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-[#e6ecf0] bg-sky-wash/60 px-4 py-2 text-sm text-night">
          {everythingSelected ? (
            <>
              已选择全部 <strong className="font-sign">{leads.length}</strong> 条线索。
              <button type="button" onClick={() => onSelectIds(leads.map(l => l.id), false)} className="font-semibold text-sky-deep hover:underline">
                清除选择
              </button>
            </>
          ) : (
            <>
              已选择本页 <strong className="font-sign">{rows.length}</strong> 条。
              <button type="button" onClick={() => onSelectIds(leads.map(l => l.id), true)} className="font-semibold text-sky-deep hover:underline">
                选择全部 {leads.length} 条符合条件的线索
              </button>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="tbl min-w-[1120px]">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  className="adm-check"
                  checked={pageAllSelected}
                  ref={el => {
                    if (el) el.indeterminate = pageSomeSelected;
                  }}
                  onChange={() => onSelectIds(pageIds, !pageAllSelected)}
                  aria-label="选择本页"
                />
              </th>
              <SortHeader k="customerName">客户</SortHeader>
              <th>联系方式</th>
              <th>需求 / 地点</th>
              <SortHeader k="value" className="text-end">
                估值
              </SortHeader>
              <SortHeader k="stage">阶段</SortHeader>
              <SortHeader k="owner">负责人</SortHeader>
              <SortHeader k="lastFollowUp">最近跟进</SortHeader>
              <SortHeader k="createdAt">提交</SortHeader>
              <th>
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(lead => {
              const isSelected = selectedLeadIds.has(lead.id);
              const ownerLocked = !isSuperAdmin && Boolean(lead.assignedStaffId && lead.assignedStaffId !== currentStaff?.id);
              const lastNote = lastNoteAt(lead);
              return (
                <tr key={lead.id} data-selected={isSelected}>
                  <td>
                    <input
                      type="checkbox"
                      className="adm-check"
                      checked={isSelected}
                      onChange={() => onSelectIds([lead.id], !isSelected)}
                      aria-label={`选择 ${lead.customerName}`}
                    />
                  </td>
                  <td className="max-w-[14rem]">
                    <button type="button" onClick={() => onOpenNotes(lead)} className="font-semibold text-night hover:text-sky-deep truncate block max-w-full text-start">
                      {lead.customerName}
                    </button>
                    <div className="text-xs text-slate-500 truncate">{lead.company || <span className="font-sign text-slate-400">{lead.id}</span>}</div>
                  </td>
                  <td className="font-sign text-[13px] text-slate-700 whitespace-nowrap max-w-[12rem] truncate" title={lead.phone}>
                    {lead.phone}
                  </td>
                  <td className="max-w-[14rem]">
                    <div className="text-night truncate">{lead.needType}</div>
                    <div className="text-xs text-slate-500 truncate" title={lead.message}>
                      {lead.location || lead.message}
                    </div>
                  </td>
                  <td className="text-end whitespace-nowrap">
                    <LeadValueEditor
                      value={lead.estimatedValueUsd}
                      onSave={onUpdateEstimatedValue ? v => onUpdateEstimatedValue(lead.id, v) : undefined}
                    />
                  </td>
                  <td>
                    <select
                      value={lead.stage}
                      onChange={e => onStageChange(lead.id, e.target.value as LeadStage)}
                      className="field field-sm !min-h-8 w-[7.5rem]"
                      style={{ boxShadow: `inset 3px 0 0 ${STAGE_BAR_COLORS[lead.stage]}` }}
                      aria-label="阶段"
                    >
                      {stages.map(s => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={lead.assignedStaffId || ''}
                      onChange={e => onAssignStaff(lead.id, e.target.value)}
                      disabled={ownerLocked}
                      className="field field-sm !min-h-8 w-[8.5rem] disabled:bg-concrete"
                      aria-label="负责人"
                    >
                      <option value="">公海</option>
                      {(isSuperAdmin ? staffList : staffList.filter(s => s.id === currentStaff?.id || s.id === lead.assignedStaffId))
                        .filter(s => s.status === 'active' || s.id === lead.assignedStaffId)
                        .map(s => (
                          <option key={s.id} value={s.id} disabled={s.status !== 'active'}>
                            {s.status === 'active' ? s.name : `${s.name}（已停用）`}
                          </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-[13px] text-slate-500 whitespace-nowrap" title={lastNote}>
                    {lastNote ? formatRelativeTime(lastNote) : '—'}
                  </td>
                  <td className="text-[13px] text-slate-500 whitespace-nowrap" title={lead.createdAt}>
                    {formatRelativeTime(lead.createdAt)}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      {onCreateQuotationForLead && (
                        <button type="button" onClick={() => onCreateQuotationForLead(lead)} className="icon-btn" aria-label="开报价单" title="开报价单">
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => onOpenNotes(lead)} className="icon-btn" aria-label="跟进记录" title="跟进记录">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && (
                        <button type="button" onClick={() => onRequestDelete(lead)} className="icon-btn danger" aria-label="删除" title="删除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ecf0] px-4 py-3 text-sm text-slate-600">
        <span>
          第 <span className="font-sign text-night">{first}–{last}</span> 条，共 <span className="font-sign text-night">{sorted.length}</span> 条
        </span>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2">
            每页
            <select
              value={pageSize}
              onChange={e => {
                const n = Number(e.target.value);
                setPageSize(n);
                try {
                  localStorage.setItem(PAGE_SIZE_KEY, String(n));
                } catch {
                  // ignore
                }
              }}
              className="field field-sm !min-h-8 w-auto"
              aria-label="每页条数"
            >
              {PAGE_SIZES.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} className="icon-btn border border-line" aria-label="上一页">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-sign px-2 text-night">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="icon-btn border border-line"
              aria-label="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
