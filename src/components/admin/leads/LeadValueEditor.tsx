import React, { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { formatLeadValueUsd, hasLeadValue, toCents } from '../../../utils/format';

/** Click-to-edit USD valuation. Enter saves, Escape cancels. */
export const LeadValueEditor: React.FC<{
  value?: number;
  onSave?: (next: number) => Promise<void> | void;
  size?: 'md' | 'lg';
}> = ({ value, onSave, size = 'md' }) => {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');

  const commit = async () => {
    const parsed = Math.max(0, toCents(Number(input) || 0));
    setEditing(false);
    if (onSave && parsed !== (value || 0)) await onSave(parsed);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-sign text-slate-500">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="field field-sm !min-h-8 w-28 font-sign"
          aria-label="估值（美元）"
        />
        <button type="button" onClick={commit} className="icon-btn !w-8 !h-8 !text-emerald-700 hover:!bg-emerald-50" aria-label="保存估值">
          <Check className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setEditing(false)} className="icon-btn !w-8 !h-8" aria-label="取消">
          <X className="w-4 h-4" />
        </button>
      </span>
    );
  }

  const valued = hasLeadValue(value);
  return (
    <span className="group/val inline-flex items-center gap-1">
      <span
        className={`font-sign font-semibold ${size === 'lg' ? 'text-xl' : 'text-base'} ${valued ? 'text-night' : 'text-slate-400 !font-sans !text-sm font-medium'}`}
      >
        {formatLeadValueUsd(value)}
      </span>
      {onSave && (
        <button
          type="button"
          onClick={() => {
            setInput(String(value || ''));
            setEditing(true);
          }}
          className="icon-btn !w-7 !h-7 opacity-60 group-hover/val:opacity-100"
          aria-label="修改估值"
          title="修改估值"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
};
