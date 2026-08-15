import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { lookupAddressDistrict } from '../lib/ais';
import { logError } from '../lib/errorLogger';
import { AddressInput } from '../components/AddressInput';
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { PHILLY_COUNCIL_BODY_ID } from '../data/legislativeGuides';

type SignUpPageProps = {
  onSwitchToSignIn: () => void;
  onNavigateToElectionCenter: () => void;
};

export function SignUpPage({ onSwitchToSignIn, onNavigateToElectionCenter }: SignUpPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [address, setAddress] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  function validate() {
    const errors: Record<string, string> = {};
    if (!username.trim()) errors.username = 'Username is required';
    if (!email.trim()) errors.email = 'Email is required';
    if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (!address.trim()) errors.address = 'Street address is required';
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    // Step 1: Create auth user
    let authUserId: string | null = null;
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      authUserId = authData.user?.id ?? null;
      if (!authUserId) throw new Error('User creation failed — no user ID returned');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      await logError({ action: 'user_signup', errorMessage: msg });
      setError('Could not create your account. Please try again.');
      setLoading(false);
      return;
    }

    // Step 2: AIS lookup
    let councilDistrict: string;
    let aisLat: number | null = null;
    let aisLng: number | null = null;
    try {
      const result = await lookupAddressDistrict(address.trim());
      if (!result.success) {
        await logError({
          action: 'ais_lookup_failed',
          userId: authUserId,
          errorMessage: result.error,
        });
        setError(
          "We couldn't verify your address. Please check it and try again, or make sure your address is within Philadelphia."
        );
        setLoading(false);
        return;
      }
      councilDistrict = result.councilDistrict;
      aisLat = result.lat;
      aisLng = result.lng;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      await logError({ action: 'ais_lookup', userId: authUserId, errorMessage: msg });
      setError(
        "We couldn't verify your address. Please check it and try again, or make sure your address is within Philadelphia."
      );
      setLoading(false);
      return;
    }

    // Step 3: Look up district_id
    let districtId: string | null = null;
    let legislativeBodyId: string | null = null;
    try {
      // Scoped to legislative_body_id, not just district_number: PA House/Senate
      // districts now share numeric labels with Council districts (e.g. both a
      // Council "District 5" and a PA House "District 5" exist), so filtering
      // on district_number alone returns multiple rows and .maybeSingle() throws.
      const { data: districtData, error: districtError } = await supabase
        .from('districts')
        .select('district_id, legislative_body_id')
        .eq('district_number', councilDistrict)
        .eq('legislative_body_id', PHILLY_COUNCIL_BODY_ID)
        .not('district_number', 'eq', 'At-Large')
        .maybeSingle();

      if (districtError) throw districtError;
      districtId = districtData?.district_id ?? null;
      legislativeBodyId = districtData?.legislative_body_id ?? null;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      await logError({ action: 'district_lookup', userId: authUserId, errorMessage: msg });
      setError('We had trouble matching your address to a council district. Please try again.');
      setLoading(false);
      return;
    }

    // Step 4: Insert user profile
    try {
      const { error: insertError } = await supabase.from('users').insert({
        user_id: authUserId,
        username: username.trim(),
        email: email.trim(),
        street_address: address.trim(),
        district_id: districtId,
        is_admin: false,
      });
      if (insertError) throw insertError;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      const code = (err as { code?: string }).code ?? null;
      await logError({
        action: 'user_profile_insert',
        userId: authUserId,
        errorMessage: msg,
        errorCode: code,
      });
      setError('Your account was created but we could not save your profile. Please contact support.');
      setLoading(false);
      return;
    }

    // Step 5: mirror the council district into user_districts (the
    // migration backfill only covers users who existed before it ran — new
    // signups need this written going forward too). Not user-facing; a
    // failure here shouldn't block account creation since users.district_id
    // (written above) is still the live read path.
    if (districtId && legislativeBodyId) {
      const { error: userDistrictError } = await supabase.from('user_districts').insert({
        user_id: authUserId,
        legislative_body_id: legislativeBodyId,
        district_id: districtId,
      });
      if (userDistrictError) {
        await logError({
          action: 'user_districts_council_insert',
          userId: authUserId,
          errorMessage: userDistrictError.message,
          errorCode: userDistrictError.code,
        });
      }
    }

    // Step 6: best-effort PA House/Senate resolution — never blocks signup.
    // A boundary-seam miss or lookup failure here means the user is fully
    // signed up for City Council and picks up their state districts later
    // (bulk backfill / next login), not a hard gate the way the council AIS
    // lookup above is.
    if (aisLat != null && aisLng != null) {
      try {
        const { data: stateMatches, error: stateError } = await supabase.rpc('resolve_user_state_districts', {
          p_lat: aisLat,
          p_lng: aisLng,
        });
        if (stateError) throw stateError;
        for (const match of stateMatches ?? []) {
          const { error: insertErr } = await supabase.from('user_districts').insert({
            user_id: authUserId,
            legislative_body_id: match.legislative_body_id,
            district_id: match.district_id,
          });
          if (insertErr) {
            await logError({
              action: 'user_districts_state_insert',
              userId: authUserId,
              errorMessage: insertErr.message,
              errorCode: insertErr.code,
            });
          }
        }
        if (!stateMatches || stateMatches.length === 0) {
          await logError({
            action: 'state_district_resolution_no_match',
            userId: authUserId,
            errorMessage: 'resolve_user_state_districts returned no matches for signup address',
          });
        }
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        await logError({ action: 'state_district_resolution', userId: authUserId, errorMessage: msg });
        // Deliberately no setError() — this must never block signup.
      }
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#1B4332' }}>
        <div className="w-full max-w-[480px]">
          <div style={{ background: 'white', borderRadius: 14, padding: 24, textAlign: 'center' }}>
            <div className="flex justify-center mb-4">
              <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: '#E6F5EE' }}>
                <CheckCircle className="w-7 h-7" style={{ color: '#1DB97A' }} />
              </div>
            </div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#0f1724', marginBottom: 6 }}>Account Created</p>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Your account is ready. Sign in to get started with UVote.
            </p>
            <button
              onClick={onSwitchToSignIn}
              style={{ width: '100%', background: '#F5A623', color: '#7A4F00', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'block', minHeight: 44 }}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-10" style={{ background: '#1B4332' }}>
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
            {/* Username */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#374151', marginBottom: 5 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                placeholder="Choose a username"
                className="focus:outline-none focus:ring-2 focus:ring-[#1B4332] w-full disabled:opacity-60"
                style={{ background: fieldErrors.username ? '#FEF0EF' : '#F4F6F0', border: `1px solid ${fieldErrors.username ? '#F0455A' : '#E2E8E4'}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#0f1724', boxSizing: 'border-box' }}
              />
              {fieldErrors.username && (
                <p style={{ fontSize: 10, color: '#c0392b', marginTop: 3 }}>{fieldErrors.username}</p>
              )}
            </div>

            {/* Email */}
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
                style={{ background: fieldErrors.email ? '#FEF0EF' : '#F4F6F0', border: `1px solid ${fieldErrors.email ? '#F0455A' : '#E2E8E4'}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#0f1724', boxSizing: 'border-box' }}
              />
              {fieldErrors.email && (
                <p style={{ fontSize: 10, color: '#c0392b', marginTop: 3 }}>{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
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
                  placeholder="At least 6 characters"
                  className="focus:outline-none focus:ring-2 focus:ring-[#1B4332] w-full disabled:opacity-60"
                  style={{ background: fieldErrors.password ? '#FEF0EF' : '#F4F6F0', border: `1px solid ${fieldErrors.password ? '#F0455A' : '#E2E8E4'}`, borderRadius: 8, padding: '10px 40px 10px 12px', fontSize: 13, color: '#0f1724', width: '100%', boxSizing: 'border-box' }}
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
              {fieldErrors.password && (
                <p style={{ fontSize: 10, color: '#c0392b', marginTop: 3 }}>{fieldErrors.password}</p>
              )}
            </div>

            {/* Address */}
            <div style={{ marginBottom: 12 }}>
              <AddressInput
                value={address}
                onChange={setAddress}
                error={fieldErrors.address}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full transition-opacity"
              style={{ background: '#F5A623', color: '#7A4F00', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 800, marginTop: 4, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'block', minHeight: 44 }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 10 }}>
            Already have an account?{' '}
            <button
              onClick={onSwitchToSignIn}
              style={{ color: '#1B4332', fontWeight: 700, background: 'none', border: 'none', padding: 0, minHeight: 'unset', cursor: 'pointer', fontSize: 11, display: 'inline' }}
            >
              Sign in
            </button>
          </p>
        </div>

        <button
          onClick={onNavigateToElectionCenter}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: 'rgba(255,255,255,0.5)',
            marginTop: 16, display: 'block', textAlign: 'center',
            cursor: 'pointer', width: '100%',
          }}
        >
          Election Center
        </button>
      </div>
    </div>
  );
}
