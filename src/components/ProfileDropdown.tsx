import React from 'react';
import { User, Wallet, LogOut } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Page } from './types';

// Define a generic navigation function type
type NavigateFunction = (page: Page) => void;

interface ProfileDropdownProps {
  onClose?: () => void;
  navigateTo?: NavigateFunction;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ onClose, navigateTo }) => {
  const { currentPage, logout, navigateTo: ctxNavigate } = useAuth();

  const handleNavigation = (page: Page) => {
    // Prefer prop navigateTo; fallback to context navigateTo
    (navigateTo || ctxNavigate)?.(page);
    if (onClose) {
      onClose();
    }
  };

  const handleLogout = () => {
    // Perform auth logout and close the dropdown
    logout();
    if (onClose) onClose();
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden w-48">
      <div className="py-2">
        <button 
          onClick={() => handleNavigation('profile')}
          className={`flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${currentPage === 'profile' ? 'bg-gray-100' : ''}`}
        >
          <User className="h-4 w-4 mr-3 text-gray-500" />
          <span>Profile</span>
        </button>
        
        <button 
          onClick={() => handleNavigation('messages')}
          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Wallet className="h-4 w-4 mr-3 text-gray-500" />
          <span>Wallet</span>
        </button>
        <button 
          onClick={handleLogout}
          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4 mr-3 text-gray-500" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileDropdown;
