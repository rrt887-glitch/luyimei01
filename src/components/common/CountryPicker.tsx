import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import flagSprite from '../../assets/flags.webp';
import { COUNTRY_DIAL_CODES, FLAG_SPRITE_COLUMNS } from '../../data/countries';
import { SupportedLanguage } from '../../types';

export interface CountryOption {
  iso: string;
  dial: string;
  name: string;
  /** English name, so a search in English always works whatever the site language. */
  nameEn: string;
  index: number;
}

const LOCALES: Record<SupportedLanguage, string> = { zh: 'zh-CN', en: 'en', ar: 'ar', ru: 'ru' };
// How these regions are written for a Guangzhou-based company's Chinese-language site.
const ZH_OVERRIDES: Record<string, string> = { TW: '中国台湾', HK: '中国香港', MO: '中国澳门' };

function displayNames(lang: SupportedLanguage): (iso: string) => string {
  try {
    const dn = new Intl.DisplayNames([LOCALES[lang]], { type: 'region' });
    return iso => (lang === 'zh' && ZH_OVERRIDES[iso]) || dn.of(iso) || iso;
  } catch {
    return iso => iso;
  }
}

export function getCountryOptions(lang: SupportedLanguage): CountryOption[] {
  const local = displayNames(lang);
  const english = displayNames('en');
  const collator = new Intl.Collator(LOCALES[lang]);
  return COUNTRY_DIAL_CODES.map(([iso, dial], index) => ({ iso, dial, name: local(iso), nameEn: english(iso), index })).sort(
    (a, b) => collator.compare(a.name, b.name)
  );
}

export function findCountry(iso: string): { iso: string; dial: string; index: number } | undefined {
  const index = COUNTRY_DIAL_CODES.findIndex(([code]) => code === iso);
  return index === -1 ? undefined : { iso, dial: COUNTRY_DIAL_CODES[index][1], index };
}

/** Best guess from the browser language (en-US → US); empty when unknown. */
export function guessCountryFromBrowser(): string {
  try {
    for (const tag of navigator.languages || [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && findCountry(region)) return region;
    }
  } catch {
    // ignore
  }
  return '';
}

/** Flag from the sprite (20×15). Renders an empty box when there is no flag for the code. */
export const Flag: React.FC<{ index?: number; className?: string }> = ({ index, className = '' }) => {
  const style: React.CSSProperties =
    index === undefined
      ? {}
      : {
          backgroundImage: `url(${flagSprite})`,
          backgroundSize: `${FLAG_SPRITE_COLUMNS * 20}px auto`,
          backgroundPosition: `-${(index % FLAG_SPRITE_COLUMNS) * 20}px -${Math.floor(index / FLAG_SPRITE_COLUMNS) * 15}px`
        };
  return <span aria-hidden="true" className={`inline-block w-5 h-[15px] shrink-0 rounded-[2px] bg-no-repeat ${className}`} style={style} />;
};

interface CountryPickerProps {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  lang: SupportedLanguage;
  placeholder: string;
  searchLabel: string;
  noResults: string;
  invalid?: boolean;
  /** Dial-code selector next to a phone input: the button shows only the flag and code. */
  compact?: boolean;
}

/** Searchable country list with flags and dialling codes. */
export const CountryPicker: React.FC<CountryPickerProps> = ({ id, value, onChange, lang, placeholder, searchLabel, noResults, invalid, compact }) => {
  const options = useMemo(() => getCountryOptions(lang), [lang]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find(o => o.iso === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return options;
    const direct = options.filter(
      o => o.name.toLowerCase().includes(q) || o.nameEn.toLowerCase().includes(q) || o.iso.toLowerCase() === q || o.dial.startsWith(q)
    );
    // Abbreviations such as 阿联 → 阿拉伯联合酋长国: the typed characters appear in order.
    const inOrder = (name: string) => {
      let i = 0;
      for (const ch of name.toLowerCase()) if (ch === q[i]) i++;
      return i === q.length;
    };
    const loose = q.length >= 2 ? options.filter(o => !direct.includes(o) && inOrder(o.name)) : [];
    return [...direct, ...loose];
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const i = selected ? options.indexOf(selected) : 0;
    setActive(Math.max(0, i));
    requestAnimationFrame(() => searchRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: CountryOption) => {
    onChange(o.iso);
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === 'Escape') {
      // Close only the list, not the dialog around it.
      e.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={compact ? 'relative shrink-0' : 'relative'}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`field flex items-center gap-2.5 text-start ${compact ? 'rounded-e-none !w-auto shrink-0 bg-concrete' : ''}`}
        aria-label={compact ? `${placeholder}${selected ? `: ${selected.name} +${selected.dial}` : ''}` : undefined}
      >
        {compact ? (
          selected ? (
            <>
              <Flag index={selected.index} />
              <span className="font-sign text-night" dir="ltr">
                +{selected.dial}
              </span>
            </>
          ) : (
            <span className="text-slate-400">+</span>
          )
        ) : selected ? (
          <>
            <Flag index={selected.index} />
            <span className="flex-1 truncate text-night">{selected.name}</span>
            <span className="font-sign text-slate-500" dir="ltr">+{selected.dial}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`anim-pop absolute z-20 mt-1.5 rounded-xl border border-line bg-white shadow-xl overflow-hidden ${compact ? 'start-0 w-[min(20rem,85vw)]' : 'w-full'}`}>
          <label className="relative block border-b border-line">
            <span className="sr-only">{searchLabel}</span>
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={searchLabel}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].iso}` : undefined}
              aria-autocomplete="list"
              className="w-full h-11 ps-9 pe-3 text-[15px] text-night bg-transparent outline-none"
            />
          </label>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">{noResults}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.iso}
                id={`${listId}-${o.iso}`}
                data-i={i}
                role="option"
                aria-selected={o.iso === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(o)}
                className={`flex items-center gap-2.5 px-3 py-2 text-[15px] cursor-pointer ${i === active ? 'bg-sky-wash' : ''} ${
                  o.iso === value ? 'font-semibold text-night' : 'text-slate-700'
                }`}
              >
                <Flag index={o.index} />
                <span className="flex-1 truncate">{o.name}</span>
                <span className="font-sign text-sm text-slate-500" dir="ltr">
                  +{o.dial}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** "+971 50 123 4567" → { iso: 'AE', number: '501234567' } using the longest matching dial code. */
export function splitPhone(raw: string | undefined): { iso: string; number: string } {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!String(raw || '').trim().startsWith('+') || !digits) return { iso: '', number: digits };
  const space = String(raw).trim().match(/^\+(\d{1,4})\s/);
  const candidates = COUNTRY_DIAL_CODES.filter(([, dial]) => (space ? dial === space[1] : digits.startsWith(dial)));
  const best = candidates.sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) return { iso: '', number: digits };
  // Shared codes (+1, +7, +44…): prefer the larger market.
  const preferred: Record<string, string> = { '1': 'US', '7': 'RU', '44': 'GB', '61': 'AU', '262': 'RE', '590': 'GP', '599': 'CW', '47': 'NO', '212': 'MA', '358': 'FI', '39': 'IT' };
  const iso = preferred[best[1]] || best[0];
  return { iso, number: digits.slice(best[1].length) };
}

/** Country dial-code picker + number, stored as "+<code> <digits>". */
export const WhatsAppInput: React.FC<{
  id: string;
  country: string;
  onCountry: (iso: string) => void;
  number: string;
  onNumber: (v: string) => void;
  lang: SupportedLanguage;
  labels: { country: string; search: string; none: string; placeholder: string };
  invalid?: boolean;
  describedBy?: string;
}> = ({ id, country, onCountry, number, onNumber, lang, labels, invalid, describedBy }) => (
  <div className="flex items-stretch" dir="ltr">
    <CountryPicker
      compact
      value={country}
      onChange={onCountry}
      lang={lang}
      placeholder={labels.country}
      searchLabel={labels.search}
      noResults={labels.none}
      invalid={invalid}
    />
    <input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      value={number}
      onChange={e => onNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
      placeholder={labels.placeholder}
      maxLength={20}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`field rounded-s-none -ms-px font-sign ${invalid ? 'field-error' : ''}`}
    />
  </div>
);

/** Full international number for storage, or '' when incomplete. */
export function joinPhone(iso: string, number: string): string {
  const c = findCountry(iso);
  const digits = number.replace(/\D/g, '').replace(/^0+/, '');
  if (!c || digits.length < 5 || c.dial.length + digits.length > 15) return '';
  return `+${c.dial} ${digits}`;
}
