import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import type { NavTab } from '../components/BottomNav';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type AboutPageProps = {
  onBack: () => void;
  onNavigateToHowItWorks?: () => void;
  onNavigateToAbout?: () => void;
  onNavigateToElectionCenter?: () => void;
  navProps?: NavProps;
};

const CHECK_ITEMS = [
  'Vote on active Philadelphia City Council bills directly from your phone',
  'See how your representative voted on each bill and whether it matched what your district wanted',
  "Track your representative's alignment score — how consistently their votes reflect their constituents",
  'Compare your positions to your neighbors and to your representative\'s record over time',
];

export function AboutPage({ onNavigateToHowItWorks, onNavigateToAbout, onNavigateToElectionCenter, navProps }: AboutPageProps) {
  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>

        <AppHeader
          onNavigateToHowItWorks={onNavigateToHowItWorks ?? (() => {})}
          onNavigateToAbout={onNavigateToAbout ?? (() => {})}
          onNavigateToElectionCenter={onNavigateToElectionCenter ?? (() => {})}
        />

        <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 20 }}>

        {/* ── CIVIC GUIDE CARD ── */}
        <div style={{
          background: '#1B4332',
          borderRadius: 12,
          padding: '16px 16px 14px',
          margin: '10px 10px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 700,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.8px',
              color: 'rgba(245,166,35,0.75)',
              display: 'block',
              marginBottom: 5,
            }}>
              Civic guide
            </span>
            <span style={{
              display: 'block',
              fontSize: 14, fontWeight: 700,
              color: 'white', marginBottom: 4,
              lineHeight: 1.25,
            }}>
              How a bill becomes law
            </span>
            <span style={{
              display: 'block',
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.4,
            }}>
              6 stages · where your voice matters most
            </span>
          </div>
          <button
            onClick={onNavigateToHowItWorks}
            style={{
              background: 'rgba(245,166,35,0.2)',
              color: '#F5A623',
              border: '1.5px solid rgba(245,166,35,0.4)',
              borderRadius: 10,
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
              flexShrink: 0,
            }}
          >
            Open guide →
          </button>
        </div>

        {/* ── SECTION 1: What is UVote ── */}
        <Section label="What is UVote">
          <p style={bodyText}>
            UVote is a civic platform built to close the gap between Election Day and every day that legislation is being made. It gives Philadelphia residents a direct, data-driven way to make their voices heard on the bills moving through City Council — and gives elected officials a reliable window into what their constituents actually think.
          </p>
          <p style={{ ...bodyText, marginTop: 10 }}>
            This is not a social network or a petition platform. It is a structured tool for democratic participation between elections.
          </p>
        </Section>

        {/* ── SECTION 2: What you can do right now ── */}
        <Section label="What you can do right now">
          <div>
            {CHECK_ITEMS.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  marginBottom: i < CHECK_ITEMS.length - 1 ? 10 : 0,
                }}
              >
                <i className="fa-solid fa-check" style={{ fontSize: 13, color: '#1B4332', marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── SECTION 3: This is an early version ── */}
        <Section label="This is an early version">
          <p style={bodyText}>
            What you're using is UVote's first public release, launched in Philadelphia. The bills are real active legislation. The votes are from real constituents. The alignment scores reflect actual voting records.
          </p>
          <p style={{ ...bodyText, marginTop: 10 }}>
            But the platform is young. The scores become more meaningful as more residents participate. Every bill you vote on adds to the data that makes this a credible signal for the people representing you. Your participation right now is laying the foundation.
          </p>
        </Section>

        {/* ── SECTION 4: Where UVote is going ── */}
        <Section label="Where UVote is going">
          <p style={bodyText}>
            The goal is a Philadelphia — and eventually a United States — where the quality of democratic representation is measurable, public, and improvable.
          </p>
          <p style={{ ...bodyText, marginTop: 10 }}>
            Future versions of UVote will include direct messaging between constituents and their representatives, weekly updates from council offices, collective voting records for community organizations, and eventually expansion to state and federal offices.
          </p>
          <p style={{ ...bodyText, marginTop: 10 }}>
            The platform starts at the city level because that is where legislation has the most direct impact on daily life and where the representation gap is widest.
          </p>
        </Section>

        {/* ── SECTION 5: Why Philadelphia ── */}
        <Section label="Why Philadelphia">
          <p style={bodyText}>
            Philadelphia is the birthplace of American democracy. It has an engaged civic population, an active City Council, and strong neighborhood organizations that already show up for their communities.
          </p>
          <p style={{ ...bodyText, marginTop: 10 }}>
            It is also where UVote was built, by someone who lives here and wants better tools for holding local government accountable. Starting here is not just practical — it is intentional.
          </p>
        </Section>

        {/* ── SECTION 6: You are a founding member ── */}
        <Section label="You are a founding member">
          <p style={bodyText}>
            If you are using UVote in its first weeks, you are helping build something that does not exist yet at scale. A platform where constituent sentiment on actual legislation is tracked, public, and consequential.
          </p>
          <p style={{ ...bodyText, marginTop: 10 }}>
            Share UVote with your neighbors. Vote on every bill in your feed. The data you generate today is what makes this platform credible tomorrow.
          </p>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 14, color: '#1B4332' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1B4332' }}>
              UVote Founding Member · Philadelphia
            </span>
          </div>
        </Section>

        {/* ── SECTION 7: Built by ── */}
        <Section label="Built by">
          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: 0 }}>
            UVote is an independent civic technology product built in Philadelphia. It is not affiliated with Philadelphia City Council or any government agency.
          </p>
          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: '10px 0 0' }}>
            For questions or feedback, contact us at{' '}
            <a href="mailto:hello@uvote.app" style={{ color: '#1B4332', fontWeight: 700, textDecoration: 'none' }}>
              hello@uvote.app
            </a>.
          </p>
        </Section>

        </div>

        {navProps && <BottomNav {...navProps} />}
      </div>
    </div>
  );
}

const bodyText: React.CSSProperties = {
  fontSize: 13,
  color: '#374151',
  lineHeight: 1.7,
  margin: 0,
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      border: '1px solid #E2E8E4',
      padding: '18px 16px',
      margin: '10px 10px 0',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.8px', color: '#1B4332',
        display: 'block', marginBottom: 8,
      }}>
        {label}
      </span>
      {children}
    </div>
  );
}
