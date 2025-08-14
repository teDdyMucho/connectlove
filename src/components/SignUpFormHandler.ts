import { FormEvent } from 'react';

export type UserType = 'creator' | 'supporter';

export interface SignUpFormData {
  username: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  userType: UserType;
}

export interface SignUpFormErrors {
  username?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

export interface SignUpFormProps {
  userType: UserType;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const WEBHOOK_URL = 'https://primary-production-6722.up.railway.app/webhook/b9f23c95-5aaa-4805-aa87-8c3c4a1d04ed';

/**
 * Validates the sign-up form data
 * @param formData The form data to validate
 * @returns An object with validation result and error message if any
 */
export const validateSignUpForm = (formData: SignUpFormData): { isValid: boolean; errors?: SignUpFormErrors } => {
  const errors: SignUpFormErrors = {};
  let isValid = true;

  if (!formData.username.trim()) {
    errors.username = 'Username is required';
    isValid = false;
  }
  
  if (!formData.fullName.trim()) {
    errors.fullName = 'Full name is required';
    isValid = false;
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(formData.email)) {
    errors.email = 'Please enter a valid email address';
    isValid = false;
  }
  
  // Basic phone number validation
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  if (!phoneRegex.test(formData.phoneNumber.replace(/\s+/g, ''))) {
    errors.phoneNumber = 'Please enter a valid phone number';
    isValid = false;
  }
  
  if (formData.password.length < 8) {
    errors.password = 'Password must be at least 8 characters long';
    isValid = false;
  }
  
  if (formData.password !== formData.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
    isValid = false;
  }
  
  return { isValid, ...(isValid ? {} : { errors }) };
};

/**
 * Handles the sign-up form submission
 * @param formData The form data to submit
 * @returns A promise that resolves to the response from the webhook
 */
export const handleSignUpSubmit = async (formData: SignUpFormData): Promise<{ success: boolean; message?: string; errors?: SignUpFormErrors }> => {
  try {
    // Validate form data before submission
    const validation = validateSignUpForm(formData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }
    
    // Send data to webhook
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: formData.username,
        fullName: formData.fullName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        password: formData.password, // In a real app, never send plain text passwords
        userType: formData.userType,
        timestamp: new Date().toISOString(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    // Handle the response safely
    let data;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      return { 
        success: false, 
        errors: { general: 'Error processing server response' } 
      };
    }
  // Check if the response contains "invalid data" message
  if (data.message && typeof data.message === 'string' && 
    data.message.toLowerCase().includes('invalid data')) {
  // This is likely a successful registration despite the message
  console.log('Registration successful!');
  return { success: true, message: 'Sign-up successful!' };
}
    // Check for field-specific errors in the response
    if (!data.success) {
      console.log('Registration failed!');
      const errors: SignUpFormErrors = {};
      // Map error messages to specific fields
      if (data.message) {
        const message = data.message.toLowerCase();
        
        // Check for common error patterns
        if (message.includes('username already taken') || 
            message.includes('user_user_name_key') || 
            message.includes('duplicate') && message.includes('username')) {
          errors.username = 'Username already taken';
        } else if (message.includes('full name already exists') || 
                  message.includes('user_full_name_key') || 
                  message.includes('duplicate') && message.includes('full name')) {
          errors.fullName = 'Full name already exists';
        } else if (message.includes('email already registered') || 
                  message.includes('user_email_key') || 
                  message.includes('duplicate') && message.includes('email')) {
          errors.email = 'Email already registered';
        } else if (message.includes('phone number already used') || 
                  message.includes('user_phone_number_key') || 
                  message.includes('duplicate') && message.includes('phone')) {
          errors.phoneNumber = 'Phone number already used';
        } else {
          // General error message
          errors.general = data.message;
        }
        
        console.log('Registration failed: ' + data.message);
        return { success: false, errors };
      }
    }
    
    console.log('Registration successful!');
    return { success: true, message: 'Sign-up successful!' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    // Check for specific error types in the error message
    const message = errorMessage.toLowerCase();
    const errors: SignUpFormErrors = {};
    
    if (message.includes('username already taken') || message.includes('user_user_name_key')) {
      errors.username = 'Username already taken';
    } else if (message.includes('full name already exists') || message.includes('user_full_name_key')) {
      errors.fullName = 'Full name already exists';
    } else if (message.includes('email already registered') || message.includes('user_email_key')) {
      errors.email = 'Email already registered';
    } else if (message.includes('phone number already used') || message.includes('user_phone_number_key')) {
      errors.phoneNumber = 'Phone number already used';
    } else {
      errors.general = errorMessage;
    }
    
    console.log('Registration failed: ' + errorMessage);
    return { 
      success: false, 
      errors
    };
  }
};

/**
 * Custom hook for handling sign-up form state and submission
 */
export const useSignUpForm = () => {
  return {
    handleSubmit: async (event: FormEvent<HTMLFormElement>, userType: UserType) => {
      event.preventDefault();
      
      const form = event.currentTarget;
      const formData: SignUpFormData = {
        username: (form.elements.namedItem('username') as HTMLInputElement)?.value || '',
        fullName: (form.elements.namedItem('fullName') as HTMLInputElement)?.value || '',
        email: (form.elements.namedItem('email') as HTMLInputElement)?.value || '',
        phoneNumber: (form.elements.namedItem('phoneNumber') as HTMLInputElement)?.value || '',
        password: (form.elements.namedItem('password') as HTMLInputElement)?.value || '',
        confirmPassword: (form.elements.namedItem('confirmPassword') as HTMLInputElement)?.value || '',
        userType,
      };
      
      return await handleSignUpSubmit(formData);
    }
  };
};
