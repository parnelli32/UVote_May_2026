// A bill is votable once it's `active` AND — for bodies where LegiScan sync
// supplies committee data (`legislative_bodies.requires_committee_report`) —
// has actually been reported out of committee (`reported_from_committee_at`
// set). Bodies that never receive that signal (e.g. Philadelphia City
// Council, whose bills are entered directly by admins) are exempt via
// `requiresCommitteeReport: false`, so their bills stay votable exactly as
// they were before this gate existed. Callers resolve `requiresCommitteeReport`
// from whichever legislative body the bill belongs to — `currentBody` from
// `useAuth()` for body-scoped list views (HomeTab/DashboardTab, where every
// bill on screen shares the signed-in user's selected body), or a lookup
// against the full `legislativeBodies` array for a specific bill's own body
// (BillDetailPage, where the bill's body isn't necessarily the currently
// selected one). This is a display/list-filtering helper only — the real
// enforcement is the `uv_insert`/`uv_update` RLS policies on `user_votes`.
export function isBillVotable(
  bill: { status: string; reported_from_committee_at?: string | null },
  requiresCommitteeReport: boolean
): boolean {
  if (bill.status !== 'active') return false;
  if (bill.reported_from_committee_at) return true;
  return !requiresCommitteeReport;
}

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

export function getSummaryPreview(
  summary: string | null | undefined,
): string {
  if (!summary) return '';
  const sections =
    parseSummaryIntoSections(summary);
  if (sections.length === 0) {
    return summary.trim();
  }
  const text = sections[0].text;
  const sentences =
    text.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length === 0) {
    return text.trim();
  }
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

export function parseSummaryIntoSections(
  summary: string | null | undefined,
): SummarySection[] {
  if (!summary) return [];
  const raw = summary.trim();
  // Option B: multi-line format —
  // number marker on its own line.
  // Handles any existing bills stored
  // this way.
  if (/\n\s*\d+[.)]/m.test(raw)) {
    const parts = raw.split(
      /\n\s*(?=\d+[.)]\s)/,
    );
    const built: SummarySection[] = [];
    parts.forEach((part, i) => {
      const text = part
        .replace(/^\d+[.)]\s*/, '')
        .trim();
      if (text) {
        built.push({
          label:
            SECTION_LABELS[i] ??
            `Section ${i + 1}`,
          text,
        });
      }
    });
    if (built.length > 0) {
      return built.slice(0, 4);
    }
  }
  // Option A (primary format):
  // "1. text 2. text 3. text 4. text"
  // Split on inline numbered markers.
  const matches = [
    ...raw.matchAll(
      /(?:^|\s+)[1-4]\.\s+([\s\S]*?)(?=\s+[1-4]\.\s|$)/g,
    ),
  ];
  if (matches.length > 0) {
    return matches.slice(0, 4).map(
      (m, i) => ({
        label:
          SECTION_LABELS[i] ??
          `Section ${i + 1}`,
        text: m[1].trim(),
      }),
    );
  }
  // Fallback: no structure detected —
  // show full text under section 1.
  return [{
    label: SECTION_LABELS[0],
    text: raw,
  }];
}

export function formatIntroducedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
