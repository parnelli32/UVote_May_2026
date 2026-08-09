import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

type SignInPageProps = {
  onSwitchToSignUp: () => void;
  onNavigateToAbout: () => void;
  onNavigateToElectionCenter: () => void;
};

export function SignInPage({ onSwitchToSignUp, onNavigateToAbout, onNavigateToElectionCenter }: SignInPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      // Auth state change handled by AuthContext
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      await logError({ action: 'user_sign_in', errorMessage: msg });
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
        setError('Incorrect email or password. Please try again.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#1B4332' }}>
      <div className="w-full max-w-[480px]">
        {/* Logo stack */}
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 16, background: 'white' }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 34, color: '#1B4332' }} />
          </div>
          <span style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '-0.5px', lineHeight: 1, marginTop: 10, display: 'block', textAlign: 'center' }}>
            UVote
          </span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginTop: 4, marginBottom: 22, display: 'block', textAlign: 'center' }}>
            Philadelphia
          </span>
        </div>

        {/* Form card */}
        <div style={{ background: 'white', borderRadius: 14, padding: 18 }}>
          {error && (
            <div className="flex items-start gap-2 rounded-lg p-3 mb-4" style={{ background: '#FEF0EF' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#F0455A' }} />
              <p style={{ fontSize: 12, color: '#c0392b' }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#374151', marginBottom: 5 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="you@example.com"
                className="focus:outline-none focus:ring-2 focus:ring-[#1B4332] w-full disabled:opacity-60"
                style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#0f1724', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#374151', marginBottom: 5 }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="Your password"
                  className="focus:outline-none focus:ring-2 focus:ring-[#1B4332] w-full disabled:opacity-60"
                  style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 40px 10px 12px', fontSize: 13, color: '#0f1724', width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ minHeight: 'unset', color: '#94A3B8', background: 'none', border: 'none', padding: 0 }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full transition-opacity"
              style={{ background: '#F5A623', color: '#7A4F00', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 800, marginTop: 4, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'block', minHeight: 44 }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 10 }}>
            Don't have an account?{' '}
            <button
              onClick={onSwitchToSignUp}
              style={{ color: '#1B4332', fontWeight: 700, background: 'none', border: 'none', padding: 0, minHeight: 'unset', cursor: 'pointer', fontSize: 11, display: 'inline' }}
            >
              Create one
            </button>
          </p>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onNavigateToElectionCenter}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
          >
            Election Center
          </button>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>·</span>
          <button
            onClick={onNavigateToAbout}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
          >
            About UVote
          </button>
        </div>
      </div>
    </div>
  );
}
