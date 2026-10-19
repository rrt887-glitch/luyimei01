import React, { useState, useMemo, useEffect } from 'react';
import { AdminLead, LeadStage, StaffAccount } from '../../types/admin';
import { adminApi } from '../../services/adminApi';
import {
  LeadNotesModal,
  ManualAddLeadModal,
  LeadDeleteConfirmModals
} from './leads/LeadModals';
import { LeadsFilterToolbar } from './leads/LeadsFilterToolbar';
import { LeadsTableView } from './leads/LeadsTableView';
import { ImportLeadsModal } from './leads/ImportLeadsModal';
import { buildExportSheets, buildTemplateSheets, ParsedRow } from './leads/leadsSpreadsheet';
import { buildXlsx, downloadBlob } from '../../utils/xlsx';
import { Plus, Download, Upload } from 'lucide-react';
import { LEAD_STAGES, getStage } from '../../config/leadStages';
import { PageHeader } from './AdminUI';

interface LeadsCrmViewProps {
  leads: AdminLead[];
  staffList: StaffAccount[];
  onRefreshLeads: () => void;
  onShowToast: (msg: string) => void;
  initialOpenLeadId?: string | null;
  onClearInitialOpenLeadId?: () => void;
  onNavigateToQuotationWithLead?: (lead: AdminLead) => void;
}

export const STAGES = LEAD_STAGES;

export const LeadsCrmView: React.FC<LeadsCrmViewProps> = ({
  leads,
  staffList,
  onRefreshLeads,
  onShowToast,
  initialOpenLeadId,
  onClearInitialOpenLeadId,
  onNavigateToQuotationWithLead
}) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterStaffId, setFilterStaffId] = useState<string>('all');

  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadToDelete, setLeadToDelete] = useState<AdminLead | null>(null);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);

  const [activeLeadForNotes, setActiveLeadForNotes] = useState<AdminLead | null>(null);
  const [newNoteText, setNewNoteText] = useState('');

  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNeedType, setNewNeedType] = useState('施工设备');
  const [newLocation, setNewLocation] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newEstValue, setNewEstValue] = useState('');

  const currentStaff = adminApi.getCurrentStaff();
  const isSuperAdmin = currentStaff?.role === 'super_admin';

  // Auto-open LeadNotesModal when navigated from Dashboard pending leads queue
  useEffect(() => {
    if (!initialOpenLeadId) return;
    const matched = leads.find(l => l.id === initialOpenLeadId);
    if (matched) {
      setActiveLeadForNotes(matched);
      onClearInitialOpenLeadId?.();
    }
  }, [initialOpenLeadId, leads, onClearInitialOpenLeadId]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (filterStage !== 'all' && l.stage !== filterStage) return false;
      if (filterStaffId !== 'all') {
        if (filterStaffId === 'unassigned' && l.assignedStaffId) return false;
        if (filterStaffId !== 'unassigned' && l.assignedStaffId !== filterStaffId) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        l.customerName.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q)
      );
    });
  }, [leads, filterStage, filterStaffId, searchQuery]);

  const handleStageChange = async (leadId: string, newStage: LeadStage) => {
    try {
      await adminApi.updateLeadStage(leadId, newStage);
      onRefreshLeads();
      onShowToast(`阶段已改为「${getStage(newStage).label}」`);
    } catch (err) {
      onShowToast(`云端阶段流转失败：${(err as Error).message}`);
    }
  };

  const handleAssignStaff = async (leadId: string, staffId: string) => {
    try {
      await adminApi.assignLeadStaff(leadId, staffId);
      onRefreshLeads();
      onShowToast(staffId ? '负责人已更新' : '已退回公海');
    } catch (err) {
      onShowToast(`云端指派失败：${(err as Error).message}`);
    }
  };

  const handleUpdateEstimatedValue = async (leadId: string, newVal: number) => {
    try {
      const updated = await adminApi.updateLeadEstimatedValue(leadId, newVal);
      onRefreshLeads();
      if (updated && activeLeadForNotes?.id === leadId) {
        setActiveLeadForNotes({ ...updated });
      }
      onShowToast(`估值已更新为 $${newVal.toLocaleString()}`);
    } catch (err) {
      onShowToast(`更新商机估值失败：${(err as Error).message}`);
    }
  };

  const handleCreateQuotationForLead = (lead: AdminLead) => {
    if (onNavigateToQuotationWithLead) {
      onNavigateToQuotationWithLead(lead);
    } else {
      onShowToast(`已为客户 [${lead.customerName}] 预载商机数据，可前往报价单模块一键出具！`);
    }
  };

  const handleSelectIds = (ids: string[], selected: boolean) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  // Selection never keeps leads that a new filter has hidden (so a batch action only touches what is visible).
  useEffect(() => {
    setSelectedLeadIds(prev => {
      const visible = new Set(filteredLeads.map(l => l.id));
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredLeads]);

  const handleBatchStageChange = async (stage: LeadStage) => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;
    try {
      const count = await adminApi.batchUpdateLeadStage(ids, stage);
      onRefreshLeads();
      const stageObj = STAGES.find(s => s.key === stage);
      onShowToast(`已将 ${count} 条线索改为「${stageObj?.label || stage}」`);
    } catch (err) {
      onShowToast(`批量流转云端同步失败：${(err as Error).message}`);
    }
  };

  const handleBatchAssignStaff = async (staffId: string) => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;
    try {
      const count = await adminApi.batchAssignLeads(ids, staffId);
      onRefreshLeads();
      const staff = staffList.find(s => s.id === staffId);
      onShowToast(
        staff
          ? `已批量将 ${count} 条商机派单给业务员：${staff.name}`
          : `已将 ${count} 条商机释放回公海池`
      );
    } catch (err) {
      onShowToast(`批量指派云端同步失败：${(err as Error).message}`);
    }
  };

  const handleBatchDeleteConfirm = async () => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;
    try {
      const count = await adminApi.batchDeleteLeads(ids);
      setSelectedLeadIds(new Set());
      setIsConfirmingBatchDelete(false);
      onRefreshLeads();
      onShowToast(`已删除 ${count} 条线索`);
    } catch (err) {
      onShowToast(`批量删除失败：${(err as Error).message}`);
    }
  };

  const handleSingleDeleteConfirm = async () => {
    if (!leadToDelete) return;
    const targetName = leadToDelete.customerName;
    const targetId = leadToDelete.id;
    try {
      await adminApi.deleteLead(targetId);
      setSelectedLeadIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      if (activeLeadForNotes?.id === targetId) {
        setActiveLeadForNotes(null);
      }
      setLeadToDelete(null);
      onRefreshLeads();
      onShowToast(`已删除线索：${targetName}（${targetId}）`);
    } catch (err) {
      onShowToast(`删除商机失败：${(err as Error).message}`);
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  const describeFilters = () =>
    [
      filterStage !== 'all' ? `阶段：${getStage(filterStage).label}` : '',
      filterStaffId === 'unassigned' ? '负责人：公海' : filterStaffId !== 'all' ? `负责人：${staffList.find(s => s.id === filterStaffId)?.name || filterStaffId}` : '',
      searchQuery.trim() ? `搜索：${searchQuery.trim()}` : ''
    ]
      .filter(Boolean)
      .join('，') || '全部';

  const exportLeads = (list: AdminLead[], filename: string, scope: string) => {
    if (list.length === 0) return;
    downloadBlob(buildXlsx(buildExportSheets(list)), filename);
    adminApi.addAuditLog('导出商机线索', filename, `${scope}，共 ${list.length} 条（筛选：${describeFilters()}）`);
    onShowToast(`已导出 ${list.length} 条线索`);
  };

  const handleBatchExportSelected = () => {
    const selectedList = filteredLeads.filter(l => selectedLeadIds.has(l.id));
    exportLeads(selectedList, `LYM_leads_selected_${selectedList.length}_${stamp()}.xlsx`, '导出选中的线索');
  };

  const handleExport = () => {
    exportLeads(filteredLeads, `LYM_leads_${stamp()}.xlsx`, filteredLeads.length === leads.length ? '导出全部线索' : '导出筛选结果');
  };

  const handleDownloadTemplate = () => {
    downloadBlob(buildXlsx(buildTemplateSheets(staffList)), 'LYM_leads_import_template.xlsx');
    adminApi.addAuditLog('下载导入模板', 'LYM_leads_import_template.xlsx', '下载商机线索 Excel 导入模板');
  };

  const handleImport = async (rows: ParsedRow[], fileName: string, onProgress: (done: number) => void) => {
    try {
      const count = await adminApi.importLeads(
        rows.map(r => r.item),
        fileName,
        onProgress
      );
      onRefreshLeads();
      onShowToast(`已导入 ${count} 条线索`);
    } catch (err) {
      onShowToast(`导入失败：${(err as Error).message}。已经写入的批次会保留，请刷新后检查再导入剩余部分。`);
      throw err;
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLeadForNotes || !newNoteText.trim()) return;
    try {
      const updated = await adminApi.addLeadFollowUpNote(activeLeadForNotes.id, newNoteText.trim());
      setNewNoteText('');
      onRefreshLeads();
      if (updated) {
        setActiveLeadForNotes({ ...updated });
      }
      onShowToast('跟进记录已添加');
    } catch (err) {
      onShowToast(`保存跟进纪要失败：${(err as Error).message}`);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newPhone.trim()) return;
    try {
      await adminApi.createManualLead({
        customerName: newCustName.trim(),
        phone: newPhone.trim(),
        needType: newNeedType,
        location: newLocation.trim() || '海外市场',
        message: newMessage.trim(),
        // Empty / 0 = "待估值" (never a made-up default amount)
        estimatedValueUsd: parseFloat(newEstValue) > 0 ? parseFloat(newEstValue) : undefined,
        // Sales reps keep their own manual leads; super admins put them into the pool for dispatch.
        assignedStaffId: currentStaff?.role === 'sales_rep' ? currentStaff.id : undefined
      });
      setNewEstValue('');
      setIsAddLeadOpen(false);
      setNewCustName('');
      setNewPhone('');
      setNewLocation('');
      setNewMessage('');
      onRefreshLeads();
      onShowToast('商机已录入');
    } catch (err) {
      onShowToast(`录入商机失败：${(err as Error).message}`);
    }
  };

  const totalPipelineUsd = useMemo(
    () =>
      filteredLeads
        .filter(item => item.stage !== 'lost')
        .reduce((sum, item) => sum + (item.estimatedValueUsd || 0), 0),
    [filteredLeads]
  );


  return (
    <div className="adm-page">
      <PageHeader
        title="商机线索"
        description="官网询价会自动进入公海。在这里指派负责人、记录跟进、开报价单。"
        actions={
          <>
            <button onClick={() => setIsImportOpen(true)} className="btn btn-sm btn-outline">
              <Upload className="w-4 h-4" />
              导入
            </button>
            <button
              onClick={handleExport}
              className="btn btn-sm btn-outline"
              disabled={filteredLeads.length === 0}
              title="导出当前筛选结果为 Excel"
            >
              <Download className="w-4 h-4" />
              导出{filteredLeads.length !== leads.length ? `筛选结果（${filteredLeads.length}）` : ''}
            </button>
            <button onClick={() => setIsAddLeadOpen(true)} className="btn btn-sm btn-primary">
              <Plus className="w-4 h-4" />
              录入商机
            </button>
          </>
        }
      />

      <LeadsFilterToolbar
        leads={leads}
        filteredCount={filteredLeads.length}
        pipelineUsd={totalPipelineUsd}
        stages={STAGES}
        filterStage={filterStage}
        onChangeStageFilter={setFilterStage}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        filterStaffId={filterStaffId}
        onChangeStaffFilter={setFilterStaffId}
        staffList={staffList}
        isSuperAdmin={isSuperAdmin}
        selectedCount={selectedLeadIds.size}
        onClearSelection={() => setSelectedLeadIds(new Set())}
        onBatchStageChange={handleBatchStageChange}
        onBatchAssignStaff={handleBatchAssignStaff}
        onBatchExportSelected={handleBatchExportSelected}
        onRequestBatchDelete={() => setIsConfirmingBatchDelete(true)}
      />

      <div className="mt-4">
        <LeadsTableView
          leads={filteredLeads}
          stages={STAGES}
          staffList={staffList}
          isSuperAdmin={isSuperAdmin}
          currentStaff={currentStaff}
          selectedLeadIds={selectedLeadIds}
          onSelectIds={handleSelectIds}
          onStageChange={handleStageChange}
          onAssignStaff={handleAssignStaff}
          onUpdateEstimatedValue={handleUpdateEstimatedValue}
          onCreateQuotationForLead={handleCreateQuotationForLead}
          onOpenNotes={setActiveLeadForNotes}
          onRequestDelete={setLeadToDelete}
          resetKey={`${filterStage}|${filterStaffId}|${searchQuery}`}
        />
      </div>

      <ImportLeadsModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        leads={leads}
        staffList={staffList}
        currentStaff={currentStaff}
        onDownloadTemplate={handleDownloadTemplate}
        onImport={handleImport}
      />

      <LeadNotesModal
        activeLead={activeLeadForNotes}
        currentStaffName={currentStaff?.name || '销售代表'}
        newNoteText={newNoteText}
        onChangeNoteText={setNewNoteText}
        onAddNote={handleAddNote}
        onUpdateEstimatedValue={handleUpdateEstimatedValue}
        onCreateQuotationForLead={handleCreateQuotationForLead}
        onClose={() => setActiveLeadForNotes(null)}
      />

      <ManualAddLeadModal
        isOpen={isAddLeadOpen}
        newCustName={newCustName}
        setNewCustName={setNewCustName}
        newPhone={newPhone}
        setNewPhone={setNewPhone}
        newNeedType={newNeedType}
        setNewNeedType={setNewNeedType}
        newLocation={newLocation}
        setNewLocation={setNewLocation}
        newEstValue={newEstValue}
        setNewEstValue={setNewEstValue}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSubmit={handleCreateLead}
        onClose={() => setIsAddLeadOpen(false)}
      />

      <LeadDeleteConfirmModals
        leadToDelete={leadToDelete}
        onCancelSingleDelete={() => setLeadToDelete(null)}
        onConfirmSingleDelete={handleSingleDeleteConfirm}
        isConfirmingBatchDelete={isConfirmingBatchDelete}
        selectedCount={selectedLeadIds.size}
        onCancelBatchDelete={() => setIsConfirmingBatchDelete(false)}
        onConfirmBatchDelete={handleBatchDeleteConfirm}
      />
    </div>
  );
};
