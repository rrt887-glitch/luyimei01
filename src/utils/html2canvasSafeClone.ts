/**
 * Normalizes modern CSS color functions (oklch, oklab, color-mix, etc.)
 * into standard RGB/Hex inline styles on a cloned html2canvas document
 * so html2canvas can render Tailwind v4 elements without patching node_modules.
 */
export function normalizeClonedColorsForHtml2Canvas(clonedDoc: Document, rootElementId: string): void {
  const sheet = clonedDoc.getElementById(rootElementId);
  if (!sheet) return;

  sheet.style.boxShadow = 'none';
  sheet.style.borderRadius = '0';

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const toStandardRgb = (cssColor: string): string => {
    if (!cssColor || (!cssColor.includes('oklch') && !cssColor.includes('oklab') && !cssColor.includes('color('))) {
      return cssColor;
    }
    try {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = cssColor;
      return ctx.fillStyle;
    } catch {
      return '#111827';
    }
  };

  const elements = [sheet, ...Array.from(sheet.querySelectorAll<HTMLElement>('*'))];
  const colorProps: Array<keyof CSSStyleDeclaration> = [
    'color',
    'backgroundColor',
    'borderColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor'
  ];

  const win = clonedDoc.defaultView || window;
  for (const el of elements) {
    const computed = win.getComputedStyle(el);
    for (const prop of colorProps) {
      const val = computed[prop] as string;
      if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color('))) {
        (el.style as any)[prop] = toStandardRgb(val);
      }
    }
  }
}
