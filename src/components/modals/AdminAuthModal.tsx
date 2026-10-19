import React, { useState, useEffect } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { adminApi } from '../../services/adminApi';
import { StaffAccount } from '../../types/admin';
import { X, Loader2, ShieldCheck, Phone, KeyRound } from 'lucide-react';
import { BrandMark } from '../common/BrandMark';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin: (staff: StaffAccount) => void;
  onShowToast: (msg: string) => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
  onShowToast
}) => {
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [passInput, setPassInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const account = phoneInput.trim();
    const pass = passInput.trim();

    if (!account) {
      onShowToast('请输入管理员邮箱或已开通的员工手机号。');
      return;
    }
    if (!pass || pass.length < 8) {
      onShowToast('请输入不少于 8 位字符的中台登录密码。');
      return;
    }

    setIsSubmitting(true);
    const safetyTimer = setTimeout(() => {
      setIsSubmitting(false);
    }, 10000);

    try {
      const result = await adminApi.verifyStaffLogin(account, pass);
      clearTimeout(safetyTimer);
      if (result.success && result.staff) {
        onSuccessLogin(result.staff);
        onShowToast(result.message);
        onClose();
        setPhoneInput('');
        setPassInput('');
      } else {
        onShowToast(result.message);
      }
    } catch (err) {
      clearTimeout(safetyTimer);
      console.error('Login error:', err);
      onShowToast('登录验证异常，请检查网络后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-night/60 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 sm:p-8 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="关闭窗口"
          className="absolute top-4 end-4 icon-btn"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <BrandMark className="w-11 h-11" />
          <div>
            <h2 id="admin-dialog-title" className="text-xl font-bold text-night">
              员工登录
            </h2>
            <p className="text-sm text-slate-500">登录路易美中台，处理线索和报价。</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="field-label">手机号或邮箱</span>
            <span className="relative block">
              <Phone className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                autoComplete="username"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder="员工手机号或管理员邮箱"
                className="field ps-9 font-sign"
              />
            </span>
          </label>

          <label className="block">
            <span className="field-label">密码</span>
            <span className="relative block">
              <KeyRound className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
                placeholder="至少 8 位"
                className="field ps-9"
              />
            </span>
          </label>

          <button type="submit" disabled={isSubmitting} className="btn btn-dark w-full !mt-6">
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在验证…
              </>
            ) : (
              '登录'
            )}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            仅限内部员工。快捷键 <span className="font-sign">Ctrl + Shift + A</span>
          </p>
        </form>
      </div>
    </div>
  );
};
