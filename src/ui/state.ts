// Scenario state. Nothing leaves the browser: saving is opt-in to localStorage, or a JSON file the user exports.
import { useEffect, useReducer } from 'react';
import { defaultInputs, PRESETS, type PresetName, type ScenarioInputs, type SsPerson } from '../engine/model';

const STORAGE_KEY = 'hfr-retirement-scenario-v1';
const SAVE_FLAG = 'hfr-retirement-save-enabled';

export type Action =
  | { type: 'set'; update: (s: ScenarioInputs) => ScenarioInputs }
  | { type: 'replace'; inputs: ScenarioInputs }
  | { type: 'preset'; preset: PresetName };

function reducer(state: ScenarioInputs, action: Action): ScenarioInputs {
  switch (action.type) {
    case 'set':
      return action.update(state);
    case 'replace':
      return action.inputs;
    case 'preset':
      return { ...state, preset: action.preset, assumptions: { ...state.assumptions, ...PRESETS[action.preset] } };
  }
}

function today() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

export function isSaveEnabled() {
  return safeGet(SAVE_FLAG) === '1';
}

/** Merge a saved or imported scenario over the defaults, so files from older versions still load. */
export function fromSaved(saved: Partial<ScenarioInputs>): ScenarioInputs {
  const base = defaultInputs(today());
  const pay = { ...base.pay, ...(saved.pay ?? {}) } as ScenarioInputs['pay'] & { fitnessIncentivePct?: number };
  if (typeof pay.fitnessIncentive !== 'boolean') pay.fitnessIncentive = (pay.fitnessIncentivePct ?? 0.05) > 0;
  for (const old of ['missingColaPct', 'fitnessIncentivePct', 'fitnessStopsFiscalYear', 'promotionRaisePerGrade']) delete (pay as Record<string, unknown>)[old];
  const sickLeave = { ...base.sickLeave, ...(saved.sickLeave ?? {}) };
  const oldSick = sickLeave as Record<string, unknown>;
  if (oldSick.workSchedule !== 'fireSuppression' && oldSick.workSchedule !== 'fortyHour') sickLeave.workSchedule = oldSick.hoursPerDay === 8 ? 'fortyHour' : 'fireSuppression';
  for (const old of ['capMonths', 'accrualHoursPerYear', 'hoursPerDay']) delete oldSick[old];
  // Social Security: older versions stored { monthly, claimAge } or null per person.
  type OldSs = { monthly: number; claimAge: number } | null | undefined;
  const savedSs = (saved.socialSecurity ?? {}) as Record<string, unknown>;
  const person = (key: 'member' | 'spouse') => {
    const v = savedSs[key] as Partial<SsPerson> | OldSs;
    if (v && 'source' in v) return { ...base.socialSecurity[key], ...v };
    if (v === null) return { ...base.socialSecurity[key], include: false };
    if (v && 'monthly' in v) return { ...base.socialSecurity[key], source: 'statement' as const, fraMonthly: v.monthly, claimAge: v.claimAge };
    return base.socialSecurity[key];
  };
  const socialSecurity = {
    cityJobCovered: typeof savedSs.cityJobCovered === 'boolean' ? savedSs.cityJobCovered : base.socialSecurity.cityJobCovered,
    member: person('member'),
    spouse: person('spouse'),
  };
  // 457(b): older versions had one traditional account. Add an empty Roth 457(b) beside it.
  let accounts = saved.accounts ?? base.accounts;
  if (!accounts.some((a) => a.kind === 'roth457')) {
    const trad = accounts.find((a) => a.owner === 'member' && a.kind === '457b');
    accounts = [
      ...accounts.map((a) => (a === trad ? { ...a, label: '457(b) traditional' } : a)),
      { id: '457b-roth', label: '457(b) Roth', kind: 'roth457', owner: 'member', balance: 0, contribution: 0, allocation: trad?.allocation ?? { stocks: 0.8, bonds: 0.2, cash: 0 } },
    ];
  }
  return { ...base, ...saved, pay, sickLeave, socialSecurity, accounts, today: today() };
}

function initial(): ScenarioInputs {
  const base = defaultInputs(today());
  if (!isSaveEnabled()) return base;
  const raw = safeGet(STORAGE_KEY);
  if (!raw) return base;
  try {
    return fromSaved(JSON.parse(raw) as Partial<ScenarioInputs>);
  } catch {
    return base;
  }
}

export function useScenario(saveEnabled: boolean) {
  const [inputs, dispatch] = useReducer(reducer, undefined, initial);
  useEffect(() => {
    safeSet(SAVE_FLAG, saveEnabled ? '1' : null);
    safeSet(STORAGE_KEY, saveEnabled ? JSON.stringify(inputs) : null);
  }, [inputs, saveEnabled]);
  return { inputs, dispatch };
}

export function exportJson(inputs: ScenarioInputs) {
  const blob = new Blob([JSON.stringify({ app: 'hfr-retirement', version: 1, inputs }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hfr-retirement-scenario.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJson(file: File): Promise<ScenarioInputs> {
  const data = JSON.parse(await file.text()) as { app?: string; inputs?: ScenarioInputs };
  if (data.app !== 'hfr-retirement' || !data.inputs) throw new Error('This file is not an HFR retirement scenario.');
  return fromSaved(data.inputs);
}
