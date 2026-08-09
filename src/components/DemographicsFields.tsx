import {
  RACE_ETHNICITY_OPTIONS,
  EDUCATION_OPTIONS,
  ANNUAL_EARNINGS_OPTIONS,
  HOMEOWNERSHIP_OPTIONS,
  AGE_BRACKET_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  HOUSEHOLD_TYPE_OPTIONS,
} from '../lib/types';
import type { DemographicsAnswers } from '../lib/demographics';

const YES_NO_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
] as const;

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: '#F4F6F0',
  border: '1px solid #E2E8E4',
  borderRadius: 8,
  padding: '9px 10px',
  fontSize: 13,
  color: '#0f1724',
  boxSizing: 'border-box',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#374151',
  marginBottom: 5,
};

function Field({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <span style={fieldLabelStyle}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value="">Prefer not to answer</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function DemographicsFields({
  answers,
  onChange,
}: {
  answers: DemographicsAnswers;
  onChange: (answers: DemographicsAnswers) => void;
}) {
  function set<K extends keyof DemographicsAnswers>(key: K, value: string) {
    onChange({ ...answers, [key]: value });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Field label="Race / ethnicity" value={answers.race_ethnicity} onChange={(v) => set('race_ethnicity', v)} options={RACE_ETHNICITY_OPTIONS} />
      <Field label="Are you Hispanic or Latino?" value={answers.hispanic_latino} onChange={(v) => set('hispanic_latino', v)} options={YES_NO_OPTIONS} />
      <Field label="Educational attainment" value={answers.education} onChange={(v) => set('education', v)} options={EDUCATION_OPTIONS} />
      <Field label="Annual earnings (individual)" value={answers.annual_earnings} onChange={(v) => set('annual_earnings', v)} options={ANNUAL_EARNINGS_OPTIONS} />
      <Field label="Homeownership" value={answers.homeownership} onChange={(v) => set('homeownership', v)} options={HOMEOWNERSHIP_OPTIONS} />
      <Field label="Age bracket" value={answers.age_bracket} onChange={(v) => set('age_bracket', v)} options={AGE_BRACKET_OPTIONS} />
      <Field label="Employment status" value={answers.employment_status} onChange={(v) => set('employment_status', v)} options={EMPLOYMENT_STATUS_OPTIONS} />
      <Field label="Veteran status" value={answers.veteran} onChange={(v) => set('veteran', v)} options={YES_NO_OPTIONS} />
      <Field label="Do you identify as having a disability?" value={answers.disability} onChange={(v) => set('disability', v)} options={YES_NO_OPTIONS} />
      <Field label="Household type" value={answers.household_type} onChange={(v) => set('household_type', v)} options={HOUSEHOLD_TYPE_OPTIONS} />
    </div>
  );
}
