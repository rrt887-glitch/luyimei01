import React, { useEffect, useState } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { useI18n } from '../../i18n';
import { api, SignupError } from '../../services/api';
import { adminApi } from '../../services/adminApi';
import { UserAccount, InquiryRecord } from '../../types';
import { StaffAccount } from '../../types/admin';
import { X, Loader2, Eye, EyeOff, LogOut, Lock, Clock, RefreshCw, Globe, MessageCircle, Mail } from 'lucide-react';
import { CountryPicker, Flag, findCountry, getCountryOptions, guessCountryFromBrowser } from '../common/CountryPicker';
import { createLocalSignupCaptcha } from '../../utils/localSignupFallback';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotification: (msg: string) => void;
  onOpenAdminLogin?: () => void;
  onSuccessAdminLogin?: (staff: StaffAccount) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));

/** Password input with a show/hide toggle. */
const PasswordField: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  showLabel: string;
  hideLabel: string;
}> = ({ id, value, onChange, autoComplete, placeholder, showLabel, hideLabel }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={8}
        required
        className="field pe-11"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute end-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-night"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onNotification,
  onOpenAdminLogin,
  onSuccessAdminLogin
}) => {
  const { d, lang } = useI18n();
  const t = d.account;
  const err = (reason: string, vars: Record<string, string | number> = {}) =>
    fill((t.errors as Record<string, string>)[reason] || t.errors.unknown, vars);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [userInquiries, setUserInquiries] = useState<InquiryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Sign in
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register: name, email, password, country, WhatsApp, code (in that order on screen)
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCountry, setRegCountry] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [captcha, setCaptcha] = useState<{ id: string; src: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  // Why the picture could not be loaded ('' while fine), shown under the field.
  const [captchaError, setCaptchaError] = useState('');

  useDialog(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    const user = api.getCurrentUser();
    setCurrentUser(user);
    if (user) {
      setUserInquiries(api.getUserInquiries(user.id));
      api.fetchUserInquiries(user.id).then(setUserInquiries).catch(() => {});
    } else {
      setUserInquiries([]);
    }
    setRegCountry(prev => prev || guessCountryFromBrowser());
  }, [isOpen]);

  // A fresh picture whenever the register form is shown; each one can be submitted once.
  const loadCaptcha = async () => {
    setCaptchaLoading(true);
    setCaptchaError('');
    setCaptchaAnswer('');
    try {
      setCaptcha(await api.getSignupCaptcha());
    } catch (e) {
      const reason = (e as SignupError).reason;
      if (reason === 'too_many') {
        setCaptcha(null);
        setCaptchaError(t.errors.too_many);
      } else {
        setCaptcha(createLocalSignupCaptcha());
        setCaptchaError('');
      }
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && tab === 'register' && !currentUser) void loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, currentUser]);

  if (!isOpen) return null;

  const switchTab = (next: 'login' | 'register') => {
    setTab(next);
    setFormError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = loginId.trim();
    const pass = loginPassword.trim();
    setFormError('');
    if (!id) return setFormError(t.errors.invalid_email);
    if (pass.length < 8) return setFormError(t.errors.weak_password);

    setBusy(true);
    try {
      // Staff sign in with their phone number and go straight to the console.
      if (adminApi.isStaffIdentifier(id)) {
        const staffResult = await adminApi.verifyStaffLogin(id, pass);
        if (staffResult.success && staffResult.staff) {
          api.logout();
          onNotification(staffResult.message);
          setLoginId('');
          setLoginPassword('');
          onClose();
          if (onSuccessAdminLogin) onSuccessAdminLogin(staffResult.staff);
          else onOpenAdminLogin?.();
          return;
        }
        if (!id.includes('@')) {
          setFormError(staffResult.message);
          return;
        }
      }
      if (!EMAIL_PATTERN.test(id)) return setFormError(t.errors.invalid_email);
      const user = await api.login(id, pass);
      setCurrentUser(user);
      setUserInquiries(await api.fetchUserInquiries(user.id));
      setLoginPassword('');
      onNotification(fill(t.welcomeBack, { name: user.name || '' }));
    } catch {
      setFormError(t.errors.login_failed);
    } finally {
      setBusy(false);
    }
  };

  const country = findCountry(regCountry);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const name = regName.trim();
    const email = regEmail.trim().toLowerCase();
    const digits = regWhatsapp.replace(/\D/g, '');
    if (name.length < 2) return setFormError(t.errors.invalid_name);
    if (!EMAIL_PATTERN.test(email)) return setFormError(t.errors.invalid_email);
    if (regPassword.trim().length < 8) return setFormError(t.errors.weak_password);
    if (!country) return setFormError(t.errors.invalid_country);
    if (digits.length < 5 || digits.length + country.dial.length > 15) return setFormError(t.errors.invalid_whatsapp);
    if (!captcha) {
      void loadCaptcha();
      return setFormError(t.errors.captcha_required);
    }
    if (!captchaAnswer.trim()) return setFormError(t.errors.captcha_required);

    const countryName = getCountryOptions('en').find(o => o.iso === country.iso)?.name || country.iso;
    setBusy(true);
    try {
      const user = await api.register({
        name,
        email,
        password: regPassword,
        // Stored in English so the CRM reads the same whatever language the buyer used.
        country: countryName,
        dialCode: country.dial,
        whatsapp: digits,
        captchaId: captcha.id,
        captchaAnswer
      });
      setCurrentUser(user);
      setUserInquiries(api.getUserInquiries(user.id));
      onNotification(t.registered);
      setRegName('');
      setRegEmail('');
      setRegPassword('');
      setRegWhatsapp('');
      setCaptchaAnswer('');
    } catch (e) {
      const se = e as SignupError;
      setFormError(err(se.reason || 'unknown'));
      if (se.reason === 'email_taken') setLoginId(email);
      // The server has used up this picture; show a new one for the next try.
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setUserInquiries([]);
    onNotification(t.loggedOut);
  };

  // Product quote requests are stored with a Chinese first line for the console; show the model instead.
  const describeInquiry = (message: string) => {
    const m = message.match(/^询价产品：.*?（型号 (.+?)）/);
    return m && lang !== 'zh' ? `${d.quote.productLabel}: ${m[1]}` : message.split('\n')[0];
  };

  const statusLabel = (inq: InquiryRecord) =>
    inq.syncStatus === 'queued_local'
      ? t.statusQueued
      : inq.status === 'contacted'
        ? t.statusContacted
        : inq.status === 'reviewing'
          ? t.statusReviewing
          : t.statusPending;

  const staffLink = onOpenAdminLogin && (
    <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-[13px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" />
        {t.staffLabel}
      </span>
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenAdminLogin();
        }}
        className="font-semibold text-slate-700 hover:text-night hover:underline"
      >
        {t.staffLogin}
      </button>
    </div>
  );

  const errorBox = formError && (
    <p role="alert" className="anim-pop rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
      {formError}
    </p>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
    >
      <div className="absolute inset-0 bg-night/60 backdrop-blur-sm animate-in" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-[30rem] max-h-[94vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <button onClick={onClose} aria-label={d.dialog.close} className="icon-btn absolute top-4 end-4 z-10">
          <X className="w-5 h-5" />
        </button>

        {currentUser ? (
          <div className="p-6 sm:p-8">
            <p className="text-sm text-slate-500">{t.buyerCenter}</p>
            <h2 id="account-dialog-title" className="mt-1 text-2xl font-bold text-night pe-10">
              {currentUser.name}
            </h2>

            <dl className="mt-5 grid gap-3 rounded-xl bg-concrete p-4 text-sm">
              <div className="flex items-center gap-3">
                <dt className="sr-only">{t.email}</dt>
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <dd className="truncate text-night">{currentUser.email}</dd>
              </div>
              {currentUser.phone && (
                <div className="flex items-center gap-3">
                  <dt className="sr-only">{t.whatsapp}</dt>
                  <MessageCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  <dd className="font-sign text-night" dir="ltr">
                    {currentUser.phone}
                  </dd>
                </div>
              )}
              {currentUser.country && (
                <div className="flex items-center gap-3">
                  <dt className="sr-only">{t.country}</dt>
                  <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                  <dd className="text-night">{currentUser.country}</dd>
                </div>
              )}
            </dl>

            <h3 className="mt-6 mb-2.5 text-sm font-semibold text-night">
              {t.myInquiries}
              <span className="ms-1.5 font-sign text-slate-400">{userInquiries.length}</span>
            </h3>
            {userInquiries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-slate-500">{t.inquiriesEmpty}</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto divide-y divide-line rounded-xl border border-line">
                {userInquiries.map(inq => (
                  <li key={inq.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-night truncate">{inq.needType}</span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          inq.syncStatus === 'queued_local'
                            ? 'text-amber-700'
                            : inq.status === 'contacted'
                              ? 'text-emerald-700'
                              : 'text-sky-deep'
                        }`}
                      >
                        {statusLabel(inq)}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 line-clamp-1">{describeInquiry(inq.message)}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 font-sign">
                      <Clock className="w-3 h-3" />
                      {new Date(inq.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <button onClick={handleLogout} className="btn btn-outline w-full mt-6">
              <LogOut className="w-4 h-4" />
              {t.logout}
            </button>
            {staffLink}
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <h2 id="account-dialog-title" className="text-2xl font-bold text-night pe-10">
              {tab === 'login' ? t.title : t.registerTitle}
            </h2>
            <p className="mt-1.5 text-[15px] text-slate-500">{tab === 'login' ? t.subtitle : t.registerSubtitle}</p>

            <div className="segmented w-full mt-5" role="group" aria-label={t.title}>
              <button type="button" className="flex-1" aria-pressed={tab === 'login'} onClick={() => switchTab('login')}>
                {t.tabLogin}
              </button>
              <button type="button" className="flex-1" aria-pressed={tab === 'register'} onClick={() => switchTab('register')}>
                {t.tabRegister}
              </button>
            </div>

            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="acc-login-id" className="field-label">
                    {t.loginId}
                  </label>
                  <input
                    id="acc-login-id"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    value={loginId}
                    onChange={e => setLoginId(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    className="field"
                    dir="ltr"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">{t.loginIdHint}</p>
                </div>
                <div>
                  <label htmlFor="acc-login-pass" className="field-label">
                    {t.password}
                  </label>
                  <PasswordField
                    id="acc-login-pass"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    autoComplete="current-password"
                    placeholder={t.passwordPlaceholder}
                    showLabel={t.showPassword}
                    hideLabel={t.hidePassword}
                  />
                </div>
                {errorBox}
                <button type="submit" disabled={busy} className="btn btn-primary w-full">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {busy ? t.loggingIn : t.loginBtn}
                </button>
                <p className="text-center text-sm text-slate-500">
                  {t.noAccount}{' '}
                  <button type="button" onClick={() => switchTab('register')} className="font-semibold text-sky-deep hover:underline">
                    {t.goRegister}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="acc-reg-name" className="field-label">
                    {t.name}
                  </label>
                  <input
                    id="acc-reg-name"
                    type="text"
                    autoComplete="name"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    maxLength={120}
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="acc-reg-email" className="field-label">
                    {t.email}
                  </label>
                  <input
                    id="acc-reg-email"
                    type="email"
                    autoComplete="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    maxLength={150}
                    className="field"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label htmlFor="acc-reg-pass" className="field-label">
                    {t.password}
                  </label>
                  <PasswordField
                    id="acc-reg-pass"
                    value={regPassword}
                    onChange={setRegPassword}
                    autoComplete="new-password"
                    placeholder={t.passwordPlaceholder}
                    showLabel={t.showPassword}
                    hideLabel={t.hidePassword}
                  />
                </div>
                <div>
                  <label htmlFor="acc-reg-country" className="field-label">
                    {t.country}
                  </label>
                  <CountryPicker
                    id="acc-reg-country"
                    value={regCountry}
                    onChange={setRegCountry}
                    lang={lang}
                    placeholder={t.countryPlaceholder}
                    searchLabel={t.countrySearch}
                    noResults={t.countryNone}
                  />
                </div>
                <div>
                  <label htmlFor="acc-reg-wa" className="field-label">
                    {t.whatsapp}
                  </label>
                  <div className="flex items-stretch rounded-lg" dir="ltr">
                    <span className="inline-flex items-center gap-2 px-3 rounded-s-lg border border-e-0 border-line bg-concrete text-[15px] font-sign text-night shrink-0">
                      {country ? <Flag index={country.index} /> : <Globe className="w-4 h-4 text-slate-400" />}
                      <bdi dir="ltr">{country ? `+${country.dial}` : '+'}</bdi>
                    </span>
                    <input
                      id="acc-reg-wa"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={regWhatsapp}
                      onChange={e => setRegWhatsapp(e.target.value.replace(/[^\d\s-]/g, ''))}
                      placeholder={t.whatsappPlaceholder}
                      maxLength={20}
                      className="field rounded-s-none font-sign"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="acc-reg-captcha" className="field-label">
                    {t.captcha}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="acc-reg-captcha"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={captchaAnswer}
                      onChange={e => setCaptchaAnswer(e.target.value.replace(/[^0-9a-z]/gi, '').slice(0, 8).toUpperCase())}
                      placeholder={t.captchaPlaceholder}
                      className={`field !min-h-[52px] text-lg font-sign ${captchaAnswer ? 'tracking-[0.25em]' : ''}`}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => void loadCaptcha()}
                      disabled={captchaLoading}
                      className="relative shrink-0 w-[150px] h-[52px] overflow-hidden rounded-lg border border-line bg-[#eef4f8] hover:border-slate-400"
                      aria-label={t.captchaRefresh}
                      title={t.captchaRefresh}
                    >
                      {captcha && <img src={captcha.src} alt={t.captchaAlt} className="w-full h-full object-contain" draggable={false} />}
                      {(captchaLoading || !captcha) && (
                        <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-slate-500 bg-concrete/80">
                          {captchaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {!captchaLoading && captchaError && t.captchaRetry}
                        </span>
                      )}
                    </button>
                  </div>
                  {captchaError ? (
                    <p role="alert" className="mt-1.5 text-xs text-rose-700">
                      {captchaError}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-400">{t.captchaHint}</p>
                  )}
                </div>
                {errorBox}
                <button type="submit" disabled={busy} className="btn btn-primary w-full">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {busy ? t.registering : t.registerBtn}
                </button>
                <p className="text-center text-sm text-slate-500">
                  {t.haveAccount}{' '}
                  <button type="button" onClick={() => switchTab('login')} className="font-semibold text-sky-deep hover:underline">
                    {t.goLogin}
                  </button>
                </p>
              </form>
            )}
            {staffLink}
          </div>
        )}
      </div>
    </div>
  );
};
