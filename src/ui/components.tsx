import { useId, useState, type ReactNode } from 'react';
import type { YearMonth } from '../engine/service';

export type Who = 'you' | 'spouse';

/** A small text label so the You / Spouse color coding never relies on color alone. */
export function WhoBadge({ who }: { who: Who }) {
  return <span className={`who-badge who-${who}`}>{who === 'you' ? 'You' : 'Spouse'}</span>;
}

export function Section({ title, children, id, who }: { title: string; children: ReactNode; id?: string; who?: Who }) {
  const hid = id ?? title.replace(/\W+/g, '-');
  return (
    <section className={`card${who ? ` who-${who}` : ''}`} aria-labelledby={hid}>
      <h2 id={hid}>
        {who && <WhoBadge who={who} />}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function KeyNumber({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`key ${tone ?? ''}`}>
      <div className="key-label">{label}</div>
      <div className="key-value">{value}</div>
      {sub && <div className="key-sub">{sub}</div>}
      <div className="estimate-tag">Estimate</div>
    </div>
  );
}

export function Assumptions({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <details className="assumptions">
      <summary>Assumptions behind this result</summary>
      <dl>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function ShowMath({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="math">
      <button type="button" className="link-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? 'Hide the math' : 'Show the math'}
      </button>
      {open && (
        <div id={id} className="math-body">
          {children}
        </div>
      )}
    </div>
  );
}

export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' }) {
  return (
    <p className={`note ${kind}`} role={kind === 'warn' ? 'alert' : undefined}>
      {children}
    </p>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: (id: string, describedBy?: string) => ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, hintId)}
      {hint && (
        <div className="hint" id={hintId}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <div className="input-wrap">
          {prefix && <span className="affix" aria-hidden="true">{prefix}</span>}
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={Number.isFinite(value) ? value : ''}
            min={min}
            max={max}
            step={step}
            aria-describedby={describedBy}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              onChange(Number.isFinite(v) ? v : 0);
            }}
          />
          {suffix && <span className="affix" aria-hidden="true">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

/** Percent input: stores a fraction, shows a percentage. */
export function PercentField(props: { label: string; value: number; onChange: (v: number) => void; hint?: ReactNode; step?: number; min?: number; max?: number }) {
  return (
    <NumberField
      label={props.label}
      hint={props.hint}
      value={Math.round(props.value * 10000) / 100}
      step={props.step ?? 0.1}
      min={props.min}
      max={props.max}
      suffix="%"
      onChange={(v) => props.onChange(v / 100)}
    />
  );
}

export function MoneyField(props: { label: string; value: number; onChange: (v: number) => void; hint?: ReactNode; step?: number }) {
  return <NumberField {...props} prefix="$" step={props.step ?? 100} min={0} />;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function MonthYearField({ label, value, onChange, hint }: { label: string; value: YearMonth; onChange: (v: YearMonth) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <fieldset className="field monthyear">
      <legend>{label}</legend>
      <div className="row">
        <label htmlFor={`${id}-m`} className="visually-hidden">
          {label} month
        </label>
        <select id={`${id}-m`} value={value.month} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-y`} className="visually-hidden">
          {label} year
        </label>
        <input
          id={`${id}-y`}
          type="number"
          inputMode="numeric"
          value={value.year}
          min={1930}
          max={2100}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) || value.year })}
        />
      </div>
      {hint && <div className="hint">{hint}</div>}
    </fieldset>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <select id={id} value={value} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="field toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <div className="hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** Long sentences wrap so tables fit on desktop; numbers and short labels stay on one line. */
const isProse = (c: ReactNode) => typeof c === 'string' && c.length > 24 && /\s/.test(c);

export function Table({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className={isProse(c) ? 'wrap' : undefined}>
                    {c}
                  </th>
                ) : (
                  <td key={j} className={isProse(c) ? 'wrap' : undefined}>
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
