import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle, CopyX } from 'lucide-react';
import { Modal, ProgressBar } from '../AdminUI';
import { AdminLead, StaffAccount } from '../../../types/admin';
import { readSpreadsheet } from '../../../utils/xlsx';
import { getStage } from '../../../config/leadStages';
import { MAX_IMPORT_ROWS, ParsedRow, parseLeadRows } from './leadsSpreadsheet';

interface ImportLeadsModalProps {
  open: boolean;
  onClose: () => void;
  leads: AdminLead[];
  staffList: StaffAccount[];
  currentStaff: StaffAccount | null;
  onDownloadTemplate: () => void;
  onImport: (rows: ParsedRow[], fileName: string, onProgress: (done: number) => void) => Promise<void>;
}

type Filter = 'ok' | 'duplicate' | 'error';

/** Choose a file → preview (problems marked per row) → import with progress. */
export const ImportLeadsModal: React.FC<ImportLeadsModalProps> = ({ open, onClose, leads, staffList, currentStaff, onDownloadTemplate, onImport }) => {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [problem, setProblem] = useState('');
  const [importError, setImportError] = useState('');
  const [reading, setReading] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [filter, setFilter] = useState<Filter>('ok');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName('');
    setParsed(null);
    setProblem('');
    setIncludeDuplicates(false);
    setFilter('ok');
    setProgress(0);
    setImportError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setReading(true);
    try {
      const rows = await readSpreadsheet(file);
      const result = parseLeadRows(rows, leads, staffList, currentStaff);
      if (result.missingColumns.length) {
        setProblem(`没有找到必填列：${result.missingColumns.join('、')}。请使用下载的模板，第一行标题不要修改。`);
      } else if (result.parsed.length === 0) {
        setProblem('文件里没有可导入的数据行。');
      } else {
        setParsed(result.parsed);
        if (rows.length - 1 > MAX_IMPORT_ROWS) setProblem(`文件超过 ${MAX_IMPORT_ROWS} 行，只读取了前 ${MAX_IMPORT_ROWS} 行，其余请分批导入。`);
      }
    } catch (err) {
      setProblem((err as Error).message || '文件读取失败，请确认是 .xlsx 或 .csv 文件。');
    } finally {
      setReading(false);
    }
  };

  const errorRows = parsed?.filter(r => r.errors.length > 0) || [];
  const duplicateRows = parsed?.filter(r => r.errors.length === 0 && r.duplicateOf) || [];
  const okRows = parsed?.filter(r => r.errors.length === 0 && !r.duplicateOf) || [];
  const toImport = includeDuplicates ? [...okRows, ...duplicateRows] : okRows;
  const shown = filter === 'ok' ? okRows : filter === 'duplicate' ? duplicateRows : errorRows;

  const runImport = async () => {
    if (toImport.length === 0) return;
    setImporting(true);
    setProgress(0);
    setImportError('');
    try {
      await onImport(toImport, fileName, setProgress);
      reset();
      onClose();
    } catch (err) {
      setImportError(`导入中断：${(err as Error).message || '网络异常'}。已经写入的会保留，请关闭后在线索列表里核对，再导入剩余部分。`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="批量导入商机线索"
      description={currentStaff?.role === 'super_admin' ? '支持 Excel（.xlsx）和 CSV。导入前会先预览，有问题的行不会导入。' : '支持 Excel（.xlsx）和 CSV。你导入的线索都会归到你名下。'}
      footer={
        parsed ? (
          <>
            <button type="button" onClick={reset} disabled={importing} className="btn btn-sm btn-ghost me-auto">
              换一个文件
            </button>
            <button type="button" onClick={close} disabled={importing} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button type="button" onClick={runImport} disabled={importing || toImport.length === 0} className="btn btn-sm btn-primary">
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              {importing ? `导入中 ${progress}/${toImport.length}` : `导入 ${toImport.length} 条`}
            </button>
          </>
        ) : (
          <button type="button" onClick={close} className="btn btn-sm btn-ghost">
            关闭
          </button>
        )
      }
    >
      {!parsed && (
        <div className="space-y-4">
          <label
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center cursor-pointer hover:border-sky hover:bg-sky-wash/40 transition-colors ${
              reading ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            {reading ? <Loader2 className="w-7 h-7 animate-spin text-sky-deep" /> : <Upload className="w-7 h-7 text-sky-deep" />}
            <span className="text-[15px] font-semibold text-night">{reading ? `正在读取 ${fileName}…` : '点击选择文件，或把文件拖到这里'}</span>
            <span className="text-sm text-slate-500">.xlsx 或 .csv，一次最多 {MAX_IMPORT_ROWS} 行</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={e => void handleFile(e.target.files?.[0])}
            />
          </label>
          {problem && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {problem}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-concrete px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              第一次导入请先下载模板，按模板填写。导出的线索文件也可以直接导入。
            </p>
            <button type="button" onClick={onDownloadTemplate} className="btn btn-sm btn-outline">
              <Download className="w-4 h-4" />
              下载导入模板
            </button>
          </div>
        </div>
      )}

      {parsed && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-night">{fileName}</span> 共 {parsed.length} 行
          </p>
          {problem && <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">{problem}</p>}
          {importing && (
            <div className="rounded-lg border border-line bg-white px-3.5 py-3">
              <div className="mb-1.5 flex justify-between text-[13px] text-slate-600">
                <span>正在写入数据库…</span>
                <span className="font-sign">
                  {progress} / {toImport.length}
                </span>
              </div>
              <ProgressBar value={(progress / Math.max(1, toImport.length)) * 100} label="导入进度" />
            </div>
          )}
          {importError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              {importError}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="预览筛选">
            {(
              [
                ['ok', '可以导入', okRows.length, CheckCircle2, 'text-emerald-600'],
                ['duplicate', '与已有线索重复', duplicateRows.length, CopyX, 'text-amber-600'],
                ['error', '有问题，不会导入', errorRows.length, AlertTriangle, 'text-rose-600']
              ] as const
            ).map(([key, label, count, Icon, tone]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${
                  filter === key ? 'border-night bg-white shadow-sm' : 'border-line bg-concrete/60 hover:border-slate-400'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${tone}`} />
                <span className="flex-1 text-sm text-slate-600">{label}</span>
                <span className="font-sign text-xl font-semibold text-night">{count}</span>
              </button>
            ))}
          </div>

          {duplicateRows.length > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-night cursor-pointer">
              <input type="checkbox" className="adm-check" checked={includeDuplicates} onChange={e => setIncludeDuplicates(e.target.checked)} />
              重复的 {duplicateRows.length} 行也导入（会生成新的线索，不会合并）
            </label>
          )}

          <div className="max-h-[46vh] overflow-auto rounded-xl border border-line">
            <table className="tbl min-w-[860px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-14">行</th>
                  <th>客户</th>
                  <th>联系方式</th>
                  <th>需求</th>
                  <th>阶段</th>
                  <th>负责人</th>
                  <th className="text-end">预估金额</th>
                  <th>{filter === 'ok' ? '' : '说明'}</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                      没有这类数据行
                    </td>
                  </tr>
                )}
                {shown.slice(0, 500).map(r => (
                  <tr key={r.rowNumber}>
                    <td className="font-sign text-slate-400">{r.rowNumber}</td>
                    <td>
                      <div className="font-semibold text-night">{r.item.customerName || '—'}</div>
                      {r.item.company && <div className="text-xs text-slate-500">{r.item.company}</div>}
                    </td>
                    <td className="font-sign text-[13px]">{r.item.phone || '—'}</td>
                    <td className="max-w-[14rem]">
                      <div className="text-night">{r.item.needType}</div>
                      <div className="text-xs text-slate-500 truncate">{r.item.location}</div>
                    </td>
                    <td>{getStage(r.item.stage).label}</td>
                    <td>{r.ownerLabel}</td>
                    <td className="text-end font-sign">{r.item.estimatedValueUsd ? `$${r.item.estimatedValueUsd.toLocaleString()}` : '—'}</td>
                    <td className="text-[13px]">
                      {r.errors.length > 0 && <span className="text-rose-700">{r.errors.join('；')}</span>}
                      {r.errors.length === 0 && r.duplicateOf && <span className="text-amber-700">与{r.duplicateOf}相同</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 500 && <p className="px-4 py-2 text-xs text-slate-500">只预览前 500 行，导入时全部处理。</p>}
          </div>
          {errorRows.length > 0 && <p className="text-xs text-slate-500">有问题的行改好后，可以单独再导入一次。</p>}
        </div>
      )}
    </Modal>
  );
};
