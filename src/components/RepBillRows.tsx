import type { Bill, RepVote } from '../lib/types';

export type BillWithRepVote = Bill & {
  rep_vote: RepVote;
  district_support: number;
  district_oppose: number;
  qualifies_for_score: boolean;
  district_majority: 'support' | 'oppose' | null;
  rep_matches_district: boolean | null;
};

export function PassedSponsoredBillRow({
  bill,
  isLast,
  onNavigateToBill,
  sponsorType,
}: {
  bill: BillWithRepVote;
  isLast: boolean;
  onNavigateToBill: (billId: string) => void;
  sponsorType: 'primary' | 'cosponsor';
}) {
  const rv = (bill as BillWithRepVote).rep_vote;
  const hasRepVote = rv && (rv.vote === 'support' || rv.vote === 'oppose');
  const districtTotal = (bill as BillWithRepVote).district_support + (bill as BillWithRepVote).district_oppose;
  const showDistrictMajority = districtTotal >= 2;
  const showExplanation = (bill as BillWithRepVote).rep_matches_district === false && rv?.explanation;

  const isPrimary = sponsorType === 'primary';

  return (
    <div style={{
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
      borderLeft: isPrimary ? '3px solid #F5A623' : '3px solid #6BAE8C',
      background: isPrimary ? '#FFFDF7' : '#F4FBF7',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 10,
    }}>
      {/* Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: isPrimary ? '#FFF3D6' : '#E6F5EE',
            color: isPrimary ? '#7A4F00' : '#0e6b4a',
            fontSize: 9, fontWeight: 700,
            padding: '2px 8px', borderRadius: 10,
          }}>
            <i className="fa-solid fa-scale-balanced" style={{ fontSize: 9 }} />
            Became Law
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: isPrimary ? '#FEF9EC' : '#EBF7F2',
            color: isPrimary ? '#92570A' : '#1B7A52',
            fontSize: 9, fontWeight: 600,
            padding: '2px 7px', borderRadius: 10,
            border: isPrimary ? '1px solid #F5D78E' : '1px solid #A8DBC4',
          }}>
            {isPrimary ? 'Lead Sponsor' : 'Co-Sponsor'}
          </span>
        </div>
        <button
          onClick={() => onNavigateToBill(bill.bill_id)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: 12, fontWeight: 600, color: '#0f1724', lineHeight: 1.35,
            marginBottom: 5, display: 'block', minHeight: 'unset',
            whiteSpace: 'normal', wordWrap: 'break-word', width: '100%',
          }}
        >
          {bill.title}
        </button>
        <span style={{ display: 'block', fontSize: 11, color: isPrimary ? '#7A4F00' : '#1B7A52', fontWeight: 600, lineHeight: 1.4, marginBottom: showDistrictMajority || showExplanation ? 4 : 0 }}>
          This legislation is now law.
        </span>
        {showDistrictMajority && (bill as BillWithRepVote).district_majority && (
          <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: showExplanation ? 4 : 0 }}>
            District: Majority {(bill as BillWithRepVote).district_majority === 'support' ? 'Support' : 'Oppose'}
          </span>
        )}
        {showExplanation && (
          <div style={{ marginTop: 4 }}>
            <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>
              Why they voted this way:
            </span>
            <p style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>
              {rv.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Right */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {(bill as BillWithRepVote).passed_by_suspension ? (
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding: '2px 7px', borderRadius: 10,
            background: '#F1F5F9', color: '#475569',
            whiteSpace: 'nowrap',
          }}>
            Passed by suspension
          </span>
        ) : (
          <>
            {hasRepVote && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 6,
                background: rv.vote === 'support' ? '#E6F5EE' : '#FEF0EF',
                color: rv.vote === 'support' ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {rv.vote === 'support' ? 'Supported' : 'Opposed'}
              </span>
            )}
            {(bill as BillWithRepVote).qualifies_for_score && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                background: (bill as BillWithRepVote).rep_matches_district ? '#E6F5EE' : '#FEF0EF',
                color: (bill as BillWithRepVote).rep_matches_district ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {(bill as BillWithRepVote).rep_matches_district ? 'Match ✓' : 'Mismatch ✗'}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function BillHistoryRow({
  bill,
  isLast,
  onNavigateToBill,
}: {
  bill: BillWithRepVote;
  isLast: boolean;
  onNavigateToBill: (billId: string) => void;
}) {
  const rv = bill.rep_vote;
  const hasRepVote = rv.vote === 'support' || rv.vote === 'oppose';
  const districtTotal = bill.district_support + bill.district_oppose;
  const showDistrictMajority = districtTotal >= 2;
  const showExplanation =
    bill.rep_matches_district === false && rv.explanation;

  return (
    <div style={{
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 10,
    }}>
      {/* Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          onClick={() => onNavigateToBill(bill.bill_id)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: 12, fontWeight: 600, color: '#0f1724', lineHeight: 1.35,
            marginBottom: 4, display: 'block', minHeight: 'unset',
            whiteSpace: 'normal', wordWrap: 'break-word', width: '100%',
          }}
        >
          {bill.title}
        </button>

        {showDistrictMajority && bill.district_majority && (
          <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: showExplanation ? 4 : 0 }}>
            District: Majority {bill.district_majority === 'support' ? 'Support' : 'Oppose'}
          </span>
        )}

        {showExplanation && (
          <div style={{ marginTop: 4 }}>
            <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>
              Why they voted this way:
            </span>
            <p style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>
              {rv.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Right */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {bill.passed_by_suspension ? (
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding: '2px 7px', borderRadius: 10,
            background: '#F1F5F9', color: '#475569',
            whiteSpace: 'nowrap',
          }}>
            Passed by suspension
          </span>
        ) : (
          <>
            {hasRepVote && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 6,
                background: rv.vote === 'support' ? '#E6F5EE' : '#FEF0EF',
                color: rv.vote === 'support' ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {rv.vote === 'support' ? 'Supported' : 'Opposed'}
              </span>
            )}

            {bill.qualifies_for_score ? (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                background: bill.rep_matches_district ? '#E6F5EE' : '#FEF0EF',
                color: bill.rep_matches_district ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {bill.rep_matches_district ? 'Match ✓' : 'Mismatch ✗'}
              </span>
            ) : (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                background: '#F1F5F9', color: '#94a3b8',
                whiteSpace: 'nowrap',
              }}>
                Not enough votes
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
