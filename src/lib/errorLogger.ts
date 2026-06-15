import { supabase } from './supabase';

export async function logError({
  action,
  userId,
  errorMessage,
  errorCode,
}: {
  action: string;
  userId?: string | null;
  errorMessage: string;
  errorCode?: string | null;
}) {
  try {
    await supabase.from('error_logs').insert({
      action,
      user_id: userId ?? null,
      error_message: errorMessage,
      error_code: errorCode ?? null,
      resolved: false,
    });
  } catch {
    // Silently fail — we don't want error logging to cause cascading errors
  }
}
