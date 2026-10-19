import React, { useState, useEffect } from 'react';
import { AdminLead } from '../../../types/admin';
import { getClientWhatsAppFollowUpUrl } from '../../../config/whatsapp';
import { getStage } from '../../../config/leadStages';
import { formatRelativeTime, formatDateTime } from '../../../utils/format';
import { MessageCircle, Send, FileText, Check, Trash2 } from 'lucide-react';
import { Drawer, Modal, Chip, FormField } from '../AdminUI';

export interface LeadNotesModalProps {
  activeLead: AdminLead | null;
  currentStaffName: string;
  newNoteText: string;
  onChangeNoteText: (val: string) => void;
  onAddNote: (e: React.FormEvent) => void;
  onUpdateEstimatedValue?: (leadId: string, newVal: number) => Promise<void>;
  onCreateQuotationForLead?: (lead: AdminLead) => void;
  onClose: () => void;
}

/** Follow-up drawer: lead facts, valuation, original request and the note timeline. */
export const LeadNotesModal: React.FC<LeadNotesModalProps> = ({
  activeLead,
  currentStaffName,
  newNoteText,
  onChangeNoteText,
  onAddNote,
  onUpdateEstimatedValue,
  onCreateQuotationForLead,
  onClose
}) => {
  const [estInput, setEstInput] = useState<string>('');
  const [savingEst, setSavingEst] = useState(false);

  useEffect(() => {
    if (activeLead) setEstInput(String(activeLead.estimatedValueUsd || ''));
  }, [activeLead?.id, activeLead?.estimatedValueUsd]);

  if (!activeLead) return null;
  const notesList = [...(activeLead.followUpNotes || [])].reverse();
  const stage = getStage(activeLead.stage);
  const phoneOk = Boolean(activeLead.phone && activeLead.phone.replace(/[^0-9]/g, '').length >= 6);
  const estChanged = Number(estInput || 0) !== (activeLead.estimatedValueUsd || 0);

  const handleSaveValuation = async () => {
    if (!onUpdateEstimatedValue || savingEst) return;
    const parsed = Math.max(0, Math.round(Number(estInput) || 0));
    setSavingEst(true);
    try {
      await onUpdateEstimatedValue(activeLead.id, parsed);
    } finally {
      setSavingEst(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={activeLead.customerName}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tone={stage.tone}>{stage.label}</Chip>
          <span className="font-sign text-slate-400">{activeLead.id}</span>
        </span>
      }
      footer={
        <form onSubmit={onAddNote} className="space-y-2">
          <label htmlFor="lead-note" className="sr-only">
            添加跟进记录
          </label>
          <textarea
            id="lead-note"
            rows={2}
            required
            value={newNoteText}
            onChange={e => onChangeNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }}
            placeholder="记录这次沟通：客户反馈、报价意见、下一步…"
            className="field field-sm resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">以 {currentStaffName} 的名义记录，Ctrl/⌘ + Enter 发送</span>
            <button type="submit" className="btn btn-sm btn-dark" disabled={!newNoteText.trim()}>
              <Send className="w-4 h-4" />
              添加记录
            </button>
          </div>
        </form>
      }
    >
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-y-3 text-sm">
        <dt className="text-slate-500">联系电话</dt>
        <dd className="flex items-center gap-2 min-w-0">
          <span className="font-sign text-night truncate">{activeLead.phone || '—'}</span>
          {phoneOk && (
            <a
              href={getClientWhatsAppFollowUpUrl(activeLead.phone, activeLead.customerName, activeLead.needType, currentStaffName)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 hover:underline"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          )}
        </dd>
        <dt className="text-slate-500">需求</dt>
        <dd className="text-night">
          {activeLead.needType}
          {activeLead.location && <span className="text-slate-500">，{activeLead.location}</span>}
        </dd>
        <dt className="text-slate-500">负责人</dt>
        <dd className="text-night">{activeLead.assignedStaffName || <span className="text-slate-500">公海（未分配）</span>}</dd>
        <dt className="text-slate-500">提交时间</dt>
        <dd className="text-night font-sign">{formatDateTime(activeLead.createdAt)}</dd>
        <dt className="text-slate-500 pt-2">估值（USD）</dt>
        <dd className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="100"
            value={estInput}
            onChange={e => setEstInput(e.target.value)}
            placeholder="待估值"
            className="field field-sm w-36 font-sign"
            aria-label="估值（美元）"
            readOnly={!onUpdateEstimatedValue}
          />
          {onUpdateEstimatedValue && estChanged && (
            <button type="button" onClick={handleSaveValuation} disabled={savingEst} className="btn btn-sm btn-outline anim-pop">
              <Check className="w-4 h-4" />
              {savingEst ? '保存中…' : '保存'}
            </button>
          )}
        </dd>
      </dl>

      <div className="mt-5 rounded-lg bg-concrete p-4">
        <div className="text-xs text-slate-500 mb-1.5">客户原始询价</div>
        <p className="text-sm text-night leading-relaxed whitespace-pre-wrap">{activeLead.message || '客户没有留言。'}</p>
      </div>

      {onCreateQuotationForLead && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onCreateQuotationForLead(activeLead);
          }}
          className="btn btn-primary w-full mt-4"
        >
          <FileText className="w-4 h-4" />
          为这条线索开报价单
        </button>
      )}

      <h3 className="mt-7 mb-3 text-sm font-semibold text-night">
        跟进记录 <span className="font-sign text-slate-400 font-normal">{notesList.length}</span>
      </h3>
      {notesList.length === 0 ? (
        <p className="text-sm text-slate-500">还没有跟进记录。第一次联系客户后，在下方记一笔。</p>
      ) : (
        <ol className="relative ms-1.5 border-s border-line">
          {notesList.map((note, i) => (
            <li key={note.id} className={`relative ps-5 ${i < notesList.length - 1 ? 'pb-5' : ''}`}>
              <span
                className={`absolute -start-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${i === 0 ? 'bg-sky' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-semibold text-night">{note.author}</span>
                <span className="text-slate-400" title={note.createdAt}>
                  {formatRelativeTime(note.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
};

export interface ManualAddLeadModalProps {
  isOpen: boolean;
  newCustName: string;
  setNewCustName: (v: string) => void;
  newPhone: string;
  setNewPhone: (v: string) => void;
  newNeedType: string;
  setNewNeedType: (v: string) => void;
  newLocation: string;
  setNewLocation: (v: string) => void;
  newEstValue: string;
  setNewEstValue: (v: string) => void;
  newMessage: string;
  setNewMessage: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const ManualAddLeadModal: React.FC<ManualAddLeadModalProps> = ({
  isOpen,
  newCustName,
  setNewCustName,
  newPhone,
  setNewPhone,
  newNeedType,
  setNewNeedType,
  newLocation,
  setNewLocation,
  newEstValue,
  setNewEstValue,
  newMessage,
  setNewMessage,
  onSubmit,
  onClose
}) => (
  <Modal
    open={isOpen}
    onClose={onClose}
    title="录入商机"
    description="展会、电话或转介绍来的客户，在这里补录。"
    footer={
      <>
        <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
          取消
        </button>
        <button type="submit" form="manual-lead-form" className="btn btn-sm btn-primary">
          录入
        </button>
      </>
    }
  >
    <form id="manual-lead-form" onSubmit={onSubmit} className="space-y-4">
      <FormField label="客户姓名或公司">
        <input
          type="text"
          required
          value={newCustName}
          onChange={e => setNewCustName(e.target.value)}
          placeholder="如 John Miller（Gulf Road LLC）"
          className="field field-sm"
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="电话或 WhatsApp">
          <input type="text" required value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+971 50 123 4567" className="field field-sm font-sign" />
        </FormField>
        <FormField label="需求类型">
          <select value={newNeedType} onChange={e => setNewNeedType(e.target.value)} className="field field-sm">
            <option value="施工设备">施工设备</option>
            <option value="养护材料">养护材料</option>
            <option value="成套工程方案">成套工程方案</option>
            <option value="定制寻源">定制寻源</option>
          </select>
        </FormField>
        <FormField label="国家或城市">
          <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="如 迪拜" className="field field-sm" />
        </FormField>
        <FormField label="估值（USD）" hint="不确定可以留空">
          <input type="number" min={0} value={newEstValue} onChange={e => setNewEstValue(e.target.value)} placeholder="待估值" className="field field-sm font-sign" />
        </FormField>
      </div>
      <FormField label="需求说明">
        <textarea
          rows={3}
          required
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="型号、数量、交货港口、技术要求…"
          className="field field-sm resize-none"
        />
      </FormField>
    </form>
  </Modal>
);

export interface LeadDeleteConfirmModalsProps {
  leadToDelete: AdminLead | null;
  onCancelSingleDelete: () => void;
  onConfirmSingleDelete: () => void;
  isConfirmingBatchDelete: boolean;
  selectedCount: number;
  onCancelBatchDelete: () => void;
  onConfirmBatchDelete: () => void;
}

export const LeadDeleteConfirmModals: React.FC<LeadDeleteConfirmModalsProps> = ({
  leadToDelete,
  onCancelSingleDelete,
  onConfirmSingleDelete,
  isConfirmingBatchDelete,
  selectedCount,
  onCancelBatchDelete,
  onConfirmBatchDelete
}) => (
  <>
    <Modal
      open={!!leadToDelete}
      onClose={onCancelSingleDelete}
      size="sm"
      title="删除这条线索？"
      footer={
        <>
          <button type="button" onClick={onCancelSingleDelete} className="btn btn-sm btn-ghost">
            取消
          </button>
          <button type="button" onClick={onConfirmSingleDelete} className="btn btn-sm btn-danger">
            <Trash2 className="w-4 h-4" />
            删除
          </button>
        </>
      }
    >
      {leadToDelete && (
        <p className="text-sm text-slate-600 leading-relaxed">
          <strong className="text-night">{leadToDelete.customerName}</strong>（<span className="font-sign">{leadToDelete.id}</span>
          ）的询价和全部跟进记录会被永久删除，无法恢复。
        </p>
      )}
    </Modal>

    <Modal
      open={isConfirmingBatchDelete}
      onClose={onCancelBatchDelete}
      size="sm"
      title={`删除选中的 ${selectedCount} 条线索？`}
      footer={
        <>
          <button type="button" onClick={onCancelBatchDelete} className="btn btn-sm btn-ghost">
            取消
          </button>
          <button type="button" onClick={onConfirmBatchDelete} className="btn btn-sm btn-danger">
            <Trash2 className="w-4 h-4" />
            删除 {selectedCount} 条
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 leading-relaxed">这些线索和它们的跟进记录会被永久删除，无法恢复。</p>
    </Modal>
  </>
);
