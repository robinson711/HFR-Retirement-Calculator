// Typed access to the versioned rule data in src/rules/*.json.
// Every rule carries its source, citation and status so the UI can list it on the
// "Rules and sources" page. Engine code reads values only through these helpers.
import rsaErs from '../rules/rsa-ers.json';
import sources from '../rules/sources.json';
import leave457 from '../rules/leave-457.json';
import ssRules from '../rules/social-security.json';
import taxRules from '../rules/tax.json';

export type RuleStatus = 'verified' | 'user-confirmed' | 'estimate';

export interface Rule<T = unknown> {
  label: string;
  value: T;
  unit: string;
  source: string;
  citation: string;
  status: RuleStatus;
}

export interface Source {
  title: string;
  publisher: string;
  url: string;
  asOf: string;
  note?: string;
}

export interface RuleSet {
  id: string;
  version: string;
  rules: Record<string, Rule>;
}

export const ruleSets: RuleSet[] = [rsaErs as RuleSet, taxRules as RuleSet, ssRules as RuleSet, leave457 as RuleSet];
export const sourceList = (sources as { version: string; sources: Record<string, Source> }).sources;

const all: Record<string, Rule> = Object.fromEntries(
  ruleSets.flatMap((set) => Object.entries(set.rules).map(([k, v]) => [`${set.id}:${k}`, v])),
);

/** Look up a rule by `<set>:<key>`, e.g. `rsa-ers:tier1.benefitFactor`. Throws if missing. */
export function rule<T>(id: string): Rule<T> {
  const r = all[id];
  if (!r) throw new Error(`Unknown rule ${id}`);
  return r as Rule<T>;
}

export function ruleValue<T>(id: string): T {
  return rule<T>(id).value;
}

export function allRules(): Array<{ id: string; rule: Rule; source: Source | undefined }> {
  return Object.entries(all).map(([id, r]) => ({ id, rule: r, source: sourceList[r.source] }));
}
