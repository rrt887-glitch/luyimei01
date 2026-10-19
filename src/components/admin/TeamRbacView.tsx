import React, { useState } from 'react';
import { StaffAccount, StaffRole, AdminLead } from '../../types/admin';
import { adminApi } from '../../services/adminApi';
import { generateStrongPassword } from '../../utils/crypto';
import { UserPlus, KeyRound, CheckCircle, X, Trash2, Sparkles, Eye, EyeOff, Copy, Check, Phone, Mail } from 'lucide-react';
import { PageHeader, Chip, Modal, FormField, Avatar } from './AdminUI';
import { formatRelativeTime, formatUsd } from '../../utils/format';

interface TeamRbacViewProps {
  staffList: StaffAccount[];
  currentStaff: StaffAccount;
  leads?: AdminLead[];
  onRefreshStaff: () => void;
  onShowToast: (msg: string) => void;
}

export const TeamRbacView: React.FC<TeamRbacViewProps> = ({
  staffList,
  currentStaff,
  leads = [],
  onRefreshStaff,
  onShowToast
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('sales_rep');

  // Batch management state
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [staffToDelete, setStaffToDelete] = useState<StaffAccount | null>(null);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);

  // Reset password modal state
  const [staffToResetPassword, setStaffToResetPassword] = useState<StaffAccount | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showResetPasswordPlain, setShowResetPasswordPlain] = useState(true);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [resetSuccessNotice, setResetSuccessNotice] = useState<string | null>(null);
  const [hasCopiedResetPass, setHasCopiedResetPass] = useState(false);

  const handleToggleSelectAll = () => {
    if (selectedStaffIds.size === staffList.length && staffList.length > 0) {
      setSelectedStaffIds(new Set());
    } else {
      setSelectedStaffIds(new Set(staffList.map(s => s.id)));
    }
  };

  const handleToggleStaff = (id: string) => {
    setSelectedStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isSuperAdmin = currentStaff.role === 'super_admin';

  const handleBatchStatusChange = async (status: 'active' | 'suspended') => {
    if (!isSuperAdmin) {
      onShowToast('权限不足：仅超级管理员有权批量调整员工状态！');
      return;
    }
    const ids = Array.from(selectedStaffIds);
    if (ids.length === 0) return;
    try {
      await adminApi.batchUpdateStaffStatus(ids, status);
      onRefreshStaff();
      onShowToast(`已将 ${ids.length} 位员工${status === 'active' ? '恢复启用' : '停用'}`);
    } catch (err) {
      onShowToast((err as Error).message);
    }
  };

  const handleBatchDeleteConfirm = async () => {
    if (!isSuperAdmin) {
      onShowToast('权限不足：仅超级管理员有权批量删除员工！');
      return;
    }
    const ids = Array.from(selectedStaffIds);
    if (ids.length === 0) return;
    try {
      const { successCount, skippedCurrent } = await adminApi.batchDeleteStaff(ids);
      setSelectedStaffIds(new Set());
      setIsConfirmingBatchDelete(false);
      onRefreshStaff();
      if (skippedCurrent) {
        onShowToast(`已删除 ${successCount} 位员工（你自己的账号已跳过）`);
      } else {
        onShowToast(`已删除 ${successCount} 位员工`);
      }
    } catch (err) {
      onShowToast((err as Error).message);
    }
  };

  const handleSingleDeleteConfirm = async () => {
    if (!isSuperAdmin) {
      onShowToast('权限不足：仅超级管理员有权删除员工！');
      setStaffToDelete(null);
      return;
    }
    if (!staffToDelete) return;
    if (staffToDelete.id === currentStaff.id) {
      onShowToast('不可删除当前正在登录操作的主管账号！');
      setStaffToDelete(null);
      return;
    }
    try {
      const success = await adminApi.deleteStaff(staffToDelete.id);
      if (success) {
        setSelectedStaffIds(prev => {
          const next = new Set(prev);
          next.delete(staffToDelete.id);
          return next;
        });
        onShowToast(`已删除员工：${staffToDelete.name}，名下线索已退回公海`);
      } else {
        onShowToast('删除失败：当前登录账号受系统安全保护。');
      }
    } catch (err) {
      onShowToast((err as Error).message);
    }
    setStaffToDelete(null);
    onRefreshStaff();
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      onShowToast('权限不足：仅超级管理员有权录入新员工！');
      return;
    }
    if (!newName.trim() || !newPhone.trim() || !newEmail.trim() || !newPassword.trim()) {
      onShowToast('请完整填写员工姓名、登录手机号、电子邮箱及初始密码。');
      return;
    }
    if (newPassword.trim().length < 8) {
      onShowToast('初始密码至少 8 位');
      return;
    }

    try {
      await adminApi.addStaffAccount({
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim(),
        password: newPassword.trim(),
        role: newRole
      });
      setIsAddModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewPassword('');
      onRefreshStaff();
      onShowToast(`已为 ${newName} 开通账号，用手机号 ${newPhone.trim()} 登录`);
    } catch (err) {
      onShowToast((err as Error).message);
    }
  };

  const handleToggleStatus = async (staff: StaffAccount) => {
    if (!isSuperAdmin) {
      onShowToast('权限不足：仅超级管理员有权调整员工在职状态！');
      return;
    }
    try {
      await adminApi.toggleStaffStatus(staff.id);
      onRefreshStaff();
      onShowToast(`${staff.name} 已${staff.status === 'active' ? '停用' : '恢复启用'}`);
    } catch (err) {
      onShowToast((err as Error).message);
    }
  };

  const handleOpenResetModal = (staff: StaffAccount) => {
    if (!isSuperAdmin) {
      onShowToast('权限受限：仅超级管理员有权重置员工密码！');
      return;
    }
    setStaffToResetPassword(staff);
    // Auto-generate a cryptographically strong 14-character password
    const autoPass = generateStrongPassword();
    setResetNewPassword(autoPass);
    setShowResetPasswordPlain(true);
    setResetSuccessNotice(null);
    setHasCopiedResetPass(false);
  };

  const handleGenerateRandomPassword = () => {
    const autoPass = generateStrongPassword();
    setResetNewPassword(autoPass);
    setResetSuccessNotice(null);
    setHasCopiedResetPass(false);
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      onShowToast('权限受限：仅超级管理员有权重置员工密码！');
      return;
    }
    if (!staffToResetPassword) return;
    if (!resetNewPassword.trim() || resetNewPassword.trim().length < 8) {
      onShowToast('请填写不少于 8 位字符的重置密码。');
      return;
    }

    setIsSubmittingReset(true);
    try {
      await adminApi.resetStaffPassword(staffToResetPassword.id, resetNewPassword.trim());
      setResetSuccessNotice(resetNewPassword.trim());
      onRefreshStaff();
      onShowToast(`已重置 ${staffToResetPassword.name} 的密码，对方所有设备需重新登录`);
    } catch (err) {
      console.error('Reset staff password error:', err);
      onShowToast((err as Error).message || '重置密码失败，请检查数据库连接');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleCopyNewPassword = () => {
    if (!resetSuccessNotice) return;
    navigator.clipboard.writeText(resetSuccessNotice);
    setHasCopiedResetPass(true);
    onShowToast('新密码已复制');
    setTimeout(() => setHasCopiedResetPass(false), 3000);
  };

  const closeReset = () => {
    setStaffToResetPassword(null);
    setResetSuccessNotice(null);
  };

  const activeStaff = staffList.filter(s => s.status === 'active').length;
  const isAllSelected = selectedStaffIds.size > 0 && selectedStaffIds.size === staffList.length;

  const ROLE_INFO = [
    {
      role: '超级管理员',
      tone: 'violet' as const,
      can: '全部页面；指派线索、管理员工、商品与官网联系方式、查看客户档案和操作日志。'
    },
    {
      role: '销售代表',
      tone: 'sky' as const,
      can: '经营概览、商机线索（公海和自己名下）、报价单（自己开的）、团队名录。看不到同事的线索和客户档案。'
    }
  ];

  return (
    <div className="adm-page">
      <PageHeader
        title="团队与权限"
        description={`在职 ${activeStaff} 人，共 ${staffList.length} 人。员工的开通、停用、删除和改密都在服务器上完成，立即生效。`}
        actions={
          isSuperAdmin && (
            <>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none me-2">
                <input type="checkbox" className="adm-check" checked={isAllSelected} onChange={handleToggleSelectAll} />
                全选
              </label>
              <button onClick={() => setIsAddModalOpen(true)} className="btn btn-sm btn-primary">
                <UserPlus className="w-4 h-4" />
                开通账号
              </button>
            </>
          )
        }
      />

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {staffList.map(member => {
          const isSelected = selectedStaffIds.has(member.id);
          const isSelf = member.id === currentStaff.id;
          const memberLeads = leads.filter(l => l.assignedStaffId === member.id);
          const activeCount = memberLeads.filter(l => l.stage !== 'won' && l.stage !== 'lost').length;
          const totalVal = memberLeads.reduce((sum, l) => sum + (l.estimatedValueUsd || 0), 0);
          const active = member.status === 'active';
          return (
            <li
              key={member.id}
              className={`panel p-5 flex flex-col transition-colors ${isSelected ? '!border-sky-deep bg-sky-wash/40' : ''} ${active ? '' : 'bg-[#fafbfc]'}`}
            >
              <div className="flex items-start gap-3">
                <div className={active ? '' : 'opacity-50 grayscale'}>
                  <Avatar name={member.name} size={44} tone={member.role === 'super_admin' ? 'night' : 'sky'} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold text-night truncate">{member.name}</span>
                    {isSelf && <span className="text-xs text-sky-deep font-medium">（你）</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Chip tone={member.role === 'super_admin' ? 'violet' : 'sky'} dot={false}>
                      {member.role === 'super_admin' ? '超级管理员' : '销售代表'}
                    </Chip>
                    <Chip tone={active ? 'emerald' : 'slate'}>{active ? '在职' : '已停用'}</Chip>
                  </div>
                </div>
                {isSuperAdmin && (
                  <input
                    type="checkbox"
                    className="adm-check mt-1"
                    checked={isSelected}
                    onChange={() => handleToggleStaff(member.id)}
                    aria-label={`选择 ${member.name}`}
                  />
                )}
              </div>

              <div className="mt-4 space-y-1.5 text-[13px] text-slate-600">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-sign truncate">{member.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-sign truncate">{member.email || '—'}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-concrete px-3 py-2.5 text-center">
                <div>
                  <div className="font-sign text-lg font-semibold text-night">{memberLeads.length}</div>
                  <div className="text-xs text-slate-500">名下线索</div>
                </div>
                <div>
                  <div className="font-sign text-lg font-semibold text-night">{activeCount}</div>
                  <div className="text-xs text-slate-500">进行中</div>
                </div>
                <div>
                  <div className="font-sign text-lg font-semibold text-night truncate">{totalVal > 0 ? formatUsd(totalVal) : '—'}</div>
                  <div className="text-xs text-slate-500">估值</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#edf1f4] flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400" title={member.lastLoginAt}>
                  {member.lastLoginAt && !Number.isNaN(new Date(member.lastLoginAt).getTime())
                    ? `${formatRelativeTime(member.lastLoginAt)}登录`
                    : '还没有登录过'}
                </span>
                {isSuperAdmin && (
                  <div className="flex items-center gap-0.5">
                    {!isSelf && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        onClick={() => handleToggleStatus(member)}
                        className="inline-flex items-center gap-2 h-8 px-2 rounded-lg text-[13px] text-slate-600 hover:bg-concrete"
                        title={active ? '停用这个账号' : '恢复启用'}
                      >
                        <span className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <span
                            className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[inset-inline-start] duration-200 ${
                              active ? 'start-[16px]' : 'start-[2px]'
                            }`}
                          />
                        </span>
                        {active ? '启用' : '停用'}
                      </button>
                    )}
                    <button onClick={() => handleOpenResetModal(member)} className="icon-btn" aria-label={`重置 ${member.name} 的密码`} title="重置密码">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {!isSelf && (
                      <button onClick={() => setStaffToDelete(member)} className="icon-btn danger" aria-label={`删除 ${member.name}`} title="删除账号">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="panel mt-6">
        <div className="panel-head">
          <h2 className="panel-title">两种角色能做什么</h2>
        </div>
        <dl className="divide-y divide-[#edf1f4]">
          {ROLE_INFO.map(r => (
            <div key={r.role} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] px-5 py-4">
              <dt>
                <Chip tone={r.tone} dot={false}>
                  {r.role}
                </Chip>
              </dt>
              <dd className="text-sm text-slate-600 leading-relaxed">{r.can}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Floating batch bar */}
      {isSuperAdmin && selectedStaffIds.size > 0 && (
        <div className="batch-bar fixed bottom-5 left-1/2 lg:left-[calc(50%+116px)] z-40 w-[calc(100%-2rem)] max-w-[600px] flex flex-wrap items-center gap-2 rounded-xl bg-night text-white px-4 py-3 shadow-2xl">
          <span className="text-sm font-semibold me-1">
            已选 <span className="font-sign text-sky">{selectedStaffIds.size}</span> 人
          </span>
          <button onClick={() => handleBatchStatusChange('active')} className="btn btn-sm text-white hover:bg-white/10">
            启用
          </button>
          <button onClick={() => handleBatchStatusChange('suspended')} className="btn btn-sm text-white hover:bg-white/10">
            停用
          </button>
          <button onClick={() => setIsConfirmingBatchDelete(true)} className="btn btn-sm text-rose-200 hover:bg-rose-500/20">
            <Trash2 className="w-4 h-4" />
            删除
          </button>
          <button onClick={() => setSelectedStaffIds(new Set())} className="icon-btn ms-auto !text-white/70 hover:!bg-white/10" aria-label="取消选择">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add staff */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="开通员工账号"
        description="员工用手机号和密码登录中台。"
        footer={
          <>
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button type="submit" form="add-staff-form" className="btn btn-sm btn-primary">
              开通
            </button>
          </>
        }
      >
        <form id="add-staff-form" onSubmit={handleAddStaff} className="space-y-4">
          <FormField label="姓名">
            <input type="text" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="如 陈工" className="field field-sm" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="手机号" hint="作为登录账号">
              <input type="tel" required value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="13812345678" className="field field-sm font-sign" />
            </FormField>
            <FormField label="企业邮箱">
              <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@luyimei.com" className="field field-sm font-sign" />
            </FormField>
          </div>
          <FormField label="初始密码" hint="至少 8 位。开通后请当面或通过安全渠道告诉员工。">
            <div className="flex gap-2">
              <input type="text" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className="field field-sm font-sign" autoComplete="new-password" />
              <button type="button" onClick={() => setNewPassword(generateStrongPassword())} className="btn btn-sm btn-outline shrink-0">
                <Sparkles className="w-4 h-4" />
                生成
              </button>
            </div>
          </FormField>
          <FormField label="角色">
            <div className="segmented w-full" role="group" aria-label="角色">
              <button type="button" className="flex-1" aria-pressed={newRole === 'sales_rep'} onClick={() => setNewRole('sales_rep')}>
                销售代表
              </button>
              <button type="button" className="flex-1" aria-pressed={newRole === 'super_admin'} onClick={() => setNewRole('super_admin')}>
                超级管理员
              </button>
            </div>
          </FormField>
        </form>
      </Modal>

      {/* Delete one */}
      <Modal
        open={!!staffToDelete}
        onClose={() => setStaffToDelete(null)}
        size="sm"
        title="删除这个员工账号？"
        footer={
          <>
            <button type="button" onClick={() => setStaffToDelete(null)} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button type="button" onClick={handleSingleDeleteConfirm} className="btn btn-sm btn-danger">
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </>
        }
      >
        {staffToDelete && (
          <p className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-night">{staffToDelete.name}</strong>（{staffToDelete.email}）将无法再登录，名下的线索会退回公海。
          </p>
        )}
      </Modal>

      {/* Delete many */}
      <Modal
        open={isConfirmingBatchDelete}
        onClose={() => setIsConfirmingBatchDelete(false)}
        size="sm"
        title={`删除选中的 ${selectedStaffIds.size} 个账号？`}
        footer={
          <>
            <button type="button" onClick={() => setIsConfirmingBatchDelete(false)} className="btn btn-sm btn-ghost">
              取消
            </button>
            <button type="button" onClick={handleBatchDeleteConfirm} className="btn btn-sm btn-danger">
              <Trash2 className="w-4 h-4" />
              删除 {selectedStaffIds.size} 个
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">这些员工将无法再登录，名下线索退回公海。如果选中了你自己的账号，会自动跳过。</p>
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!staffToResetPassword}
        onClose={closeReset}
        title="重置密码"
        description={
          staffToResetPassword && (
            <>
              为 <strong className="text-night">{staffToResetPassword.name}</strong>（<span className="font-sign">{staffToResetPassword.phone}</span>）设置新密码，对方所有设备会被要求重新登录。
            </>
          )
        }
        footer={
          resetSuccessNotice ? (
            <button type="button" onClick={closeReset} className="btn btn-sm btn-dark">
              完成
            </button>
          ) : (
            <>
              <button type="button" onClick={closeReset} className="btn btn-sm btn-ghost">
                取消
              </button>
              <button type="submit" form="reset-pass-form" disabled={isSubmittingReset} className="btn btn-sm btn-primary">
                {isSubmittingReset ? '正在更新…' : '更新密码'}
              </button>
            </>
          )
        }
      >
        {resetSuccessNotice ? (
          <div className="anim-pop space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle className="w-4 h-4" />
              密码已更新
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-concrete px-4 py-3">
              <span className="font-sign text-lg font-semibold text-night break-all">{resetSuccessNotice}</span>
              <button type="button" onClick={handleCopyNewPassword} className="btn btn-sm btn-outline shrink-0">
                {hasCopiedResetPass ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {hasCopiedResetPass ? '已复制' : '复制'}
              </button>
            </div>
            <p className="text-[13px] text-slate-500">关闭后无法再次查看，请现在发给员工。</p>
          </div>
        ) : (
          <form id="reset-pass-form" onSubmit={handleConfirmResetPassword}>
            <FormField
              label={
                <span className="flex items-center justify-between">
                  新密码
                  <button type="button" onClick={handleGenerateRandomPassword} className="inline-flex items-center gap-1 text-[13px] font-semibold text-sky-deep">
                    <Sparkles className="w-3.5 h-3.5" />
                    换一个
                  </button>
                </span>
              }
              hint="至少 8 位。默认已生成一个 14 位随机密码。"
            >
              <div className="relative">
                <input
                  type={showResetPasswordPlain ? 'text' : 'password'}
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  className="field field-sm font-sign pe-10"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowResetPasswordPlain(!showResetPasswordPlain)}
                  className="absolute end-1 top-1/2 -translate-y-1/2 icon-btn"
                  aria-label={showResetPasswordPlain ? '隐藏密码' : '显示密码'}
                >
                  {showResetPasswordPlain ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FormField>
          </form>
        )}
      </Modal>
    </div>
  );
};
