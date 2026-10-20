import { PI_CSS } from './ProformaSheet';
import { normalizeClonedColorsForHtml2Canvas } from '../../../utils/html2canvasSafeClone';

/** A4 at 96 dpi: the sheet is laid out 794 px wide, so one page is 1123 px tall. */
const PAGE_W_PX = 794;
const PAGE_H_PX = 1123;
const TOP_MARGIN_PX = 40; // pages 2+ (page 1 has the sheet's own padding)
const BOTTOM_MARGIN_PX = 44; // room for the page number

/**
 * Where pages may end: the bottom edge of every block marked `data-pi-break`, relative to the sheet.
 * Rows and sections are never cut in half unless one is taller than a whole page.
 */
function breakPoints(sheet: HTMLElement): number[] {
  const top = sheet.getBoundingClientRect().top;
  const points = Array.from(sheet.querySelectorAll<HTMLElement>('[data-pi-break]')).map(el => Math.ceil(el.getBoundingClientRect().bottom - top));
  points.push(Math.ceil(sheet.getBoundingClientRect().height));
  return Array.from(new Set(points)).sort((a, b) => a - b);
}

/** The item table's header band and where the table ends, relative to the sheet. */
interface TableHead {
  top: number;
  bottom: number;
  tableBottom: number;
}

function tableHead(sheet: HTMLElement): TableHead | null {
  const head = sheet.querySelector<HTMLElement>('.pi-items thead');
  const table = sheet.querySelector<HTMLElement>('.pi-items');
  if (!head || !table) return null;
  const top = sheet.getBoundingClientRect().top;
  const h = head.getBoundingClientRect();
  return { top: Math.floor(h.top - top), bottom: Math.ceil(h.bottom - top), tableBottom: Math.ceil(table.getBoundingClientRect().bottom - top) };
}

/** A page that starts among the item rows repeats the column header on top, like the printed version. */
export const repeatsHead = (start: number, head: TableHead | null) => !!head && start >= head.bottom && start < head.tableBottom - 1;

export function paginate(points: number[], total: number, head: TableHead | null = null): [number, number][] {
  const pages: [number, number][] = [];
  let start = 0;
  while (start < total - 1) {
    const headH = pages.length > 0 && repeatsHead(start, head) ? head!.bottom - head!.top : 0;
    const room = (pages.length === 0 ? PAGE_H_PX : PAGE_H_PX - TOP_MARGIN_PX) - BOTTOM_MARGIN_PX - headH;
    // Never end a page right under the column header (it would sit alone at the bottom).
    const fits = points.filter(p => p > start && p - start <= room && (!head || p !== head.bottom));
    const end = fits.length ? fits[fits.length - 1] : Math.min(total, start + room);
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

/**
 * Renders the sheet into an A4 PDF Blob. Pages break between item rows and sections; every page
 * carries "PI number · Page x of n". (Text in this PDF is an image; use print → "Save as PDF" when
 * the customer needs to copy text.)
 */
/**
 * html2canvas draws some SVGs (the logo) incorrectly. The browser itself rasterizes them fine,
 * so swap each SVG <img> for a PNG copy while the PDF is rendered. Returns a function that undoes it.
 */
async function rasterizeSvgImages(root: HTMLElement): Promise<() => void> {
  const restore: (() => void)[] = [];
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || '';
    if (!/\.svg(\?|$)|^data:image\/svg/.test(src)) continue;
    try {
      const w = img.offsetWidth || img.naturalWidth || 200;
      const h = img.offsetHeight || img.naturalHeight || 50;
      const canvas = document.createElement('canvas');
      canvas.width = w * 3;
      canvas.height = h * 3;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png');
      img.setAttribute('src', png);
      await img.decode().catch(() => undefined);
      restore.push(() => img.setAttribute('src', src));
    } catch {
      // Leave this image as it is.
    }
  }
  return () => restore.forEach(r => r());
}

export async function renderPdf(sheet: HTMLElement, piNumber: string): Promise<Blob> {
  const [h2c, pdfLib] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const html2canvas = h2c.default;
  // jsPDF exposes the class as a named export (ESM) and, depending on the build, as the default too.
  const lib = pdfLib as unknown as { jsPDF?: typeof pdfLib.default; default: typeof pdfLib.default & { jsPDF?: typeof pdfLib.default } };
  const jsPDF = lib.jsPDF || lib.default.jsPDF || lib.default;
  const points = breakPoints(sheet);
  const head = tableHead(sheet);
  const height = Math.ceil(sheet.getBoundingClientRect().height);
  const scale = 2;
  if (!sheet.id) sheet.id = `pi-sheet-${Date.now()}`;
  const rootId = sheet.id;
  const undoImages = await rasterizeSvgImages(sheet);
  const canvas = await html2canvas(sheet, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: PAGE_W_PX,
    height,
    windowWidth: PAGE_W_PX + 40,
    scrollX: 0,
    scrollY: -window.scrollY,
    onclone: doc => normalizeClonedColorsForHtml2Canvas(doc, rootId)
  }).finally(undoImages);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const mmPerPx = 210 / PAGE_W_PX;
  const pages = paginate(points, height, head);
  pages.forEach(([from, to], i) => {
    if (i > 0) pdf.addPage();
    const headH = i > 0 && head && repeatsHead(from, head) ? head.bottom - head.top : 0;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((headH + to - from) * scale));
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    if (headH && head) {
      ctx.drawImage(canvas, 0, Math.round(head.top * scale), canvas.width, Math.round(headH * scale), 0, 0, slice.width, Math.round(headH * scale));
    }
    const bodyY = Math.round(headH * scale);
    ctx.drawImage(canvas, 0, Math.round(from * scale), canvas.width, slice.height - bodyY, 0, bodyY, slice.width, slice.height - bodyY);
    const y = i === 0 ? 0 : TOP_MARGIN_PX * mmPerPx;
    pdf.addImage(slice.toDataURL('image/jpeg', 0.94), 'JPEG', 0, y, 210, (headH + to - from) * mmPerPx, undefined, 'FAST');
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`${piNumber}  ·  Page ${i + 1} of ${pages.length}`, 105, 297 - 7, { align: 'center' });
  });
  return pdf.output('blob');
}

/**
 * Opens the browser's print dialog for the sheet alone. Printing keeps real text (copyable,
 * searchable) — choose "Save as PDF" as the printer to get a text PDF.
 */
let printPending = false;

export function printSheet(sheet: HTMLElement, title: string): void {
  // One print dialog at a time: repeated clicks while the frame is being prepared are ignored.
  if (printPending) return;
  printPending = true;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentWindow?.document;
  if (!frameDoc) {
    iframe.remove();
    printPending = false;
    window.print();
    return;
  }
  // Absolute URLs so the logo still loads inside the blank frame.
  const clone = sheet.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:')) img.setAttribute('src', new URL(src, window.location.href).href);
  });
  frameDoc.open();
  frameDoc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title.replace(/[<&>"]/g, '_')}</title><style>${PI_CSS}</style></head><body>${clone.outerHTML}</body></html>`
  );
  frameDoc.close();
  const images = Array.from(frameDoc.images);
  Promise.all(images.map(img => (img.complete ? Promise.resolve() : new Promise(r => ((img.onload = r), (img.onerror = r))))))
    .then(() => new Promise(r => setTimeout(r, 150)))
    .then(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 60_000);
    })
    .finally(() => {
      printPending = false;
    });
}
