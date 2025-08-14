import React, { FormEvent, useState } from 'react';
import { Heart, ArrowLeft } from 'lucide-react';
import { useSignInForm, SignInFormErrors } from './SignInHandler';
import Popup from './Popup';
import { useAuth } from './AuthContext';

interface SignInPageProps {
  navigateTo: (page: string) => void;
}

const SignInPage: React.FC<SignInPageProps> = ({ navigateTo }) => {
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<SignInFormErrors>({});
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const { handleSubmit } = useSignInForm();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (isSubmitting) return; // guard against double submit
    setIsSubmitting(true);
    setFormErrors({});
    
    try {
      const result = await handleSubmit(event);
      
      if (result.success) {
        // Show popup on successful submission
        setPopupMessage(result.message || 'Login successful');
        setShowPopup(true);
        // Auto-close and navigate after short delay (single action needed)
        window.setTimeout(() => {
          handlePopupClose();
        }, 800);
      } else if (result.errors) {
        // Display field-specific errors
        setFormErrors(result.errors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handlePopupClose = () => {
    setShowPopup(false);
    login(); // Set authentication state to true
    navigateTo('main'); // Navigate to main page after successful sign-in
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Popup 
            message={popupMessage} 
            buttonText="OK" 
            onButtonClick={handlePopupClose} 
            isOpen={showPopup} 
          />
          <button 
            onClick={() => navigateTo('landing')}
            className="flex items-center text-primary hover:text-primary-dark transition-colors mb-8"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Home
          </button>
          
          <div className="flex items-center justify-center mb-8">
            <Heart className="h-8 w-8 text-primary mr-2" />
            <span className="text-2xl font-bold text-primary">ConnectLove</span>
          </div>
          
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
            <p className="text-gray-600">Sign in to your account to continue your journey</p>
          </div>
          
          {formErrors.general && (
            <div className="p-4 mb-6 rounded-lg bg-red-100 text-red-800">
              {formErrors.general}
            </div>
          )}
          
          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input 
                id="email"
                name="email"
                type="email" 
                placeholder="Enter your email"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                required
              />
              {formErrors.email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input 
                id="password"
                name="password"
                type="password" 
                placeholder="Enter your password"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                required
              />
              {formErrors.password && (
                <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
              )}
            </div>
            
            <div className="text-right">
              <a href="#" className="text-primary hover:text-primary-dark text-sm">Forgot password?</a>
            </div>
            
            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
            
            <div className="text-center mt-6">
              <p className="text-gray-600">
                Don't have an account?{' '}
                <button 
                  type="button"
                  onClick={() => navigateTo('signup')}
                  className="text-primary hover:text-primary-dark font-medium"
                >
                  Sign Up
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;