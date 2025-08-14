import { FormEvent } from 'react';

// Webhook URL for sign-in
const SIGNIN_WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/bd19b116-c24f-4aa6-8066-d583500f2eea';

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

    if (Array.isArray(responseData) && responseData.length > 0) {
      const first = responseData[0];
      if (first.success === true) {
        markClientLoggedIn(extractPublicId(first));
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
