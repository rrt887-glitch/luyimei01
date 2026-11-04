import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Save, UserRound } from 'lucide-react';
import { FormField, Modal } from './AdminUI';
import { StaffAccount } from '../../types/admin';
import { adminApi } from '../../services/adminApi';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../../config/staffRoles';

/** 我的账号: every role edits its own name, login phone and password. */
export const MyAccountModal: React.FC<{ staff: StaffAccount; onClose: () => void; onShowToast: (m: string) => void }> = ({ staff, onClose, onShowToast }) => {
  const [section, setSection] = useState<'profile' | 'password'>('profile');
  const [name, setName] = useState(staff.name);
  const [phone, setPhone] = useState(staff.phone);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saveProfile = async () => {
    setError('');
    setBusy(true);
    try {
      const before = staff.phone;
      const updated = await adminApi.updateOwnProfile({ name, phone });
      onShowToast(updated.phone !== before ? `已保存。以后请用 ${updated.phone} 登录` : '已保存');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setError('');
    if (next !== confirm) return setError('两次输入的新密码不一致。');
    setBusy(true);
    try {
      await adminApi.changeOwnPassword(current, next);
      onShowToast('密码已修改，下次登录请使用新密码');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pwType = show ? 'text' : 'password';
  return (
    <Modal
      open
      onClose={onClose}
      title="我的账号"
      description={`${ROLE_LABEL[staff.role]}：${ROLE_DESCRIPTION[staff.role]}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-sm btn-outline">取消</button>
          <button type="button" disabled={busy} onClick={() => void (section === 'profile' ? saveProfile() : savePassword())} className="btn btn-sm btn-dark">
            <Save className="w-4 h-4" />
            {busy ? '保存中…' : section === 'profile' ? '保存资料' : '修改密码'}
          </button>
        </>
      }
    >
      <div className="segmented w-full mb-4" role="group" aria-label="修改内容">
        <button type="button" className="flex-1" aria-pressed={section === 'profile'} onClick={() => { setSection('profile'); setError(''); }}>
          <UserRound className="w-4 h-4" />
          账号信息
        </button>
        <button type="button" className="flex-1" aria-pressed={section === 'password'} onClick={() => { setSection('password'); setError(''); }}>
          <KeyRound className="w-4 h-4" />
          登录密码
        </button>
      </div>

      {section === 'profile' ? (
        <div className="grid gap-3">
          <FormField label="姓名" hint="显示在中台、操作日志和你名下的线索上">
            <input type="text" maxLength={100} value={name} onChange={e => setName(e.target.value)} className="field field-sm" />
          </FormField>
          <FormField label="登录手机号" hint="修改后用新手机号登录，密码不变">
            <input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} className="field field-sm font-sign" />
          </FormField>
        </div>
      ) : (
        <div className="grid gap-3">
          <FormField label="当前密码">
            <input type={pwType} value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" className="field field-sm font-sign" />
          </FormField>
          <FormField label="新密码" hint="至少 8 位，建议包含字母和数字">
            <input type={pwType} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" className="field field-sm font-sign" />
          </FormField>
          <FormField label="再次输入新密码">
            <input type={pwType} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" className="field field-sm font-sign" />
          </FormField>
          <button type="button" onClick={() => setShow(v => !v)} className="btn btn-sm btn-ghost justify-self-start">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {show ? '隐藏密码' : '显示密码'}
          </button>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Modal>
  );
};
