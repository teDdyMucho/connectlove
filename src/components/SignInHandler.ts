import { FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

// Webhook URL for sign-in
const SIGNIN_WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/bd19b116-c24f-4aa6-8066-d583500f2eea';
// Optional n8n webhook to prefill supporter profile fields after successful sign-in
const PREFILL_WEBHOOK_URL = (import.meta as any).env?.VITE_SUPPORTER_PREFILL_WEBHOOK_URL as string | undefined;

export interface SignInFormData {
  email: string;
  password: string;
}

export interface SignInFormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export interface SignInResult {
  success: boolean;
  message?: string;
  errors?: SignInFormErrors;
}

export const validateSignInForm = (formData: SignInFormData): SignInFormErrors => {
  const errors: SignInFormErrors = {};

  if (!formData.email) {
    errors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!formData.password) {
    errors.password = 'Password is required';
  }

  return errors;
};
export const handleSignInSubmit = async (formData: SignInFormData): Promise<SignInResult> => {
  const validationErrors = validateSignInForm(formData);
  if (Object.keys(validationErrors).length > 0) {
    return { success: false, errors: validationErrors };
  }

  try {
    const payloadEncoded = new URLSearchParams({
      email: formData.email,
      password: formData.password,
    }).toString();

    const response = await fetch(SIGNIN_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payloadEncoded,
    });

    const text = await response.text();
    if (!response.ok) {
      return { success: false, errors: { general: `Server error: ${response.status}` } };
    }

    let responseData;
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = text;
    }

    const extractPublicId = (obj: unknown): string | undefined => {
      if (!obj || typeof obj !== 'object') return undefined;
      const rec = obj as Record<string, unknown>;
      const candidates = [
        rec.public_id,
        rec.publicId,
        rec.user_id,
        rec.userId,
        rec.id,
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && c.length > 0) return c;
      }
      return undefined;
    };

    const setSessionFromWebhookTokens = async (payload: any) => {
      try {
        if (!payload || typeof payload !== 'object') return false;
        const acc = payload.access_token || payload.accessToken || payload?.data?.access_token || payload?.data?.accessToken;
        const ref = payload.refresh_token || payload.refreshToken || payload?.data?.refresh_token || payload?.data?.refreshToken;
        if (typeof acc === 'string' && typeof ref === 'string') {
          const { error } = await supabase.auth.setSession({ access_token: acc, refresh_token: ref });
          if (error) {
            console.warn('[SignInHandler] setSession from webhook tokens failed:', error.message);
            return false;
          }
          // Persist user id if available now
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) localStorage.setItem('current_user_id', user.id);
          } catch { /* noop */ }
          return true;
        }
        return false;
      } catch (e) {
        console.warn('[SignInHandler] setSessionFromWebhookTokens exception:', e);
        return false;
      }
    };

    const markClientLoggedIn = (maybePublicId?: string) => {
      try {
        localStorage.setItem('logged_in_email', formData.email);
        if (maybePublicId) {
          localStorage.setItem('public_id', String(maybePublicId));
        }
      } catch {
        // ignore errors
      }
    };

    const ensureSupabaseSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        // If a different user is currently logged in, sign them out first
        const currentEmail = user?.email?.toLowerCase();
        const targetEmail = formData.email.toLowerCase();
        if (user?.id && currentEmail && currentEmail !== targetEmail) {
          await supabase.auth.signOut();
        } else if (user?.id && currentEmail === targetEmail) {
          return; // already signed in as the correct user
        }
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) {
          // Do not fail the webhook-based login path; just log for debugging
          console.warn('[SignInHandler] supabase signInWithPassword failed:', error.message);
          const msg = String(error.message || '').toLowerCase();
          // If user does not exist yet in Supabase Auth, create it silently
          if (msg.includes('invalid login credentials') || msg.includes('user not found')) {
            try {
              const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                  emailRedirectTo: window.location.origin,
                },
              });
              if (signUpErr) {
                console.warn('[SignInHandler] supabase signUp failed:', signUpErr.message);
              } else if (signUpData?.user?.id) {
                // If email confirmations are disabled, we may already have a session. If not, try sign-in again.
                try {
                  const retry = await supabase.auth.signInWithPassword({ email: formData.email, password: formData.password });
                  if (retry.error) {
                    console.warn('[SignInHandler] retry signInWithPassword failed:', retry.error.message);
                  } else if (retry.data?.user?.id) {
                    try { localStorage.setItem('current_user_id', retry.data.user.id); } catch { /* noop */ }
                    return;
                  }
                } catch (re) {
                  console.warn('[SignInHandler] retry sign-in exception:', re);
                }
              }
            } catch (se) {
              console.warn('[SignInHandler] supabase signUp exception:', se);
            }
          }
          // If email is not confirmed, send a magic link to confirm and sign in
          if (typeof error.message === 'string' && error.message.toLowerCase().includes('email not confirmed')) {
            try {
              await supabase.auth.signInWithOtp({
                email: formData.email,
                options: {
                  emailRedirectTo: window.location.origin,
                },
              });
              alert('We sent you a confirmation link. Please check your email to confirm and sign in, then try again.');
            } catch (otpErr) {
              console.warn('[SignInHandler] signInWithOtp failed:', otpErr);
            }
          }
        } else if (data?.user?.id) {
          try { localStorage.setItem('current_user_id', data.user.id); } catch { /* noop */ }
        }
      } catch (e) {
        console.warn('[SignInHandler] ensureSupabaseSession exception:', e);
      }
    };

    // Helper: call n8n prefill webhook (if configured) with user_id and email, then cache fields locally
    const prefillSupporterProfile = async () => {
      if (!PREFILL_WEBHOOK_URL) return; // not configured
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const viewerId = user?.id || localStorage.getItem('current_user_id') || '';
        const email = user?.email || localStorage.getItem('logged_in_email') || formData.email || '';
        if (!viewerId) return;
        const idem = (window as any)?.crypto?.randomUUID ? (window as any).crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const res = await fetch(PREFILL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
          body: JSON.stringify({ user_id: viewerId, email }),
        });
        if (!res.ok) return;
        let data: any = null;
        try { data = await res.json(); } catch { /* ignore */ }
        if (data && typeof data === 'object') {
          const fullName = data.full_name || data.fullName || data.name || '';
          const phone = data.phone_number || data.phoneNumber || '';
          try {
            if (fullName) localStorage.setItem('supporter_full_name', String(fullName));
            if (phone) localStorage.setItem('supporter_phone_number', String(phone));
          } catch { /* noop */ }
        }
      } catch (e) {
        console.warn('[SignInHandler] prefillSupporterProfile exception:', e);
      }
    };

    if (Array.isArray(responseData) && responseData.length > 0) {
      const first = responseData[0];
      if (first.success === true) {
        markClientLoggedIn(extractPublicId(first));
        const usedTokens = await setSessionFromWebhookTokens(first);
        if (!usedTokens) {
          await ensureSupabaseSession();
        }
        await prefillSupporterProfile();
        return { success: true, message: first.message || 'Login successful' };
      }
      if (first.success === false) {
        const msg = first.message || 'Invalid credentials';
        if (msg.toLowerCase().includes('invalid credentials')) {
          return { success: false, errors: { email: 'Invalid email or password', password: 'Invalid email or password' } };
        } else {
          return { success: false, errors: { general: msg } };
        }
      }
    }

    if (typeof responseData === 'string') {
      const lower = responseData.toLowerCase();
      if (lower.includes('login successful')) {
        markClientLoggedIn();
        await ensureSupabaseSession();
        await prefillSupporterProfile();
        return { success: true, message: 'Login successful' };
      }
      if (lower.includes('invalid credentials')) {
        return { success: false, errors: { email: 'Invalid email or password', password: 'Invalid email or password' } };
      }
      return { success: false, errors: { general: responseData } };
    }

    if (responseData && typeof responseData === 'object') {
      const data = responseData.data ?? responseData;
      if (data?.success === true) {
        markClientLoggedIn(extractPublicId(data));
        const usedTokens = await setSessionFromWebhookTokens(data);
        if (!usedTokens) {
          await ensureSupabaseSession();
        }
        await prefillSupporterProfile();
        return { success: true, message: data.message || 'Login successful' };
      }
      if (data?.success === false) {
        const msg = data.message || 'Invalid credentials';
        if (msg.toLowerCase().includes('invalid credentials')) {
          return { success: false, errors: { email: 'Invalid email or password', password: 'Invalid email or password' } };
        } else {
          return { success: false, errors: { general: msg } };
        }
      }
    }

    return { success: false, errors: { general: 'Unexpected response format' } };
  } catch (error) {
    return {
      success: false,
      errors: { general: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
};

export const useSignInForm = () => {
  return {
    handleSubmit: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData: SignInFormData = {
        email: (form.elements.namedItem('email') as HTMLInputElement)?.value || '',
        password: (form.elements.namedItem('password') as HTMLInputElement)?.value || '',
      };
      return await handleSignInSubmit(formData);
    },
  };
};
