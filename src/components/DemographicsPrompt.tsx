import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import { DemographicsFields } from './DemographicsFields';
import { EMPTY_DEMOGRAPHICS_ANSWERS, demographicsAnswersToRpcArgs } from '../lib/demographics';
import type { DemographicsAnswers } from '../lib/demographics';

function dismissedKey(userId: string) {
  return `uvote_demographics_dismissed_${userId}`;
}

function extractMsg(err: unknown): string {
  return (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
}

export function DemographicsPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);
  const [answers, setAnswers] = useState<DemographicsAnswers>(EMPTY_DEMOGRAPHICS_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function checkShouldShow() {
      if (localStorage.getItem(dismissedKey(user!.id))) {
        if (!cancelled) {
          setVisible(false);
          setChecking(false);
        }
        return;
      }

      try {
        const { data } = await supabase
          .from('user_demographics')
          .select('user_id')
          .eq('user_id', user!.id)
          .maybeSingle();
        if (!cancelled) {
          setVisible(!data);
        }
      } catch (err) {
        logError({ action: 'check_user_demographics', userId: user!.id, errorMessage: extractMsg(err) });
        if (!cancelled) setVisible(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    checkShouldShow();
    return () => { cancelled = true; };
  }, [user]);

  function handleSkip() {
    if (!user) return;
    localStorage.setItem(dismissedKey(user.id), '1');
    setVisible(false);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.rpc('submit_demographics', demographicsAnswersToRpcArgs(answers));
      if (error) throw error;
      setVisible(false);
    } catch (err) {
      logError({ action: 'submit_demographics', userId: user.id, errorMessage: extractMsg(err) });
      setSaveError("We couldn't save that right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (checking || !visible || !user) return null;

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      border: '1px solid #E2E8E4',
      overflow: 'visible',
    }}>
      <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          color: '#94a3b8',
        }}>
          Help Us Understand Philadelphia
        </span>
      </div>

      <div style={{ padding: '12px 14px 6px' }}>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: '0 0 12px' }}>
          Answering these optional questions lets UVote show how support for a bill breaks down across the community, once enough neighbors have answered too. Your individual answers are never visible to anyone, including UVote admins.
        </p>

        <DemographicsFields answers={answers} onChange={setAnswers} />

        {saveError && (
          <p style={{ fontSize: 13, color: '#F0455A', fontWeight: 600, marginTop: 12 }}>{saveError}</p>
        )}
      </div>

      <div style={{ padding: '10px 14px 14px', display: 'flex', gap: 8 }}>
        <button
          onClick={handleSkip}
          disabled={saving}
          style={{
            flex: 1,
            background: 'white',
            color: '#64748b',
            border: '1px solid #E2E8E4',
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          Skip for now
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            background: '#1B4332',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
