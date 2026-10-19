import { useDialog } from '../../hooks/useDialog';
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { Tone } from '../../config/leadStages';

/** Page title row: title + one-line purpose on the left, page actions on the right. */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
    <div className="min-w-0">
      <h1 className="adm-title">{title}</h1>
      {description && <p className="adm-sub max-w-[60ch]">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const Panel: React.FC<{
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
  as?: 'section' | 'div' | 'form';
  onSubmit?: (e: React.FormEvent) => void;
}> = ({ title, actions, className = '', bodyClassName = 'panel-body', children, as = 'section', onSubmit }) => {
  const Tag = as as React.ElementType;
  return (
    <Tag className={`panel ${className}`} onSubmit={onSubmit}>
      {(title || actions) && (
        <div className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
};

export const Chip: React.FC<{ tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string; title?: string }> = ({
  tone = 'slate',
  dot = true,
  children,
  className = '',
  title
}) => (
  <span className={`chip ${dot ? '' : 'no-dot'} ${className}`} data-tone={tone} title={title}>
    {children}
  </span>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  hint,
  action
}) => (
  <div className="py-14 px-6 text-center">
    {icon && <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-concrete text-slate-500 flex items-center justify-center">{icon}</div>}
    <p className="text-[15px] font-semibold text-night">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** Labelled form control wrapper. */
export const FormField: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  children,
  className = ''
}) => (
  <label className={`block ${className}`}>
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="block mt-1 text-[12.5px] text-slate-500">{hint}</span>}
  </label>
);

const useEscape = useDialog;

/** Centered dialog with header, scrollable body and optional footer. */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children?: React.ReactNode;
}> = ({ open, onClose, title, description, footer, size = 'md', children }) => {
  useEscape(open, onClose);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-night/50 backdrop-blur-[2px] animate-in" onClick={onClose} aria-hidden="true" />
      <div className={`relative w-full ${width} max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#e6ecf0]">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-night">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn -me-2 shrink-0" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[#e6ecf0] flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

/** Right-hand drawer for working on one record while keeping the list in view. */
export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ open, onClose, title, description, footer, children }) => {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-night/40 animate-in" onClick={onClose} aria-hidden="true" />
      <aside className="drawer-panel absolute inset-y-0 end-0 w-full sm:w-[460px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#e6ecf0]">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-night truncate">{title}</h2>
            {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn -me-2 shrink-0" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[#e6ecf0]">{footer}</div>}
      </aside>
    </div>
  );
};

/** Initials avatar for staff and customers. */
export const Avatar: React.FC<{ name?: string; size?: number; tone?: 'sky' | 'night' }> = ({ name = '', size = 32, tone = 'sky' }) => {
  const text = (name.trim().match(/[一-龥]/) ? name.trim().slice(-2) : name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2)).toUpperCase() || '?';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        tone === 'sky' ? 'bg-sky-wash text-sky-deep' : 'bg-night text-white'
      }`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
};
