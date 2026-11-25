// Scenario state. Nothing leaves the browser: saving is opt-in to localStorage, or a JSON file the user exports.
import { useEffect, useReducer } from 'react';
import { defaultInputs, PRESETS, type PresetName, type ScenarioInputs } from '../engine/model';

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
  delete (sickLeave as Record<string, unknown>).capMonths;
  return { ...base, ...saved, pay, sickLeave, today: today() };
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
