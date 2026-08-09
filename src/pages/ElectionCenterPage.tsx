import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import type { NavTab } from '../components/BottomNav';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type ElectionCenterPageProps = {
  onBack: () => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  onNavigateToElectionCenter: () => void;
  navProps?: NavProps;
};

type KeyDate = {
  label: string;
  date: string;
  description: string;
};

const KEY_DATES: KeyDate[] = [
  {
    label: 'Voter registration deadline',
    date: 'October 19, 2026',
    description: 'Pennsylvania law requires registration at least 15 days before Election Day.',
  },
  {
    label: 'Mail ballot application deadline',
    date: 'October 27, 2026, 5:00 PM',
    description: 'Applications to vote by mail must be received by your county election office by this deadline.',
  },
  {
    label: 'Election Day',
    date: 'November 3, 2026',
    description: 'Polls are open 7:00 AM to 8:00 PM. Pennsylvania general election.',
  },
];

type ResourceLink = {
  icon: string;
  title: string;
  subtitle: string;
  url: string;
};

const POLLING_PLACE_LINKS: ResourceLink[] = [
  {
    icon: 'fa-solid fa-location-dot',
    title: 'Philadelphia polling place lookup',
    subtitle: 'atlas.phila.gov · official City of Philadelphia tool',
    url: 'https://atlas.phila.gov/voting',
  },
  {
    icon: 'fa-solid fa-map',
    title: 'Statewide polling place search',
    subtitle: 'pavoterservices.pa.gov · works anywhere in PA',
    url: 'https://www.pavoterservices.pa.gov/Pages/PollingPlaceInfo.aspx',
  },
];

const REGISTRATION_LINKS: ResourceLink[] = [
  {
    icon: 'fa-solid fa-pen-to-square',
    title: 'Register or update your registration',
    subtitle: 'pa.gov · official Pennsylvania voter registration',
    url: 'https://www.pa.gov/agencies/vote/voter-registration',
  },
  {
    icon: 'fa-solid fa-magnifying-glass',
    title: 'Check registration status & apply to vote by mail',
    subtitle: 'pavoterservices.pa.gov · PA Voter Services portal',
    url: 'https://www.pavoterservices.pa.gov',
  },
];

const OFFICIAL_RESOURCE_LINKS: ResourceLink[] = [
  {
    icon: 'fa-solid fa-landmark',
    title: 'Pennsylvania Department of State — Voting',
    subtitle: 'vote.pa.gov · statewide election information',
    url: 'https://www.pa.gov/agencies/vote',
  },
  {
    icon: 'fa-solid fa-building-columns',
    title: 'Philadelphia City Commissioners',
    subtitle: 'vote.phila.gov · Philadelphia elections office',
    url: 'https://vote.phila.gov',
  },
];

export function ElectionCenterPage({
  onBack,
  onNavigateToHowItWorks,
  onNavigateToAbout,
  onNavigateToElectionCenter,
  navProps,
}: ElectionCenterPageProps) {
  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>

        <AppHeader
          onNavigateToHowItWorks={onNavigateToHowItWorks}
          onNavigateToAbout={onNavigateToAbout}
          onNavigateToElectionCenter={onNavigateToElectionCenter}
        />

        <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 20 }}>

          {/* ── HERO CARD ── */}
          <div style={{
            background: '#1B4332',
            borderRadius: 12,
            padding: '16px 16px 14px',
            margin: '10px 10px 0',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.8px',
              color: 'rgba(245,166,35,0.75)',
              display: 'block',
              marginBottom: 5,
            }}>
              Election Center
            </span>
            <span style={{
              display: 'block',
              fontSize: 16, fontWeight: 700,
              color: 'white', marginBottom: 4,
              lineHeight: 1.25,
            }}>
              Pennsylvania General Election — November 3, 2026
            </span>
            <span style={{
              display: 'block',
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.5,
            }}>
              Official state and Philadelphia resources for registering to vote, requesting a mail ballot, and finding your polling place.
            </span>
          </div>

          <button
            onClick={onBack}
            style={{
              display: 'block',
              margin: '10px 10px 0',
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              fontWeight: 700,
              color: '#1B4332',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>

          {/* ── SECTION: Key dates ── */}
          <Section label="Key dates">
            <div>
              {KEY_DATES.map((item, i) => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    marginBottom: i < KEY_DATES.length - 1 ? 12 : 0,
                    paddingBottom: i < KEY_DATES.length - 1 ? 12 : 0,
                    borderBottom: i < KEY_DATES.length - 1 ? '1px solid #F4F6F0' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1B4332', whiteSpace: 'nowrap' as const }}>{item.date}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, marginTop: 3 }}>{item.description}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── SECTION: Find your polling place ── */}
          <Section label="Find your polling place">
            <LinkList items={POLLING_PLACE_LINKS} />
          </Section>

          {/* ── SECTION: Register to vote ── */}
          <Section label="Register to vote">
            <LinkList items={REGISTRATION_LINKS} />
          </Section>

          {/* ── SECTION: Official election resources ── */}
          <Section label="Official election resources">
            <LinkList items={OFFICIAL_RESOURCE_LINKS} />
          </Section>

          {/* ── SECTION: About this page ── */}
          <Section label="About this page">
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: 0 }}>
              UVote does not administer elections or process registrations. This page links to official Pennsylvania and Philadelphia government resources. Deadlines and polling locations can change — always confirm with your county election office before Election Day.
            </p>
          </Section>

        </div>

        {navProps && <BottomNav {...navProps} />}
      </div>
    </div>
  );
}

function LinkList({ items }: { items: ResourceLink[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            textDecoration: 'none',
            padding: '9px 0',
            marginTop: i > 0 ? 2 : 0,
            borderTop: i > 0 ? '1px solid #F4F6F0' : 'none',
          }}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#E8F0EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className={item.icon} style={{ fontSize: 14, color: '#1B4332' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>{item.title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{item.subtitle}</div>
          </div>
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0 }} />
        </a>
      ))}
    </div>
  );
}

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
