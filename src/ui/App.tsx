import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { computeScenario } from '../engine/model';
import { Disclaimer } from './Disclaimer';
import { k, monthly, pct, ym } from './format';
import { Compare } from './screens/Compare';
import { Pension } from './screens/Pension';
import { Plan } from './screens/Plan';
import { Rules } from './screens/Rules';
import { Savings } from './screens/Savings';
import { Summary } from './screens/Summary';
import { Survivors } from './screens/Survivors';
import { You, type Setter } from './screens/You';
import { exportJson, importJson, isSaveEnabled, useScenario } from './state';
import './styles.css';

const TABS = [
  ['you', 'You and your pay'],
  ['pension', 'Pension'],
  ['savings', 'Savings and income'],
  ['plan', 'Plan'],
  ['compare', 'Compare'],
  ['survivors', 'Survivors'],
  ['summary', 'Summary'],
  ['rules', 'Rules and sources'],
] as const;
type TabId = (typeof TABS)[number][0];

export function App() {
  const [save, setSave] = useState(isSaveEnabled);
  const { inputs, dispatch } = useScenario(save);
  const [tab, setTab] = useState<TabId>('you');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(inputs);
  const result = useMemo(() => computeScenario(deferred), [deferred]);
  const stale = deferred !== inputs;
  const set: Setter = (update) => dispatch({ type: 'set', update });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const n = TABS.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % n;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next >= 0) {
      e.preventDefault();
      const id = TABS[next]![0];
      setTab(id);
      tabRefs.current[id]?.focus();
    }
  };

  const p = result.pension;
  return (
    <div className="app">
      <a className="skip" href="#panel">
        Skip to content
      </a>
      <header className="top">
        <div className="brand">
          <h1>HFR Retirement Estimator</h1>
          <p>For Huntsville Fire and Rescue members of RSA ERS. Runs entirely in your browser.</p>
        </div>
        <div className="headline" aria-live="polite">
          <div>
            <span className="hl-label">Pension</span>
            <span className="hl-value">{monthly(p.finalMonthly)}/mo</span>
          </div>
          <div>
            <span className="hl-label">Retire</span>
            <span className="hl-value">{ym(p.retirementDate)}</span>
          </div>
          <div>
            <span className="hl-label">Savings last</span>
            <span className="hl-value">{pct(result.monteCarlo.successRate, 0)}</span>
          </div>
          <div>
            <span className="hl-label">Can spend</span>
            <span className="hl-value">{k(result.sustainable)}/yr</span>
          </div>
          <span className="estimate-tag">All estimates</span>
        </div>
      </header>

      <nav className="tabs no-print" role="tablist" aria-label="Sections">
        {TABS.map(([id, label], i) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls="panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={stale ? 'stale' : ''} tabIndex={-1}>
        {tab === 'you' && <You inputs={inputs} set={set} />}
        {tab === 'pension' && <Pension inputs={inputs} result={result} set={set} />}
        {tab === 'savings' && <Savings inputs={inputs} set={set} onPreset={(preset) => dispatch({ type: 'preset', preset })} />}
        {tab === 'plan' && <Plan inputs={deferred} result={result} />}
        {tab === 'compare' && <Compare inputs={deferred} />}
        {tab === 'survivors' && <Survivors inputs={deferred} result={result} />}
        {tab === 'summary' && <Summary inputs={deferred} result={result} />}
        {tab === 'rules' && <Rules />}
      </main>

      <footer className="foot">
        <div className="save no-print">
          <label>
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Remember my inputs on this device
          </label>
          <button type="button" className="button secondary" onClick={() => exportJson(inputs)}>
            Export to a file
          </button>
          <button type="button" className="button secondary" onClick={() => fileRef.current?.click()}>
            Import a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Import a scenario file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                dispatch({ type: 'replace', inputs: await importJson(f) });
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
              e.target.value = '';
            }}
          />
          {error && <span role="alert" className="error">{error}</span>}
        </div>
        <Disclaimer />
        <p className="hint">No accounts, no tracking, and nothing is sent anywhere. Saving is optional and stays on this device.</p>
      </footer>
    </div>
  );
}
