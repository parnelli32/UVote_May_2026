export const BILL_TOPICS = [
  'Housing',
  'Public Safety',
  'Budget',
  'Education',
  'Infrastructure',
  'Transportation',
  'Health',
  'Environment',
  'Economic Development',
  'Government Operations',
  'Other',
] as const;

export type BillTopic = typeof BILL_TOPICS[number];

export type TopicTag = {
  label: string;
  bg: string;
  color: string;
};

const TOPIC_TAG_MAP: Record<BillTopic, TopicTag> = {
  'Housing':              { label: 'Housing',              bg: '#FFF3D6', color: '#7A4F00' },
  'Public Safety':        { label: 'Public Safety',        bg: '#E8F0EB', color: '#1B4332' },
  'Budget':               { label: 'Budget',               bg: '#E6F5EE', color: '#0e6b4a' },
  'Education':            { label: 'Education',            bg: '#FFF3D6', color: '#7A4F00' },
  'Infrastructure':       { label: 'Infrastructure',       bg: '#F1F5F9', color: '#475569' },
  'Transportation':       { label: 'Transportation',       bg: '#F1F5F9', color: '#475569' },
  'Health':               { label: 'Health',               bg: '#FEF0EF', color: '#c0392b' },
  'Environment':          { label: 'Environment',          bg: '#E8F0EB', color: '#1B4332' },
  'Economic Development': { label: 'Economic Development', bg: '#FFF3D6', color: '#7A4F00' },
  'Government Operations':{ label: 'Government Operations',bg: '#F1F5F9', color: '#475569' },
  'Other':                { label: 'Other',                bg: '#F1F5F9', color: '#64748B' },
};

const TOPIC_RULES: Array<{ keywords: RegExp; topic: BillTopic }> = [
  { keywords: /housing|rent|landlord/i,                topic: 'Housing' },
  { keywords: /safety|police|crime|light/i,            topic: 'Public Safety' },
  { keywords: /school|education|student/i,             topic: 'Education' },
  { keywords: /budget|fund|tax|spend/i,                topic: 'Budget' },
  { keywords: /transit|transportation|bus|rail|bike/i, topic: 'Transportation' },
  { keywords: /road|infrastructure|sewer|bridge/i,     topic: 'Infrastructure' },
  { keywords: /health|hospital|medical|drug/i,         topic: 'Health' },
  { keywords: /environment|climate|pollution|green/i,  topic: 'Environment' },
  { keywords: /economic|business|commerce|job|employ/i,topic: 'Economic Development' },
  { keywords: /government|council|ordinance|zoning/i,  topic: 'Government Operations' },
];

export function getTopicTag(title: string, summary?: string | null, topicOverride?: string | null): TopicTag {
  if (topicOverride) {
    const tag = TOPIC_TAG_MAP[topicOverride as BillTopic];
    if (tag) return tag;
  }
  const haystack = `${title} ${summary ?? ''}`;
  for (const rule of TOPIC_RULES) {
    if (rule.keywords.test(haystack)) return TOPIC_TAG_MAP[rule.topic];
  }
  return TOPIC_TAG_MAP['Other'];
}

export function getSummaryPreview(summary: string | null | undefined): string {
  if (!summary) return '';

  // Strip numbered list markers and section label prefixes line by line
  const cleaned = summary
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*\d+[.)]\s+/, '')
        .replace(/^\s*(?:what this bill does|who it affects|if it passes|if it doesn't pass)\s*:\s*/i, '')
        .trim()
    )
    .filter(Boolean)
    .join(' ');

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length === 0) return cleaned.trim();

  return sentences
    .slice(0, 2)
    .map((s) => s.trim())
    .join(' ')
    .trim();
}

/** Parse the summary into up to 4 named sections.
 *  Sections are split on lines that look like "1.", "2.", numbered headings,
 *  or the exact section labels. Falls back to single block under section 1.
 */
export type SummarySection = {
  label: string;
  text: string;
};

const SECTION_LABELS = [
  'What this bill does',
  'Who it affects',
  'If it passes',
  "If it doesn't pass",
];

export function parseSummaryIntoSections(summary: string | null | undefined): SummarySection[] {
  if (!summary) return [];

  // Try to detect structured content — look for numbered lines or keyword anchors
  const structureRegex = /(?:^|\n)\s*(?:\d+[.)]\s*|(?:what this bill does|who it affects|if it passes|if it doesn't pass))/i;
  if (!structureRegex.test(summary)) {
    return [{ label: SECTION_LABELS[0], text: summary.trim() }];
  }

  // Split on numbered list markers or known labels
  const parts = summary.split(/\n\s*(?=\d+[.)]\s)/);
  const sections: SummarySection[] = [];

  parts.forEach((part, i) => {
    const text = part.replace(/^\d+[.)]\s*/, '').trim();
    if (!text) return;
    sections.push({ label: SECTION_LABELS[i] ?? `Section ${i + 1}`, text });
  });

  if (sections.length === 0) {
    return [{ label: SECTION_LABELS[0], text: summary.trim() }];
  }

  return sections.slice(0, 4);
}

export function formatIntroducedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
