import { useAuth } from '../context/AuthContext';

export type NavTab = 'home' | 'bills' | 'myrep' | 'profile' | 'admin';

type BottomNavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

export function BottomNav({ activeTab, onTabChange, onNavigateToProfile, onNavigateToAdmin }: BottomNavProps) {
  const { profile } = useAuth();

  return (
    <nav
      className="flex-shrink-0 flex"
      style={{ background: 'white', borderTop: '1px solid #E2E8E4', height: 60, paddingTop: 8, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <NavTabButton
        icon={<i className="fa-solid fa-house" style={{ fontSize: 16 }} />}
        label="Home"
        active={activeTab === 'home'}
        onClick={() => onTabChange('home')}
      />
      <NavTabButton
        icon={<i className="fa-solid fa-file-lines" style={{ fontSize: 16 }} />}
        label="Bills"
        active={activeTab === 'bills'}
        onClick={() => onTabChange('bills')}
      />
      <NavTabButton
        icon={<i className="fa-solid fa-user" style={{ fontSize: 16 }} />}
        label="My Rep"
        active={activeTab === 'myrep'}
        onClick={() => onTabChange('myrep')}
      />
      <NavTabButton
        icon={<i className="fa-solid fa-circle-user" style={{ fontSize: 16 }} />}
        label="Profile"
        active={activeTab === 'profile'}
        onClick={() => { onTabChange('profile'); onNavigateToProfile(); }}
      />
      {profile?.is_admin && (
        <NavTabButton
          icon={<i className="fa-solid fa-grip" style={{ fontSize: 16 }} />}
          label="Admin"
          active={activeTab === 'admin'}
          onClick={onNavigateToAdmin}
        />
      )}
    </nav>
  );
}

function NavTabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center transition-colors"
      style={{ gap: 2, color: active ? '#1B4332' : '#94A3B8', minHeight: 44 }}
    >
      {icon}
      <span style={{ fontSize: 9, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
