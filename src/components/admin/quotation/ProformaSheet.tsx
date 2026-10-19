import React from 'react';
import { PiDocument, showsFreight, showsInsurance } from './piDocument';
import {
  PiLabelKey,
  PiLang,
  countryForDocument,
  incotermDef,
  money,
  piDate,
  piDir,
  piLabel,
  priceTermText,
  qty,
  unitLabel,
  usdInChineseCapitals,
  usdInWords,
  PI_LABELS
} from './piText';

/**
 * The proforma invoice itself. Styled only by PI_CSS (no Tailwind), so the console preview, the
 * downloaded PDF and the print window are the same document. Elements marked `data-pi-break` are
 * the places a page may end when the PDF is split into A4 pages.
 */
export const PI_CSS = `
.pi-sheet{--ink:#14202b;--muted:#5b6875;--line:#d7dee5;--soft:#f3f6f8;--accent:#0f2536;--accent2:#0b7fb3;
  box-sizing:border-box;width:794px;padding:44px 48px 40px;background:#fff;color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei","Noto Sans SC","Noto Sans Arabic",Tahoma,sans-serif;
  font-size:11px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pi-sheet *{box-sizing:border-box}
.pi-num{direction:ltr;unicode-bidi:isolate;white-space:nowrap}
.pi-free{unicode-bidi:plaintext}
.pi-sheet[dir=rtl] .pi-free{text-align:right}
.pi-zh{color:var(--muted);font-weight:400}
.pi-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:2px solid var(--accent)}
.pi-brand{display:flex;gap:12px;min-width:0}
.pi-logo{height:40px;width:auto;flex:none}
.pi-co{font-size:13px;font-weight:700;letter-spacing:.01em;line-height:1.3}
.pi-co-zh{font-size:11.5px;font-weight:600;margin-top:1px}
.pi-co-meta{color:var(--muted);margin-top:4px;font-size:10px;line-height:1.5}
.pi-title{text-align:end;flex:none}
.pi-title h2{margin:0;font-size:20px;font-weight:800;letter-spacing:.06em;color:var(--accent);line-height:1.15}
.pi-title h2 .pi-zh{display:block;font-size:13px;letter-spacing:.3em;color:var(--accent);font-weight:600;margin-top:2px}
.pi-meta{margin-top:10px;border-collapse:collapse;margin-inline-start:auto}
.pi-meta td{padding:1.5px 0;font-size:10.5px;vertical-align:top}
.pi-meta td:first-child{color:var(--muted);padding-inline-end:12px;text-align:start}
.pi-meta td:last-child{font-weight:600;text-align:end}
.pi-meta .pi-zh{margin-inline-start:4px}
.pi-parties{display:grid;grid-template-columns:1fr 1.15fr;gap:14px;margin:18px 0}
.pi-box{border:1px solid var(--line);border-radius:6px;padding:10px 12px}
.pi-box h2{margin:0 0 6px;font-size:10px;font-weight:700;text-transform:none;color:var(--accent2);letter-spacing:.02em}
.pi-box h2 .pi-zh{margin-inline-start:6px;color:var(--accent2);opacity:.8}
.pi-buyer-co{font-size:12.5px;font-weight:700;margin-bottom:3px}
.pi-kv{width:100%;border-collapse:collapse}
.pi-kv td{padding:2px 0;vertical-align:top;font-size:10.5px}
.pi-kv td:first-child{color:var(--muted);white-space:nowrap;padding-inline-end:10px;width:1%}
.pi-kv td:first-child .pi-zh{margin-inline-start:4px}
.pi-kv td:last-child{font-weight:600}
.pi-items{width:100%;border-collapse:collapse;margin-top:4px}
.pi-items th{background:var(--accent);color:#fff;font-size:9.5px;font-weight:700;padding:7px 8px;text-align:start;vertical-align:bottom;line-height:1.3}
.pi-items th .pi-zh{display:block;color:#c9d6e1;font-weight:500}
.pi-items th.pi-r,.pi-items td.pi-r{text-align:end}
.pi-items th.pi-c,.pi-items td.pi-c{text-align:center}
.pi-items td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:10.5px}
.pi-items tbody tr:nth-child(even) td{background:var(--soft)}
.pi-items .pi-name{font-weight:700;font-size:11px}
.pi-items .pi-name .pi-zh{display:block;font-weight:500;font-size:10.5px;color:var(--ink)}
.pi-items .pi-spec{color:var(--muted);font-size:9.5px;margin-top:2px;white-space:pre-line}
.pi-items .pi-model{font-family:"Bahnschrift","DIN Alternate",Menlo,Consolas,monospace;font-size:10px;white-space:nowrap}
.pi-sum{display:flex;justify-content:flex-end;margin-top:10px}
.pi-sum table{width:340px;border-collapse:collapse}
.pi-sum td{padding:3px 0;font-size:10.5px}
.pi-sum td:last-child{text-align:end}
.pi-sum td:first-child .pi-zh{margin-inline-start:4px}
.pi-sum .pi-total td{border-top:2px solid var(--accent);padding-top:7px;font-size:13px;font-weight:800;color:var(--accent)}
.pi-sum .pi-total td:first-child{font-size:11px}
.pi-sum .pi-total td:last-child{white-space:nowrap;padding-inline-start:12px;vertical-align:top}
.pi-sum .pi-split td{color:var(--muted);font-size:10px}
.pi-words{margin-top:10px;padding:8px 12px;background:var(--soft);border-radius:6px;font-size:10px}
.pi-words b{color:var(--muted);font-weight:600;margin-inline-end:8px}
.pi-words div+div{margin-top:2px}
.pi-foot{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.pi-foot p{margin:0;white-space:pre-line;font-size:10px}
.pi-sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:34px}
.pi-sign-box{position:relative;min-height:88px;display:flex;flex-direction:column;justify-content:flex-end}
.pi-sign-line{border-top:1px solid var(--ink);padding-top:5px;font-size:10px;font-weight:600}
.pi-sign-line .pi-zh{display:block}
.pi-sign-co{font-size:9.5px;color:var(--muted);margin-bottom:8px}
.pi-stamp{position:absolute;inset-inline-end:20px;bottom:6px;max-height:110px;max-width:150px;opacity:.92}
@media print{
  @page{size:A4 portrait;margin:12mm 12mm 14mm}
  html,body{margin:0;background:#fff}
  .pi-sheet{width:auto;padding:0}
  .pi-items thead{display:table-header-group}
  .pi-items tr,.pi-sum,.pi-words,.pi-foot,.pi-sign,.pi-box{break-inside:avoid}
}
`;

const L: React.FC<{ k: PiLabelKey; lang: PiLang }> = ({ k, lang }) => {
  const [main, zh] = piLabel(k, lang);
  return (
    <>
      {main}
      {zh && <span className="pi-zh"> {zh}</span>}
    </>
  );
};

const Num: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="pi-num">{children}</span>;

export const ProformaSheet = React.forwardRef<HTMLDivElement, { doc: PiDocument }>(({ doc }, ref) => {
  const { lang } = doc;
  const term = incotermDef(doc.incoterm);
  const termText = priceTermText(doc.incoterm, doc.portOfLoading, doc.portOfDischarge);
  const destination = countryForDocument(doc.buyer.destination, lang);
  const deposit = Math.min(100, Math.max(0, doc.depositPercent || 0));
  const remarks = [doc.remarks, doc.standardTerms].map(s => (s || '').trim()).filter(Boolean).join('\n');
  const contactLine = [doc.seller.phone && `Tel: ${doc.seller.phone}`, doc.seller.email && `Email: ${doc.seller.email}`, doc.seller.website]
    .filter(Boolean)
    .join('   ');
  const validText = doc.validUntil
    ? `${piDate(doc.validUntil, lang)}${doc.validDays ? ` (${doc.validDays} ${lang === 'bilingual' ? PI_LABELS.days.en : PI_LABELS.days[lang]})` : ''}`
    : '';
  const termsRows: [PiLabelKey, string][] = [
    ['priceTerm', `${termText}${lang === 'bilingual' ? ` (${term.zh})` : ''}`],
    ['portLoading', doc.portOfLoading],
    ['portDischarge', doc.portOfDischarge],
    ['payment', doc.payment],
    ['delivery', doc.deliveryTime],
    ['packing', doc.packing],
    ['origin', lang === 'bilingual' ? `${PI_LABELS.originValue.en} ${PI_LABELS.originValue.zh}` : PI_LABELS.originValue[lang]]
  ];

  return (
    <div ref={ref} className="pi-sheet" dir={piDir(lang)} lang={lang === 'bilingual' ? 'en' : lang}>
      <div className="pi-head" data-pi-break>
        <div className="pi-brand">
          {doc.logoUrl && <img className="pi-logo" src={doc.logoUrl} alt="" crossOrigin="anonymous" />}
          <div style={{ minWidth: 0 }}>
            <div className="pi-co" dir="ltr">{doc.seller.nameEn}</div>
            {doc.seller.nameZh && <div className="pi-co-zh">{doc.seller.nameZh}</div>}
            <div className="pi-co-meta" dir="ltr">
              {doc.seller.address}
              {contactLine && (
                <>
                  <br />
                  {contactLine}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="pi-title">
          <h2>
            <L k="title" lang={lang} />
          </h2>
          <table className="pi-meta">
            <tbody>
              <tr>
                <td>
                  <L k="piNo" lang={lang} />
                </td>
                <td>
                  <Num>{doc.number}</Num>
                </td>
              </tr>
              <tr>
                <td>
                  <L k="date" lang={lang} />
                </td>
                <td>{piDate(doc.date, lang)}</td>
              </tr>
              {validText && (
                <tr>
                  <td>
                    <L k="validUntil" lang={lang} />
                  </td>
                  <td>{validText}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pi-parties" data-pi-break>
        <div className="pi-box">
          <h2>
            <L k="buyer" lang={lang} />
          </h2>
          {doc.buyer.company && <div className="pi-buyer-co pi-free">{doc.buyer.company}</div>}
          <table className="pi-kv">
            <tbody>
              {(
                [
                  ['attn', doc.buyer.name],
                  ['contact', doc.buyer.contact],
                  ['address', doc.buyer.address],
                  ['destination', destination]
                ] as [PiLabelKey, string][]
              )
                .filter(([, v]) => v && v.trim())
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <L k={k} lang={lang} />
                    </td>
                    <td className="pi-free">{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="pi-box">
          <h2>
            <L k="terms" lang={lang} />
          </h2>
          <table className="pi-kv">
            <tbody>
              {termsRows
                .filter(([, v]) => v && v.trim())
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <L k={k} lang={lang} />
                    </td>
                    <td className="pi-free">{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <table className="pi-items">
        <thead>
          <tr data-pi-break>
            <th className="pi-c" style={{ width: 30 }}>
              <L k="colNo" lang={lang} />
            </th>
            <th>
              <L k="colItem" lang={lang} />
            </th>
            <th>
              <L k="colModel" lang={lang} />
            </th>
            <th className="pi-r">
              <L k="colQty" lang={lang} />
            </th>
            <th className="pi-r">
              <L k="colPrice" lang={lang} /> (USD)
            </th>
            <th className="pi-r">
              <L k="colAmount" lang={lang} /> (USD)
            </th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, i) => (
            <tr key={i} data-pi-break>
              <td className="pi-c">
                <Num>{i + 1}</Num>
              </td>
              <td>
                <div className="pi-name pi-free">
                  {item.name}
                  {item.nameZh && item.nameZh !== item.name && <span className="pi-zh">{item.nameZh}</span>}
                </div>
                {(item.spec || item.specZh) && (
                  <div className="pi-spec pi-free">{[item.spec, item.specZh && item.specZh !== item.spec ? item.specZh : ''].filter(Boolean).join('\n')}</div>
                )}
              </td>
              <td>
                <span className="pi-model" dir="ltr">
                  {item.model}
                </span>
              </td>
              <td className="pi-r">
                <Num>{qty(item.quantity)}</Num> {unitLabel(item.unit, lang)}
              </td>
              <td className="pi-r">
                <Num>{money(item.unitPriceUsd)}</Num>
              </td>
              <td className="pi-r">
                <Num>
                  <b>{money(item.amountUsd)}</b>
                </Num>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pi-sum" data-pi-break>
        <table>
          <tbody>
            <tr>
              <td>
                <L k="subtotal" lang={lang} />
              </td>
              <td>
                <Num>{money(doc.subtotal)}</Num>
              </td>
            </tr>
            {showsFreight(doc.incoterm, doc.freight) && (
              <tr>
                <td>
                  <L k="freight" lang={lang} />
                </td>
                <td>
                  <Num>{money(doc.freight)}</Num>
                </td>
              </tr>
            )}
            {showsInsurance(doc.incoterm, doc.insurance) && (
              <tr>
                <td>
                  <L k="insurance" lang={lang} />
                </td>
                <td>
                  <Num>{money(doc.insurance)}</Num>
                </td>
              </tr>
            )}
            {doc.discount > 0 && (
              <tr>
                <td>
                  <L k="discount" lang={lang} />
                </td>
                <td>
                  <Num>-{money(doc.discount)}</Num>
                </td>
              </tr>
            )}
            <tr className="pi-total">
              <td>
                <L k="total" lang={lang} /> <span className="pi-num">({termText})</span>
              </td>
              <td>
                <Num>USD {money(doc.total)}</Num>
              </td>
            </tr>
            {deposit > 0 && deposit < 100 && (
              <>
                <tr className="pi-split">
                  <td>
                    <L k="deposit" lang={lang} /> <Num>{deposit}%</Num>
                  </td>
                  <td>
                    <Num>{money((doc.total * deposit) / 100)}</Num>
                  </td>
                </tr>
                <tr className="pi-split">
                  <td>
                    <L k="balance" lang={lang} /> <Num>{100 - deposit}%</Num>
                  </td>
                  <td>
                    <Num>{money(doc.total - Math.round(doc.total * deposit) / 100)}</Num>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="pi-words" data-pi-break>
        <div>
          <b>
            <L k="inWords" lang={lang} />
          </b>
          <span dir="ltr">{usdInWords(doc.total)}</span>
        </div>
        {lang === 'bilingual' && <div>{usdInChineseCapitals(doc.total)}</div>}
      </div>

      <div className="pi-foot" data-pi-break>
        <div className="pi-box">
          <h2>
            <L k="bank" lang={lang} />
          </h2>
          {doc.bank ? (
            <table className="pi-kv">
              <tbody>
                {(
                  [
                    ['beneficiary', doc.bank.beneficiary],
                    ['bankName', doc.bank.bankName],
                    ['bankAddress', doc.bank.bankAddress],
                    ['account', doc.bank.accountNumber],
                    ['swift', doc.bank.swiftCode]
                  ] as [PiLabelKey, string][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>
                        <L k={k} lang={lang} />
                      </td>
                      <td className="pi-free">{v}</td>
                    </tr>
                  ))}
                {doc.bank.remarks && (
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 400, color: 'var(--muted)' }}>
                      {doc.bank.remarks}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p>
              <L k="bankLater" lang={lang} />
            </p>
          )}
        </div>
        <div className="pi-box">
          <h2>
            <L k="remarks" lang={lang} />
          </h2>
          <p className="pi-free">{remarks || '—'}</p>
        </div>
      </div>

      <div className="pi-sign" data-pi-break>
        <div className="pi-sign-box">
          {doc.buyer.company && <div className="pi-sign-co">{doc.buyer.company}</div>}
          <div className="pi-sign-line">
            <L k="buyerSign" lang={lang} />
          </div>
        </div>
        <div className="pi-sign-box">
          {doc.stampImage && <img className="pi-stamp" src={doc.stampImage} alt="" />}
          <div className="pi-sign-co" dir="ltr">{doc.seller.nameEn}</div>
          <div className="pi-sign-line">
            <L k="sellerSign" lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
});
ProformaSheet.displayName = 'ProformaSheet';
