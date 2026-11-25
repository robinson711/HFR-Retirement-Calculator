// Display helpers. Summaries round to the nearest $1,000; "Show the math" shows exact figures.
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round1000 = (v: number) => Math.round(v / 1000) * 1000;
/** Summary dollars: nearest $1,000. */
export const k = (v: number) => usd0.format(round1000(v));
/** Monthly figures: nearest $10. */
export const monthly = (v: number) => usd0.format(Math.round(v / 10) * 10);
export const dollars = (v: number) => usd0.format(v);
export const cents = (v: number) => usd2.format(v);
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const ym = (d: { year: number; month: number }) => `${MONTHS[d.month - 1]} ${d.year}`;
export const years = (months: number) => `${Math.floor(months / 12)}y ${months % 12}m`;
