import React, { useMemo, useState } from 'react';
import { AuditLogItem } from '../../types/admin';
import { History, Search, Download, Loader2, ChevronDown, ShieldCheck } from 'lucide-react';
import { PageHeader, EmptyState, Avatar } from './AdminUI';
import { formatDateTime } from '../../utils/format';
import { adminApi } from '../../services/adminApi';
import { buildXlsx, downloadBlob } from '../../utils/xlsx';

interface AuditLogsViewProps {
  logs: AuditLogItem[];
}

/** Kinds of activity, matched on the action wording used by the services. */
const KINDS: { key: string; label: string; match: RegExp }[] = [
  { key: 'download', label: '下载 / 导出 / 导入', match: /导出|下载|打印|导入|模板/ },
  { key: 'lead', label: '商机线索', match: /线索|商机/ },
  { key: 'customer', label: '客户档案', match: /客户/ },
  { key: 'quote', label: '报价单', match: /报价/ },
  { key: 'product', label: '商品与分类', match: /商品|分类/ },
  { key: 'staff', label: '员工与登录', match: /员工|登录|密码/ },
  { key: 'settings', label: '官网设置', match: /联系方式|收款/ }
];

const RANGES: { key: string; label: string; days: number }[] = [
  { key: 'all', label: '全部时间', days: 0 },
  { key: '1', label: '今天', days: 1 },
  { key: '7', label: '最近 7 天', days: 7 },
  { key: '30', label: '最近 30 天', days: 30 }
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Append-only activity log (super admins only: the console tab and firestore.rules both enforce it).
 * Every change records what it was before and after; every download, export, import and print is
 * recorded with the file name and how many records it contained.
 */
export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [operator, setOperator] = useState('all');
  const [kind, setKind] = useState('all');
  const [range, setRange] = useState('all');
  const [older, setOlder] = useState<AuditLogItem[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const all = useMemo(() => {
    const ids = new Set(logs.map(l => l.id));
    return [...logs, ...older.filter(l => !ids.has(l.id))].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [logs, older]);

  const operators = useMemo(() => Array.from(new Set(all.map(l => l.operator))).filter(Boolean), [all]);

  const filtered = useMemo(() => {
    const days = RANGES.find(r => r.key === range)?.days || 0;
    const since = days ? startOfDay(new Date()) - (days - 1) * 86400000 : 0;
    const kindDef = KINDS.find(k => k.key === kind);
    const q = searchQuery.trim().toLowerCase();
    return all.filter(l => {
      if (operator !== 'all' && l.operator !== operator) return false;
      if (kindDef && !kindDef.match.test(l.action)) return false;
      if (since && (new Date(l.timestamp).getTime() || 0) < since) return false;
      if (!q) return true;
      return [l.operator, l.action, l.target, l.details].some(v => v.toLowerCase().includes(q));
    });
  }, [all, operator, kind, range, searchQuery]);

  const loadOlder = async () => {
    const oldest = all[all.length - 1]?.timestamp;
    if (!oldest) return;
    setLoadingOlder(true);
    setLoadError('');
    try {
      const page = await adminApi.loadOlderAuditLogs(oldest, 200);
      if (page.length < 200) setNoMore(true);
      setOlder(prev => [...prev, ...page]);
    } catch (err) {
      setLoadError((err as Error).message || '加载失败，请稍后重试');
    } finally {
      setLoadingOlder(false);
    }
  };

  const exportLogs = () => {
    if (filtered.length === 0) return;
    const filename = `LYM_audit_log_${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadBlob(
      buildXlsx([
        {
          name: '操作日志',
          widths: [18, 12, 10, 18, 30, 80],
          rows: [
            ['时间', '操作人', '角色', '操作', '对象', '详情'],
            ...filtered.map(l => [formatDateTime(l.timestamp), l.operator, l.operatorRole === 'super_admin' ? '超级管理员' : '销售', l.action, l.target, l.details])
          ]
        }
      ]),
      filename
    );
    const filters = [
      operator !== 'all' ? `操作人：${operator}` : '',
      kind !== 'all' ? `类型：${KINDS.find(k => k.key === kind)?.label}` : '',
      range !== 'all' ? `时间：${RANGES.find(r => r.key === range)?.label}` : '',
      searchQuery.trim() ? `搜索：${searchQuery.trim()}` : ''
    ].filter(Boolean);
    adminApi.addAuditLog('导出操作日志', filename, `导出 ${filtered.length} 条（筛选：${filters.join('，') || '全部'}）`);
  };

  return (
    <div className="adm-page">
      <PageHeader
        title="操作日志"
        description="记录每个账号的登录、退出、新增、修改、删除、认领、导出、打印等操作。日志只能追加，任何人（包括超级管理员）都不能修改或删除；系统只保留最近 30 天，更早的记录每天凌晨自动清除。"
        actions={
          <button type="button" onClick={exportLogs} disabled={filtered.length === 0} className="btn btn-sm btn-outline">
            <Download className="w-4 h-4" />
            导出 Excel
          </button>
        }
      />

      <p className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        仅超级管理员可见。销售账号看不到这个页面，也无法读取日志数据。
      </p>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="按类型筛选">
        {[{ key: 'all', label: '全部' }, ...KINDS].map(k => (
          <button
            key={k.key}
            type="button"
            aria-pressed={kind === k.key}
            onClick={() => setKind(k.key)}
            className={`h-8 px-3 rounded-full border text-[13px] font-medium transition-colors ${
              kind === k.key ? 'border-night bg-night text-white' : 'border-line bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1 max-w-md">
          <span className="sr-only">搜索日志</span>
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索客户名、文件名、操作或详情"
            className="field field-sm ps-9"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select value={operator} onChange={e => setOperator(e.target.value)} className="field field-sm w-auto min-w-[9rem]" aria-label="按操作人筛选">
            <option value="all">全部操作人</option>
            {operators.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={range} onChange={e => setRange(e.target.value)} className="field field-sm w-auto" aria-label="时间范围">
            {RANGES.map(r => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-500">
            <span className="font-sign font-semibold text-night">{filtered.length}</span> 条
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<History className="w-5 h-5" />} title="没有符合条件的记录" hint="换个筛选条件，或加载更早的记录。" />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tbl min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[9.5rem]">时间</th>
                <th className="w-[10rem]">操作人</th>
                <th className="w-[10rem]">操作</th>
                <th className="w-[14rem]">对象</th>
                <th>详情（修改前 → 修改后）</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <tr key={log.id} className="align-top">
                  <td className="font-sign text-[13px] text-slate-500 whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={log.operator} size={26} tone={log.operatorRole === 'super_admin' ? 'night' : 'sky'} />
                      <div className="min-w-0">
                        <div className="font-semibold text-night truncate">{log.operator}</div>
                        <div className="text-xs text-slate-400">{log.operatorRole === 'super_admin' ? '超级管理员' : '销售'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-night">{log.action}</td>
                  <td className="break-words text-night">{log.target}</td>
                  <td className="text-[13px] text-slate-600 leading-relaxed break-words whitespace-pre-line">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-col items-center gap-2">
        {!noMore ? (
          <button type="button" onClick={loadOlder} disabled={loadingOlder || all.length === 0} className="btn btn-sm btn-outline">
            {loadingOlder ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
            加载更早的 200 条
          </button>
        ) : (
          <p className="text-sm text-slate-500">已经是最早的记录了。</p>
        )}
        {loadError && <p className="text-sm text-rose-700">{loadError}</p>}
        <p className="text-xs text-slate-400">已载入 {all.length} 条。筛选和导出针对已载入的记录。</p>
      </div>
    </div>
  );
};
