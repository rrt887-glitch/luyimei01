/**
 * Product price as shown everywhere: the price text entered in the console followed by "USD"
 * (e.g. "$390–$450 USD"). Left as is when it already names a currency or has no number
 * (e.g. "面议" / "On request").
 */
export function displayPrice(price: string | undefined | null): string {
  const p = (price || '').trim();
  if (!p || !/\d/.test(p)) return p;
  if (/\b(USD|US\$|RMB|CNY|EUR|AED|SAR|RUB)\b|[¥€£₽]/i.test(p)) return p;
  return `${p} USD`;
}
