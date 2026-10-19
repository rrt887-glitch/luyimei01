import { AdminLead, LeadStage, StaffAccount } from '../../../types/admin';
import { LEAD_STAGES, getStage } from '../../../config/leadStages';
import type { LeadImportItem } from '../../../services/admin/leadsCrmService';
import { SheetSpec } from '../../../utils/xlsx';

/**
 * Lead spreadsheet layout shared by the template, the export and the import.
 * An exported file can be imported again: the export uses the same headings plus a few
 * read-only columns (number, dates, follow-up history) that the import ignores.
 */
type FieldKey = 'customerName' | 'company' | 'phone' | 'needType' | 'location' | 'message' | 'stage' | 'owner' | 'value' | 'note';

interface Column {
  key: FieldKey;
  header: string;
  required?: boolean;
  width: number;
  /** Other headings accepted on import (older files, English files). */
  aliases: string[];
  help: string;
}

export const LEAD_COLUMNS: Column[] = [
  { key: 'customerName', header: '客户姓名', required: true, width: 16, aliases: ['客户', '客户名称', '姓名', 'name', 'customer', 'customer name', 'contact name'], help: '必填。' },
  { key: 'company', header: '公司名称', width: 24, aliases: ['公司', 'company', 'company name'], help: '选填。' },
  {
    key: 'phone',
    header: '联系方式',
    required: true,
    width: 22,
    aliases: ['电话', '手机', '联系电话', 'whatsapp', '邮箱', 'email', 'phone', 'contact', 'tel'],
    help: '必填。电话、WhatsApp 或邮箱，带国际区号最好，如 +971 50 123 4567。系统用它判断是否重复。'
  },
  { key: 'needType', header: '需求类型', width: 14, aliases: ['需求', '需求品类', '品类', 'need', 'need type', 'category'], help: '选填，如 养护材料 / 施工设备 / 定制寻源。不填记为「其他」。' },
  { key: 'location', header: '国家/地区或项目地点', width: 18, aliases: ['项目地点', '地点', '国家', '国家/地区', 'country', 'location', 'region'], help: '选填。' },
  { key: 'message', header: '需求描述', width: 36, aliases: ['具体需求', '需求说明', '描述', 'message', 'description', 'requirement'], help: '选填。' },
  {
    key: 'stage',
    header: '阶段',
    width: 10,
    aliases: ['当前阶段', '状态', 'stage', 'status'],
    help: `选填，可填：${LEAD_STAGES.map(s => s.label).join(' / ')}。不填为「新线索」。`
  },
  {
    key: 'owner',
    header: '负责人',
    width: 12,
    aliases: ['负责业务员', '业务员', '销售', 'owner', 'sales', 'assigned to'],
    help: '选填，填员工姓名或手机号；不填或填「公海」则进入公海。销售账号导入的线索一律归自己。'
  },
  { key: 'value', header: '预估金额(USD)', width: 14, aliases: ['预估金额', '估值', '预估美金(USD)', '金额', 'value', 'amount', 'estimated value'], help: '选填，只填数字，如 12000。' },
  { key: 'note', header: '跟进备注', width: 30, aliases: ['备注', '跟进记录', 'note', 'notes', 'remark'], help: '选填，会作为一条跟进记录保存。' }
];

const normalize = (s: string) => s.replace(/[*＊\s]/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();

export function buildTemplateSheets(staffList: StaffAccount[]): SheetSpec[] {
  const activeStaff = staffList.filter(s => s.status === 'active');
  return [
    {
      name: '商机线索',
      widths: LEAD_COLUMNS.map(c => c.width),
      rows: [
        LEAD_COLUMNS.map(c => (c.required ? `${c.header}*` : c.header)),
        ['Ahmed Al-Mansoori', 'Gulf Roadworks LLC', '+971 50 123 4567', '施工设备', '阿联酋 迪拜', '需要 2 台灌缝机，含培训与备件', '新线索', '', 18000, '展会上认识，周五回电'],
        ['王工', '广东路桥建设', '13800001234', '养护材料', '佛山', '高速段裂缝修补，贴缝带 3000 米', '跟进中', activeStaff[0]?.name || '', '', '']
      ]
    },
    {
      name: '填写说明',
      header: false,
      widths: [22, 90],
      rows: [
        ['商机线索导入模板 · 填写说明', ''],
        ['', ''],
        ['1. 在「商机线索」工作表里从第 2 行开始填写，每行一个客户。两行示例可以直接删除或覆盖。', ''],
        ['2. 第一行标题不要修改；带 * 的列必须填写。', ''],
        ['3. 联系方式和系统里已有的线索相同时，默认跳过，不会重复导入。', ''],
        ['4. 一次最多导入 2000 行。导入前会先预览，可以看到哪些行有问题。', ''],
        ['', ''],
        ['列', '说明'],
        ...LEAD_COLUMNS.map(c => [c.required ? `${c.header}*` : c.header, c.help]),
        ['', ''],
        ['可填的阶段', LEAD_STAGES.map(s => s.label).join(' / ')],
        ['可填的负责人', activeStaff.length ? activeStaff.map(s => `${s.name}（${s.phone}）`).join('、') : '（暂无在职员工，留空即可）']
      ]
    }
  ];
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function buildExportSheets(leads: AdminLead[]): SheetSpec[] {
  const header = ['编号', ...LEAD_COLUMNS.filter(c => c.key !== 'note').map(c => c.header), '最近跟进', '跟进记录', '提交时间', '更新时间'];
  return [
    {
      name: '商机线索',
      widths: [24, ...LEAD_COLUMNS.filter(c => c.key !== 'note').map(c => c.width), 16, 60, 17, 17],
      rows: [
        header,
        ...leads.map(l => {
          const notes = [...(l.notes || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const last = notes[notes.length - 1];
          return [
            l.id,
            l.customerName,
            l.company || '',
            l.phone,
            l.needType,
            l.location,
            l.message,
            getStage(l.stage).label,
            l.assignedStaffName || '公海',
            l.estimatedValueUsd ?? '',
            last ? formatTime(last.createdAt) : '',
            notes.map(n => `[${formatTime(n.createdAt)} ${n.author}] ${n.content}`).join('\n'),
            formatTime(l.createdAt),
            formatTime(l.updatedAt)
          ];
        })
      ]
    }
  ];
}

export interface ParsedRow {
  /** 1-based row number in the sheet, for messages. */
  rowNumber: number;
  item: LeadImportItem;
  errors: string[];
  /** Same contact as an existing lead or an earlier row in this file. */
  duplicateOf?: string;
  ownerLabel: string;
}

const contactKey = (raw: string) => {
  const s = raw.trim().toLowerCase();
  if (s.includes('@')) return s;
  const digits = s.replace(/\D/g, '');
  // 0086 / 86 prefixes and a leading 0 are the same Chinese number.
  return digits.replace(/^00/, '').replace(/^86(?=1\d{10}$)/, '').replace(/^0(?=\d{6,})/, '');
};

export const MAX_IMPORT_ROWS = 2000;

export function parseLeadRows(
  rows: string[][],
  existingLeads: AdminLead[],
  staffList: StaffAccount[],
  currentStaff: StaffAccount | null
): { parsed: ParsedRow[]; missingColumns: string[]; unknownHeaders: string[] } {
  if (rows.length === 0) return { parsed: [], missingColumns: LEAD_COLUMNS.filter(c => c.required).map(c => c.header), unknownHeaders: [] };

  // Header row: the first row that names at least one required column (tolerates a title row).
  const headerIndex = Math.max(
    0,
    rows.slice(0, 5).findIndex(r => r.some(cell => LEAD_COLUMNS.some(c => c.required && [c.header, ...c.aliases].some(h => normalize(h) === normalize(cell)))))
  );
  const header = rows[headerIndex];
  const map = new Map<FieldKey, number>();
  const unknownHeaders: string[] = [];
  header.forEach((cell, i) => {
    const n = normalize(cell || '');
    if (!n) return;
    const col = LEAD_COLUMNS.find(c => [c.header, ...c.aliases].some(h => normalize(h) === n));
    if (col && !map.has(col.key)) map.set(col.key, i);
    else if (!col && !['编号', '最近跟进', '提交时间', '更新时间', 'id'].includes(n)) unknownHeaders.push(cell);
  });
  const missingColumns = LEAD_COLUMNS.filter(c => c.required && !map.has(c.key)).map(c => c.header);
  if (missingColumns.length) return { parsed: [], missingColumns, unknownHeaders };

  const isSuperAdmin = currentStaff?.role === 'super_admin';
  const seen = new Map<string, string>();
  for (const l of existingLeads) {
    const k = contactKey(l.phone);
    if (k) seen.set(k, `已有线索 ${l.customerName}`);
  }

  const get = (row: string[], key: FieldKey) => {
    const i = map.get(key);
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };

  const parsed: ParsedRow[] = [];
  rows.slice(headerIndex + 1, headerIndex + 1 + MAX_IMPORT_ROWS).forEach((row, offset) => {
    if (!row.some(c => String(c || '').trim())) return;
    const errors: string[] = [];
    const customerName = get(row, 'customerName');
    const phone = get(row, 'phone');
    if (!customerName) errors.push('缺少客户姓名');
    if (!phone) errors.push('缺少联系方式');
    else if (!phone.includes('@') && phone.replace(/\D/g, '').length < 5) errors.push('联系方式不像电话或邮箱');

    const stageText = get(row, 'stage');
    let stage: LeadStage = 'new';
    if (stageText) {
      const found = LEAD_STAGES.find(s => s.label === stageText || s.key === stageText.toLowerCase());
      if (found) stage = found.key;
      else errors.push(`阶段「${stageText}」不认识`);
    }

    const ownerText = get(row, 'owner');
    let assignedStaffId = '';
    let ownerLabel = '公海';
    if (!isSuperAdmin) {
      assignedStaffId = currentStaff?.id || '';
      ownerLabel = currentStaff?.name || '我';
    } else if (ownerText && ownerText !== '公海') {
      const digits = ownerText.replace(/\D/g, '');
      const staff = staffList.find(s => s.name === ownerText || (digits.length >= 6 && s.phone.replace(/\D/g, '').endsWith(digits)));
      if (!staff) errors.push(`找不到员工「${ownerText}」`);
      else if (staff.status !== 'active') errors.push(`员工「${staff.name}」已停用`);
      else {
        assignedStaffId = staff.id;
        ownerLabel = staff.name;
      }
    }

    const valueText = get(row, 'value').replace(/[$,\s，]/g, '').replace(/usd/i, '');
    let estimatedValueUsd: number | undefined;
    if (valueText) {
      const n = Number(valueText);
      if (!Number.isFinite(n) || n < 0) errors.push(`预估金额「${get(row, 'value')}」不是数字`);
      else if (n > 0) estimatedValueUsd = n;
    }

    const key = contactKey(phone);
    const duplicateOf = key ? seen.get(key) : undefined;
    if (key && !duplicateOf) seen.set(key, `第 ${headerIndex + 2 + offset} 行`);

    parsed.push({
      rowNumber: headerIndex + 2 + offset,
      errors,
      duplicateOf,
      ownerLabel,
      item: {
        customerName,
        company: get(row, 'company'),
        phone,
        needType: get(row, 'needType') || '其他',
        location: get(row, 'location'),
        message: get(row, 'message'),
        stage,
        assignedStaffId,
        estimatedValueUsd,
        note: get(row, 'note')
      }
    });
  });
  return { parsed, missingColumns, unknownHeaders };
}
