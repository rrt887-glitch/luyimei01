import React, { useState, useEffect } from 'react';
import { adminApi } from '../../services/adminApi';
import { formatLeadValueUsd, formatRelativeTime } from '../../utils/format';
import { Inbox, RefreshCw, ChevronRight, FileText, Save } from 'lucide-react';
import { AdminLead } from '../../types/admin';
import { LEAD_STAGES, STAGE_BAR_COLORS, getStage } from '../../config/leadStages';
import { PageHeader, Panel, Chip, EmptyState, FormField, Avatar } from './AdminUI';
import { CountUp } from '../common/Motion';
import { BillingPanel } from './BillingPanel';
import { Product } from '../../types';
import { AdminTab } from './AdminLayout';
import { useSiteContactConfig, saveSiteContactConfig } from '../../config/whatsapp';

export interface DatabaseSyncInfo {
  isConnected: boolean;
  lastSyncTime: string;
  isSyncing: boolean;
  latencyMs?: number;
  onManualSync: () => void;
}

interface DashboardViewProps {
  leads: AdminLead[];
  products: Product[];
  onNavigateTab: (tab: AdminTab) => void;
  onSelectLeadForFollowUp?: (leadId: string) => void;
  syncInfo?: DatabaseSyncInfo;
  /** Only super admins may edit the official site contact config (enforced by firestore.rules). */
  canEditSiteConfig?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  leads,
  products,
  onNavigateTab,
  onSelectLeadForFollowUp,
  syncInfo,
  canEditSiteConfig = false
}) => {
  const contactCfg = useSiteContactConfig();
  const [waInput, setWaInput] = useState(contactCfg.whatsappNumber || '');
  const [phoneInput, setPhoneInput] = useState(contactCfg.hotlinePhone || '');
  const [wechatInput, setWechatInput] = useState(contactCfg.wechatId || 'LYM-Engineering-GZ');
  const [emailInput, setEmailInput] = useState(contactCfg.officialEmail || 'business@luyimei.com');
  const [savingContact, setSavingContact] = useState(false);
  const [contactNotice, setContactNotice] = useState<string | null>(null);

  // Sync asynchronous Firestore site_config/contact snapshot into form fields
  useEffect(() => {
    setWaInput(contactCfg.whatsappNumber || '');
    setPhoneInput(contactCfg.hotlinePhone || '');
    setWechatInput(contactCfg.wechatId || 'LYM-Engineering-GZ');
    setEmailInput(contactCfg.officialEmail || 'business@luyimei.com');
  }, [
    contactCfg.whatsappNumber,
    contactCfg.hotlinePhone,
    contactCfg.wechatId,
    contactCfg.officialEmail
  ]);

  const [localSyncing, setLocalSyncing] = useState(false);
  const [lastLocalSyncTime, setLastLocalSyncTime] = useState(
    syncInfo?.lastSyncTime || new Date().toLocaleTimeString('zh-CN', { hour12: false })
  );

  const handleSaveContactConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    setContactNotice(null);
    try {
      const before = { WhatsApp: contactCfg.whatsappNumber, 电话: contactCfg.hotlinePhone, 微信: contactCfg.wechatId, 邮箱: contactCfg.officialEmail };
      const after = { WhatsApp: waInput.trim(), 电话: phoneInput.trim(), 微信: wechatInput.trim(), 邮箱: emailInput.trim() };
      await saveSiteContactConfig({
        whatsappNumber: after.WhatsApp,
        hotlinePhone: after.电话,
        wechatId: after.微信,
        officialEmail: after.邮箱
      });
      const changes = (Object.keys(after) as (keyof typeof after)[])
        .filter(k => (before[k] || '') !== after[k])
        .map(k => `${k}：${before[k] || '空'} → ${after[k] || '空'}`);
      if (changes.length) adminApi.addAuditLog('修改官网联系方式', '官网联系方式', changes.join('；'));
      setContactNotice('已保存，官网各处的联系方式已同步更新。');
    } catch (err) {
      setContactNotice(`保存失败：${(err as Error).message}`);
    } finally {
      setSavingContact(false);
    }
  };

  const handleTriggerSync = () => {
    setLocalSyncing(true);
    if (syncInfo?.onManualSync) {
      syncInfo.onManualSync();
    }
    setTimeout(() => {
      setLastLocalSyncTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      setLocalSyncing(false);
    }, 700);
  };

  const isSyncing = syncInfo ? syncInfo.isSyncing : localSyncing;
  const lastSync = syncInfo?.lastSyncTime || lastLocalSyncTime;
  const isConnected = syncInfo ? syncInfo.isConnected : true;
  const latencyLabel =
    typeof syncInfo?.latencyMs === 'number' && syncInfo.latencyMs > 0
      ? `${syncInfo.latencyMs}ms`
      : '实时连接';

  // Active pipeline USD excludes lost leads
  const totalPipelineUsd = leads
    .filter(l => l.stage !== 'lost')
    .reduce((sum, l) => sum + (l.estimatedValueUsd || 0), 0);
  const activeLeadsCount = leads.filter(l => l.stage !== 'lost' && l.stage !== 'won').length;
  const wonCount = leads.filter(l => l.stage === 'won').length;
  const poolCount = leads.filter(l => l.stage === 'new' && !l.assignedStaffId).length;
  const inStockProducts = products.filter(p => p.inStock).length;
  const totalLeads = leads.length;
  const winRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

  const stageRows = LEAD_STAGES.map(st => {
    const list = leads.filter(l => l.stage === st.key);
    return {
      ...st,
      count: list.length,
      value: list.reduce((sum, l) => sum + (l.estimatedValueUsd || 0), 0),
      pct: totalLeads ? (list.length / totalLeads) * 100 : 0
    };
  });

  // Bars grow in once after mount (and re-flow smoothly when live data changes).
  const [barsReady, setBarsReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Active deals only, highest value first, then most recent.
  const pendingLeads = leads
    .filter(l => l.stage !== 'won' && l.stage !== 'lost')
    .sort((a, b) => {
      const valDiff = (b.estimatedValueUsd || 0) - (a.estimatedValueUsd || 0);
      if (valDiff !== 0) return valDiff;
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  const displayPendingLeads = pendingLeads.slice(0, 6);

  const openLead = (id: string) => (onSelectLeadForFollowUp ? onSelectLeadForFollowUp(id) : onNavigateTab('leads'));

  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  const kpis = [
    {
      label: '待分配新线索',
      value: <CountUp to={poolCount} />,
      note: poolCount > 0 ? '官网询价已进入公海，尽快指派' : '公海已清空',
      accent: poolCount > 0
    },
    { label: '进行中商机', value: <CountUp to={activeLeadsCount} />, note: '新线索到谈判中' },
    { label: '管道金额（USD）', value: <CountUp to={totalPipelineUsd} prefix="$" />, note: '不含已归档；待估值的不计入' },
    { label: '成交率', value: <CountUp to={winRate} suffix="%" />, note: `已成交 ${wonCount} / 共 ${totalLeads} 条` }
  ];

  return (
    <div className="adm-page">
      <PageHeader
        title="经营概览"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{today}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
              {isConnected ? '已连接云端' : '正在重新连接'}
            </span>
            <span>
              上次同步 <span className="font-sign">{lastSync}</span>
              {isConnected && <span className="font-sign text-slate-400">（{latencyLabel}）</span>}
            </span>
          </span>
        }
        actions={
          <>
            <button type="button" onClick={handleTriggerSync} disabled={isSyncing} className="btn btn-sm btn-ghost" title="重新拉取全部数据">
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? '同步中…' : '同步'}
            </button>
            <button onClick={() => onNavigateTab('quotation')} className="btn btn-sm btn-outline">
              <FileText className="w-4 h-4" />
              开报价单
            </button>
            <button onClick={() => onNavigateTab('leads')} className="btn btn-sm btn-primary">
              <Inbox className="w-4 h-4" />
              处理商机
            </button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`panel p-4 sm:p-5 ${k.accent ? 'border-sky shadow-[inset_3px_0_0_var(--color-sky)]' : ''}`}>
            <div className="stat-label">{k.label}</div>
            <div className="stat-value">{k.value}</div>
            <div className="stat-note">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 sm:mt-5 grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Pipeline */}
        <Panel
          title="销售管道"
          actions={
            <button onClick={() => onNavigateTab('leads')} className="btn btn-sm btn-ghost -me-2">
              查看全部
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          }
        >
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-concrete" role="img" aria-label="各阶段线索占比">
            {stageRows.map(row => (
              <span
                key={row.key}
                className="h-full transition-[width] duration-700 ease-out first:rounded-s-full last:rounded-e-full"
                style={{ width: barsReady ? `${row.pct}%` : '0%', background: STAGE_BAR_COLORS[row.key] }}
                title={`${row.label} ${row.count}`}
              />
            ))}
          </div>

          <table className="tbl mt-5 -mx-1">
            <thead>
              <tr>
                <th className="!bg-transparent !px-1">阶段</th>
                <th className="!bg-transparent text-end">线索</th>
                <th className="!bg-transparent text-end">占比</th>
                <th className="!bg-transparent !pe-1 text-end">估值合计</th>
              </tr>
            </thead>
            <tbody>
              {stageRows.map(row => (
                <tr key={row.key}>
                  <td className="!px-1">
                    <Chip tone={row.tone}>{row.label}</Chip>
                  </td>
                  <td className="text-end font-sign font-semibold">{row.count}</td>
                  <td className="text-end font-sign text-slate-500">{row.pct.toFixed(0)}%</td>
                  <td className="!pe-1 text-end font-sign">{row.value > 0 ? `$${row.value.toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Priority queue */}
        <Panel title="优先跟进" actions={<span className="text-[13px] text-slate-500">按估值排序 · 进行中 {pendingLeads.length}</span>} bodyClassName="">
          {displayPendingLeads.length === 0 ? (
            <EmptyState
              icon={<Inbox className="w-5 h-5" />}
              title="没有进行中的商机"
              hint="新的官网询价会自动出现在这里。"
              action={
                <button onClick={() => onNavigateTab('leads')} className="btn btn-sm btn-outline">
                  录入线下商机
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-[#edf1f4]">
              {displayPendingLeads.map(lead => {
                const st = getStage(lead.stage);
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => openLead(lead.id)}
                      className="group w-full flex items-center gap-3 px-5 py-3.5 text-start hover:bg-[#f8fafb] transition-colors"
                    >
                      <Avatar name={lead.customerName} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-night truncate">{lead.customerName}</span>
                          <Chip tone={st.tone}>{st.label}</Chip>
                        </span>
                        <span className="mt-0.5 block text-[13px] text-slate-500 truncate">
                          {lead.needType}
                          {lead.location ? `，${lead.location}` : ''}
                          <span className="text-slate-400">　{lead.assignedStaffName ? `负责人 ${lead.assignedStaffName}` : '待分配'}</span>
                        </span>
                      </span>
                      <span className="text-end shrink-0">
                        <span className={`block font-sign font-semibold ${lead.estimatedValueUsd ? 'text-night' : 'text-slate-400 text-sm'}`}>
                          {formatLeadValueUsd(lead.estimatedValueUsd)}
                        </span>
                        <span className="block text-xs text-slate-400 mt-0.5">{formatRelativeTime(lead.updatedAt || lead.createdAt)}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 rtl:rotate-180" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {canEditSiteConfig && (
        <Panel
          as="form"
          onSubmit={handleSaveContactConfig}
          className="mt-4 sm:mt-5"
          title="官网联系方式"
          actions={
            <button type="submit" disabled={savingContact} className="btn btn-sm btn-dark">
              <Save className="w-4 h-4" />
              {savingContact ? '保存中…' : '保存'}
            </button>
          }
        >
          <p className="text-sm text-slate-500 mb-4 max-w-[70ch]">
            同步到官网产品咨询按钮、页脚、报价单抬头和搜索引擎信息。WhatsApp 留空时，官网会改为引导客户填写询价表单。
          </p>
          {contactNotice && (
            <div className="anim-pop mb-4 px-3.5 py-2.5 rounded-lg bg-sky-wash text-sm text-night">{contactNotice}</div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="WhatsApp 号码" hint="含国家代码的纯数字，如 8613900000000">
              <input type="text" value={waInput} onChange={e => setWaInput(e.target.value)} placeholder="留空则引导填表" className="field field-sm font-sign" />
            </FormField>
            <FormField label="商务热线">
              <input type="text" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+86 20 xxxx xxxx" className="field field-sm font-sign" />
            </FormField>
            <FormField label="企业微信">
              <input type="text" value={wechatInput} onChange={e => setWechatInput(e.target.value)} placeholder="LYM-Engineering-GZ" className="field field-sm font-sign" />
            </FormField>
            <FormField label="工程邮箱">
              <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="business@luyimei.com" className="field field-sm font-sign" />
            </FormField>
          </div>
          <p className="mt-4 text-[13px] text-slate-500">
            商品库在售 <span className="font-sign font-semibold text-night">{inStockProducts}</span> 款，共 <span className="font-sign">{products.length}</span> 款。
          </p>
        </Panel>
      )}

      {canEditSiteConfig && <BillingPanel />}
    </div>
  );
};
