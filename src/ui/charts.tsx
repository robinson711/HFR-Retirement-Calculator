import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { k } from './format';

// Palette chosen for contrast against both backgrounds and for color-vision deficiency (blue / orange / teal / purple).
const LIGHT = { s1: '#2563eb', s2: '#c2410c', s3: '#0f766e', s4: '#7c3aed', s5: '#a16207', grid: '#d4d4d8', text: '#3f3f46', band: '#93c5fd' };
const DARK = { s1: '#60a5fa', s2: '#fb923c', s3: '#2dd4bf', s4: '#a78bfa', s5: '#facc15', grid: '#3f3f46', text: '#d4d4d8', band: '#1e3a8a' };

function usePalette() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return dark ? DARK : LIGHT;
}

const axisMoney = (v: number) => (Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}k`);

function Frame({ title, description, children }: { title: string; description: string; children: React.ReactElement }) {
  return (
    <figure className="chart">
      <figcaption>
        <strong>{title}</strong>
        <span>{description}</span>
      </figcaption>
      <div className="chart-box" role="img" aria-label={`${title}. ${description}`}>
        <ResponsiveContainer width="100%" height={280}>
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export interface IncomeRow {
  age: number;
  pension: number;
  job: number;
  socialSecurity: number;
  withdrawals: number;
  shortfall: number;
}

export function IncomeChart({ data }: { data: IncomeRow[] }) {
  const p = usePalette();
  return (
    <Frame title="Income by source" description="Each year's income in today's dollars, stacked by source, from retirement to the plan age. A yellow band means spending that savings could not cover.">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="age" stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} label={{ value: 'Age', position: 'insideBottomRight', offset: -2, fill: p.text, fontSize: 12 }} />
        <YAxis tickFormatter={axisMoney} stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} width={56} />
        <Tooltip formatter={(v: number) => k(v)} labelFormatter={(a) => `Age ${a}`} />
        <Legend />
        <Area isAnimationActive={false} type="linear" dataKey="pension" name="RSA pension" stackId="1" stroke={p.s1} fill={p.s1} fillOpacity={0.7} />
        <Area isAnimationActive={false} type="linear" dataKey="socialSecurity" name="Social Security" stackId="1" stroke={p.s3} fill={p.s3} fillOpacity={0.7} />
        <Area isAnimationActive={false} type="linear" dataKey="job" name="Second job" stackId="1" stroke={p.s4} fill={p.s4} fillOpacity={0.7} />
        <Area isAnimationActive={false} type="linear" dataKey="withdrawals" name="Savings withdrawals" stackId="1" stroke={p.s2} fill={p.s2} fillOpacity={0.7} />
        <Area isAnimationActive={false} type="linear" dataKey="shortfall" name="Not covered (savings ran out)" stackId="1" stroke={p.s5} fill={p.s5} fillOpacity={0.35} strokeDasharray="4 3" />
      </AreaChart>
    </Frame>
  );
}

export function BalanceChart({ data }: { data: Array<{ age: number; p10: number; p50: number; p90: number; expected: number }> }) {
  const p = usePalette();
  const rows = data.map((d) => ({ ...d, band: [d.p10, d.p90] as [number, number] }));
  return (
    <Frame title="Savings balance" description="Median balance with the 10th to 90th percentile range from 1,000 market paths, and the expected-return path, in today's dollars.">
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="age" stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} />
        <YAxis tickFormatter={axisMoney} stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} width={56} />
        <Tooltip
          formatter={(v: number | [number, number], name) => (Array.isArray(v) ? [`${k(v[0])} to ${k(v[1])}`, name] : [k(v), name])}
          labelFormatter={(a) => `Age ${a}`}
        />
        <Legend />
        <Area isAnimationActive={false} type="linear" dataKey="band" name="10th to 90th percentile" stroke="none" fill={p.band} fillOpacity={0.6} />
        <Line isAnimationActive={false} type="linear" dataKey="p50" name="Median" stroke={p.s1} strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} type="linear" dataKey="expected" name="Expected returns" stroke={p.s2} strokeDasharray="5 4" strokeWidth={2} dot={false} />
      </ComposedChart>
    </Frame>
  );
}

export function PurchasingPowerChart({ data }: { data: Array<{ age: number; nominal: number; real: number }> }) {
  const p = usePalette();
  return (
    <Frame title="Pension purchasing power" description="Monthly pension as paid, and what it buys in today's dollars when there is no cost-of-living raise.">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="age" stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} />
        <YAxis tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`} stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} width={56} />
        <Tooltip formatter={(v: number) => `$${Math.round(v).toLocaleString()}`} labelFormatter={(a) => `Age ${a}`} />
        <Legend />
        <Line isAnimationActive={false} type="linear" dataKey="nominal" name="As paid" stroke={p.s1} strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} type="linear" dataKey="real" name="In today's dollars" stroke={p.s2} strokeWidth={2} dot={false} />
      </LineChart>
    </Frame>
  );
}

export function PlopChart({ data }: { data: Array<{ age: number; difference: number }> }) {
  const p = usePalette();
  return (
    <Frame title="PLOP: cumulative difference" description="Lump sum invested, minus the pension it gives up, by age, in today's dollars. Above zero, the PLOP is ahead.">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="age" stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} />
        <YAxis tickFormatter={axisMoney} stroke={p.text} tick={{ fill: p.text, fontSize: 12 }} width={56} />
        <ReferenceLine y={0} stroke={p.text} />
        <Tooltip formatter={(v: number) => k(v)} labelFormatter={(a) => `Age ${a}`} />
        <Line isAnimationActive={false} type="linear" dataKey="difference" name="PLOP ahead by" stroke={p.s3} strokeWidth={2} dot={false} />
      </LineChart>
    </Frame>
  );
}
