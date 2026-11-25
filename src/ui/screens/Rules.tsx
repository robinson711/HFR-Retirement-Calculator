import schedule from '../../data/salary-schedule.json';
import { allRules, sourceList } from '../../engine/rules';
import { Note, Section } from '../components';

const STATUS: Record<string, string> = { verified: 'Verified', 'user-confirmed': 'Confirmed by a member', estimate: 'Estimate' };

function show(v: unknown): string {
  if (typeof v === 'number') return v < 1 && v > 0 ? `${+(v * 100).toFixed(4)}%` : v.toLocaleString();
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string') return v;
  return 'See table in source';
}

export function Rules() {
  const rules = allRules();
  return (
    <div className="stack">
      <Note>Every rule the estimator uses, with its source and the date of that source. Rules marked Estimate could not be fully confirmed; check them before relying on a result.</Note>
      <Section title="Salary schedule">
        <p>
          {schedule.name}, fiscal year {schedule.fiscalYear}, effective {schedule.effectiveDate}. {schedule.note}
        </p>
      </Section>
      <Section title="Rules">
        <ul className="rules">
          {rules.map(({ id, rule, source }) => (
            <li key={id}>
              <div className="rule-head">
                <strong>{rule.label}</strong>
                <span className={`badge ${rule.status}`}>{STATUS[rule.status]}</span>
              </div>
              <div>
                {show(rule.value)} {rule.unit && <span className="hint">({rule.unit})</span>}
              </div>
              <div className="hint">
                {source?.url ? (
                  <a href={source.url} rel="noreferrer noopener" target="_blank">
                    {source.title}
                  </a>
                ) : (
                  source?.title
                )}
                , as of {source?.asOf}. {rule.citation}.
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Sources">
        <ul>
          {Object.entries(sourceList).map(([id, s]) => (
            <li key={id}>
              {s.url ? (
                <a href={s.url} rel="noreferrer noopener" target="_blank">
                  {s.title}
                </a>
              ) : (
                s.title
              )}{' '}
              ({s.publisher}, as of {s.asOf}){s.note ? `. ${s.note}` : ''}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Not modeled">
        <ul>
          <li>Required minimum distributions from pre-tax accounts.</li>
          <li>RSA's own actuarial tables for survivor options (enter your letter's figures instead).</li>
          <li>Partial fiscal years in the salary average, and the deferred retirement option (DROP), which is closed.</li>
          <li>State and federal tax law changes after 2026, other than inflation indexing and the 2028 end of the senior deduction.</li>
        </ul>
      </Section>
    </div>
  );
}
