import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Modal, ProgressBar } from '../AdminUI';
import { Product } from '../../../types';
import { ProductCategoryDef } from '../../../config/categories';
import { unitName } from '../../../config/units';
import { readSpreadsheet } from '../../../utils/xlsx';
import { MAX_PRODUCT_IMPORT_ROWS, ParsedProductRow, parseProductRows } from './productsSpreadsheet';

interface ImportProductsModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  categories: ProductCategoryDef[];
  onDownloadTemplate: () => void;
  /** `rows` are the new ones plus, when chosen, the ones that update an existing model. */
  onImport: (rows: ParsedProductRow[], fileName: string, onProgress: (done: number) => void) => Promise<void>;
}

type Filter = 'new' | 'existing' | 'error';

/** Choose a file → preview (problems marked per row) → put the products on the catalogue. */
export const ImportProductsModal: React.FC<ImportProductsModalProps> = ({ open, onClose, products, categories, onDownloadTemplate, onImport }) => {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedProductRow[] | null>(null);
  const [problem, setProblem] = useState('');
  const [importError, setImportError] = useState('');
  const [reading, setReading] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [filter, setFilter] = useState<Filter>('new');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName('');
    setParsed(null);
    setProblem('');
    setUpdateExisting(false);
    setFilter('new');
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
      const result = parseProductRows(rows, products, categories);
      if (result.missingColumns.length) {
        setProblem(`没有找到必填列：${result.missingColumns.join('、')}。请使用下载的模板，第一行标题不要修改。`);
      } else if (result.parsed.length === 0) {
        setProblem('文件里没有可导入的商品行。');
      } else {
        setParsed(result.parsed);
        if (rows.length - 1 > MAX_PRODUCT_IMPORT_ROWS) setProblem(`文件超过 ${MAX_PRODUCT_IMPORT_ROWS} 行，只读取了前 ${MAX_PRODUCT_IMPORT_ROWS} 行，其余请分批导入。`);
        if (!result.parsed.some(r => !r.errors.length && !r.duplicateRow && !r.existing)) {
          setFilter(result.parsed.some(r => r.existing && !r.errors.length) ? 'existing' : 'error');
        }
      }
    } catch (err) {
      setProblem((err as Error).message || '文件读取失败，请确认是 .xlsx 或 .csv 文件。');
    } finally {
      setReading(false);
    }
  };

  const errorRows = parsed?.filter(r => r.errors.length > 0 || r.duplicateRow) || [];
  const existingRows = parsed?.filter(r => !r.errors.length && !r.duplicateRow && r.existing) || [];
  const newRows = parsed?.filter(r => !r.errors.length && !r.duplicateRow && !r.existing) || [];
  const toImport = updateExisting ? [...newRows, ...existingRows] : newRows;
  const shown = filter === 'new' ? newRows : filter === 'existing' ? existingRows : errorRows;
  const catName = (id: string) => categories.find(c => c.id === id)?.name.zh || id;

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
      setImportError(`导入中断：${(err as Error).message || '网络异常'}。已经写入的商品会保留，请关闭后在商品库核对，再导入剩余部分（已上架的型号会被识别，不会重复）。`);
    } finally {
      setImporting(false);
    }
  };

  const importLabel = updateExisting && existingRows.length
    ? `上架 ${newRows.length} 款，更新 ${existingRows.length} 款`
    : `上架 ${newRows.length} 款`;

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="批量上架商品"
      description="支持 Excel（.xlsx）和 CSV。导入前会先预览，有问题的行不会导入；导入后立即在官网显示。"
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
              {importing ? `写入中 ${progress}/${toImport.length}` : importLabel}
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
            <span className="text-sm text-slate-500">.xlsx 或 .csv，一次最多 {MAX_PRODUCT_IMPORT_ROWS} 款商品</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              aria-label="选择商品表格文件"
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
              第一次使用请先下载模板，按模板填写。从商品库导出的表格改好后也可以直接导入。
            </p>
            <button type="button" onClick={onDownloadTemplate} className="btn btn-sm btn-outline">
              <Download className="w-4 h-4" />
              下载上架模板
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
                <span>正在写入商品库…</span>
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
                ['new', '新商品，可以上架', newRows.length, CheckCircle2, 'text-emerald-600'],
                ['existing', '型号已在商品库', existingRows.length, RefreshCw, 'text-sky-deep'],
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

          {existingRows.length > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-night cursor-pointer">
              <input type="checkbox" className="adm-check" checked={updateExisting} onChange={e => setUpdateExisting(e.target.checked)} />
              用表格内容更新这 {existingRows.length} 款已有商品（空白的格子保留原内容）
            </label>
          )}

          <div className="max-h-[46vh] overflow-auto rounded-xl border border-line">
            <table className="tbl min-w-[860px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-14">行</th>
                  <th>商品</th>
                  <th>分类</th>
                  <th className="text-end">标价</th>
                  <th>单位</th>
                  <th>库存</th>
                  <th>图片</th>
                  <th>{filter === 'new' ? '' : '说明'}</th>
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
                    <td className="max-w-[16rem]">
                      <div className="font-semibold text-night truncate" title={r.item.name}>{r.item.name || '—'}</div>
                      <div className="font-sign text-xs text-slate-500">{r.item.model || '—'}</div>
                    </td>
                    <td>{r.item.type ? catName(r.item.type) : '—'}</td>
                    <td className="text-end font-sign whitespace-nowrap">{r.item.price || '—'}</td>
                    <td className="whitespace-nowrap">{r.item.unit ? unitName(r.item.unit, 'zh') : '—'}</td>
                    <td>{r.item.inStock === false ? '缺货' : '有货'}</td>
                    <td className="font-sign text-[13px]">{r.item.images?.length ? `${r.item.images.length} 张` : '—'}</td>
                    <td className="text-[13px]">
                      {r.errors.length > 0 && <span className="text-rose-700">{r.errors.join('；')}</span>}
                      {r.errors.length === 0 && r.duplicateRow && <span className="text-rose-700">与第 {r.duplicateRow} 行型号相同</span>}
                      {r.errors.length === 0 && !r.duplicateRow && r.existing && (
                        <span className="text-sky-deep">{updateExisting ? '将更新' : '已存在，默认跳过'}：{r.existing.customName || r.existing.model}</span>
                      )}
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
