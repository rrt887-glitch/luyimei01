import React from 'react';
import { AdminLead, LeadStage, StaffAccount } from '../../../types/admin';
import { Search, Download, Trash2, X } from 'lucide-react';
import { STAGE_BAR_COLORS } from '../../../config/leadStages';
import type { StageConfig } from '../../../config/leadStages';

export type { StageConfig };

interface LeadsFilterToolbarProps {
  leads: AdminLead[];
  filteredCount: number;
  pipelineUsd?: number;
  stages: StageConfig[];
  filterStage: string;
  onChangeStageFilter: (stage: string) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  filterStaffId: string;
  onChangeStaffFilter: (staffId: string) => void;
  staffList: StaffAccount[];
  isSuperAdmin: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  onBatchStageChange: (stage: LeadStage) => void;
  onBatchAssignStaff: (staffId: string) => void;
  onBatchExportSelected: () => void;
  onRequestBatchDelete: () => void;
}

export const LeadsFilterToolbar: React.FC<LeadsFilterToolbarProps> = ({
  leads,
  filteredCount,
  pipelineUsd = 0,
  stages,
  filterStage,
  onChangeStageFilter,
  searchQuery,
  onChangeSearchQuery,
  filterStaffId,
  onChangeStaffFilter,
  staffList,
  isSuperAdmin,
  selectedCount,
  onClearSelection,
  onBatchStageChange,
  onBatchAssignStaff,
  onBatchExportSelected,
  onRequestBatchDelete
}) => {
  return (
    <>
      {/* Stage tabs */}
      <div className="tabs-underline" role="tablist" aria-label="按阶段筛选">
        <button role="tab" aria-selected={filterStage === 'all'} onClick={() => onChangeStageFilter('all')}>
          全部 <span className="count">{leads.length}</span>
        </button>
        {stages.map(st => {
          const count = leads.filter(l => l.stage === st.key).length;
          return (
            <button key={st.key} role="tab" aria-selected={filterStage === st.key} onClick={() => onChangeStageFilter(st.key)}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_BAR_COLORS[st.key] }} aria-hidden="true" />
              {st.label}
              <span className="count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search & filters */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1 max-w-xl">
          <span className="sr-only">搜索线索</span>
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => onChangeSearchQuery(e.target.value)}
            placeholder="搜索客户、编号、电话或询价内容"
            className="field field-sm ps-9"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          {isSuperAdmin && (
            <select
              value={filterStaffId}
              onChange={e => onChangeStaffFilter(e.target.value)}
              className="field field-sm w-auto min-w-[9rem]"
              aria-label="按负责人筛选"
            >
              <option value="all">全部负责人</option>
              <option value="unassigned">公海（未分配）</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <span className="text-sm text-slate-500">
            <span className="font-sign font-semibold text-night">{filteredCount}</span> 条
            {pipelineUsd > 0 && (
              <>
                ，估值 <span className="font-sign font-semibold text-night">${pipelineUsd.toLocaleString()}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Floating batch bar */}
      {selectedCount > 0 && (
        <div
          className="batch-bar fixed bottom-5 left-1/2 lg:left-[calc(50%+116px)] z-40 w-[calc(100%-2rem)] max-w-[760px] flex flex-wrap items-center gap-2 rounded-xl bg-night text-white px-4 py-3 shadow-2xl"
          role="region"
          aria-label="批量操作"
        >
          <span className="text-sm font-semibold me-1">
            已选 <span className="font-sign text-sky">{selectedCount}</span> 条
          </span>
          <select
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                onBatchStageChange(e.target.value as LeadStage);
                e.target.value = '';
              }
            }}
            className="field field-sm w-auto !bg-white/10 !border-white/15 !text-white"
            aria-label="批量修改阶段"
          >
            <option value="" disabled>
              改阶段
            </option>
            {stages.map(s => (
              <option key={s.key} value={s.key} className="text-night">
                {s.label}
              </option>
            ))}
          </select>
          {isSuperAdmin && (
            <select
              defaultValue=""
              onChange={e => {
                if (e.target.value !== '') {
                  onBatchAssignStaff(e.target.value === '__UNASSIGN__' ? '' : e.target.value);
                  e.target.value = '';
                }
              }}
              className="field field-sm w-auto !bg-white/10 !border-white/15 !text-white"
              aria-label="批量指派"
            >
              <option value="" disabled>
                指派给
              </option>
              <option value="__UNASSIGN__" className="text-night">
                退回公海
              </option>
              {staffList.map(s => (
                <option key={s.id} value={s.id} className="text-night">
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={onBatchExportSelected} className="btn btn-sm text-white hover:bg-white/10">
            <Download className="w-4 h-4" />
            导出 Excel
          </button>
          {isSuperAdmin && (
            <button onClick={onRequestBatchDelete} className="btn btn-sm text-rose-200 hover:bg-rose-500/20">
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          )}
          <button onClick={onClearSelection} className="icon-btn ms-auto !text-white/70 hover:!bg-white/10" aria-label="取消选择">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
