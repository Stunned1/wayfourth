import { logger } from '@/utils/logger';
import { err, ok, type Result } from '@/utils/result';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser-client';

export type AuthFailure = {
  readonly message: string;
  readonly code?: string;
};

export async function signInWithEmailAndPassword(input: {
  readonly email: string;
  readonly password: string;
}): Promise<Result<void, AuthFailure>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });

    if (error) {
      return err({ message: error.message, code: String(error.status ?? '') || undefined });
    }

    return ok(undefined);
  } catch (e) {
    logger.error('Unexpected sign-in error', e);
    return err({ message: 'Unexpected error signing in. Please try again.' });
  }
}

export async function signUpWithEmailAndPassword(input: {
  readonly email: string;
  readonly password: string;
}): Promise<Result<void, AuthFailure>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password
    });

    if (error) {
      return err({ message: error.message, code: String(error.status ?? '') || undefined });
    }

    return ok(undefined);
  } catch (e) {
    logger.error('Unexpected sign-up error', e);
    return err({ message: 'Unexpected error signing up. Please try again.' });
  }
}

