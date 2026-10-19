import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PI_CSS, ProformaSheet } from './ProformaSheet';
import { PiDocument } from './piDocument';

let cssInjected = false;
function useSheetCss() {
  useEffect(() => {
    if (cssInjected || document.getElementById('pi-sheet-css')) return;
    const style = document.createElement('style');
    style.id = 'pi-sheet-css';
    style.textContent = PI_CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }, []);
}

/**
 * Shows the sheet scaled to fit its column, and keeps an unscaled copy off-screen (the `ref`)
 * for PDF and print output, so the output never depends on the preview's zoom.
 */
export const SheetPreview = forwardRef<HTMLDivElement, { doc: PiDocument; maxHeight?: number }>(({ doc, maxHeight }, outputRef) => {
  useSheetCss();
  const boxRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    const box = boxRef.current;
    const sheet = sheetRef.current;
    if (!box || !sheet) return;
    const update = () => {
      setScale(Math.min(1, box.clientWidth / 794));
      setHeight(sheet.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div ref={boxRef} className="w-full" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <div style={{ height: height * scale, width: 794 * scale }} className="mx-auto">
          <div
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 794 }}
            className="shadow-[0_10px_30px_-12px_rgba(15,37,54,0.35)]"
          >
            <ProformaSheet ref={sheetRef} doc={doc} />
          </div>
        </div>
      </div>
      {createPortal(
        <div aria-hidden="true" style={{ position: 'fixed', left: -12000, top: 0, width: 794, pointerEvents: 'none' }}>
          <ProformaSheet ref={outputRef} doc={doc} />
        </div>,
        document.body
      )}
    </>
  );
});
SheetPreview.displayName = 'SheetPreview';
