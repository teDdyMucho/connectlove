import React, { FormEvent, useState } from 'react';
import { Settings } from 'lucide-react';
import { UserType, useSignUpForm, SignUpFormErrors } from './SignUpFormHandler';
import Popup from './Popup';

interface SignUpFormProps {
  userType: UserType;
  navigateTo: (page: 'landing' | 'signin' | 'signup') => void;
}

const SignUpForm: React.FC<SignUpFormProps> = ({ userType, navigateTo }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<SignUpFormErrors>({});
  const [showPopup, setShowPopup] = useState(false);
  const { handleSubmit } = useSignUpForm();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    setIsSubmitting(true);
    setFormErrors({});
    
    try {
      const result = await handleSubmit(event, userType);
      
      if (result.success) {
        // Show popup on successful submission
        setShowPopup(true);
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
    navigateTo('signin');
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-xl shadow-lg">
      <Popup 
        message="Account created successfully" 
        buttonText="OK" 
        onButtonClick={handlePopupClose} 
        isOpen={showPopup} 
      />
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Join as a {userType === 'creator' ? 'Creator' : 'Supporter'}
        </h2>
        <p className="text-gray-600">
          {userType === 'creator' 
            ? 'Share your creativity and connect with supporters who appreciate your work'
            : 'Discover amazing creators and support their incredible journey'
          }
        </p>
      </div>
      
      {formErrors.general && (
        <div className="p-4 mb-6 rounded-lg bg-red-100 text-red-800">
          {formErrors.general}
        </div>
      )}
      
      <form className="space-y-6" onSubmit={onSubmit}>
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">Username</label>
          <input 
            id="username"
            name="username"
            type="text" 
            placeholder="Enter your username"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.username ? 'border-red-500' : 'border-gray-300'}`}
            required
          />
          {formErrors.username && (
            <p className="mt-1 text-sm text-red-600">{formErrors.username}</p>
          )}
        </div>
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
          <input 
            id="fullName"
            name="fullName"
            type="text" 
            placeholder="Enter your full name"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.fullName ? 'border-red-500' : 'border-gray-300'}`}
            required
          />
          {formErrors.fullName && (
            <p className="mt-1 text-sm text-red-600">{formErrors.fullName}</p>
          )}
        </div>
        
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
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
          <input 
            id="phoneNumber"
            name="phoneNumber"
            type="tel" 
            placeholder="Phone number"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.phoneNumber ? 'border-red-500' : 'border-gray-300'}`}
            required
          />
          {formErrors.phoneNumber && (
            <p className="mt-1 text-sm text-red-600">{formErrors.phoneNumber}</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
          <input 
            id="password"
            name="password"
            type="password" 
            placeholder="Create a password"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.password ? 'border-red-500' : 'border-gray-300'}`}
            required
            minLength={8}
          />
          {formErrors.password && (
            <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
          )}
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
          <input 
            id="confirmPassword"
            name="confirmPassword"
            type="password" 
            placeholder="Confirm password"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${formErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
            required
          />
          {formErrors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600">{formErrors.confirmPassword}</p>
          )}
        </div>

        <button 
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors flex items-center justify-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <Settings className="h-5 w-5 mr-2" />
              Create {userType === 'creator' ? 'Creator' : 'Supporter'} Account
            </>
          )}
        </button>
      </form>
      
      <p className="text-center mt-8 text-gray-600">
        Already have an account?{' '}
        <button 
          onClick={() => navigateTo('signin')}
          className="text-primary hover:text-primary-dark font-semibold"
        >
          Sign in here
        </button>
      </p>
    </div>
  );
};

export default SignUpForm;
