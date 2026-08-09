import { useAuth } from '../context/AuthContext';
import { HeaderDropdown } from './HeaderDropdown';

type AppHeaderProps = {
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  onNavigateToElectionCenter: () => void;
};

export function AppHeader({ onNavigateToHowItWorks, onNavigateToAbout, onNavigateToElectionCenter }: AppHeaderProps) {
  const { districtName } = useAuth();

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between px-3.5"
      style={{ background: 'white', borderBottom: '1px solid #E2E8E4', height: 54 }}
    >
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-hand" style={{ fontSize: 20, color: '#1B4332' }} />
        <div className="flex flex-col" style={{ gap: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#0f1724', letterSpacing: '-0.3px', lineHeight: 1 }}>UVote</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#94A3B8', lineHeight: 1 }}>Philadelphia</span>
        </div>
      </div>
      <HeaderDropdown
        districtName={districtName}
        onNavigateToHowItWorks={onNavigateToHowItWorks}
        onNavigateToAbout={onNavigateToAbout}
        onNavigateToElectionCenter={onNavigateToElectionCenter}
      />
    </header>
  );
}
