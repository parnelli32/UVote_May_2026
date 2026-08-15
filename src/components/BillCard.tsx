import { getTopicTag, getSummaryPreview } from '../lib/billUtils';

// Deliberately narrower than the full `Bill` row — this is exactly what the card
// renders, so it's satisfied structurally by both `Bill` and the `my_bill_feed`
// view row HomeTab passes in, no cast needed at the call site.
export type BillWithTally = {
  bill_id: string;
  title: string;
  summary: string | null;
  status: string;
  topic?: string | null;
  support_count: number;
  oppose_count: number;
  total_votes: number;
};

export function BillCard({
  bill,
  userVote,
  isLoggedIn,
  onTap,
}: {
  bill: BillWithTally;
  userVote: { vote: string } | null;
  isLoggedIn: boolean;
  onTap: () => void;
}) {
  const tag = getTopicTag(bill.title, bill.summary, bill.topic);
  const preview = getSummaryPreview(bill.summary);
  const voted = !!userVote;
  const isSupport = userVote?.vote === 'support';

  const supportPct = bill.total_votes > 0 ? Math.round((bill.support_count / bill.total_votes) * 100) : 0;
  const opposePct = bill.total_votes > 0 ? Math.round((bill.oppose_count / bill.total_votes) * 100) : 0;

  return (
    <div
      onClick={onTap}
      style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8E4',
        padding: '14px 16px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tag row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.6px',
            background: tag.bg, color: tag.color,
            padding: '3px 9px', borderRadius: 6,
          }}>
            {tag.label}
          </span>
          {bill.status === 'passed' && (
            <span style={{ marginLeft: 6, flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#E6F5EE', color: '#0e6b4a', padding: '2px 7px', borderRadius: 10 }}>Passed</span>
          )}
          {bill.status === 'failed' && (
            <span style={{ marginLeft: 6, flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#FEF0EF', color: '#c0392b', padding: '2px 7px', borderRadius: 10 }}>Failed</span>
          )}
          {bill.status === 'tabled' && (
            <span style={{ marginLeft: 6, flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#F1F5F9', color: '#475569', padding: '2px 7px', borderRadius: 10 }}>Tabled</span>
          )}
        </div>
        {voted ? (
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            background: isSupport ? '#E6F5EE' : '#FFF0F2',
            color: isSupport ? '#0e6b4a' : '#c0182d',
            padding: '3px 8px', borderRadius: 6,
          }}>
            {isSupport ? 'Voted Support' : 'Voted Oppose'}
          </span>
        ) : isLoggedIn ? (
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            background: '#F1F5F9', color: '#94a3b8',
            padding: '3px 8px', borderRadius: 6,
          }}>
            Vote Now
          </span>
        ) : null}
      </div>

      {/* Title */}
      <p style={{
        fontSize: 14, fontWeight: 800, color: '#0f1724',
        lineHeight: 1.4, marginBottom: 8,
        whiteSpace: 'normal', wordWrap: 'break-word',
      }}>
        {bill.title}
      </p>

      {/* Preview */}
      {preview && (
        <p style={{
          fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 12,
          whiteSpace: 'normal',
        }}>
          {preview}
        </p>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: '#F4F6F0', marginBottom: 10 }} />

      {/* Tally bar */}
      <div style={{ height: 7, borderRadius: 4, background: '#E2E8E4', overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
        {bill.total_votes > 0 && (
          <>
            <div style={{ width: `${supportPct}%`, background: '#1DB97A' }} />
            <div style={{ width: `${opposePct}%`, background: '#F0455A' }} />
          </>
        )}
      </div>

      {/* Tally labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1DB97A' }}>{supportPct}% Support</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>{bill.total_votes} votes cast</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#F0455A' }}>{opposePct}% Oppose</span>
      </div>


    </div>
  );
}
