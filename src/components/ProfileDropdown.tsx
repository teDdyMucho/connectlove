import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Page } from './types';
import { supabase } from '../lib/supabaseClient';

// Define a generic navigation function type
type NavigateFunction = (page: Page) => void;

interface ProfileDropdownProps {
  onClose?: () => void;
  navigateTo?: NavigateFunction;
  onLogoutRequest?: () => void;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ onClose, navigateTo, onLogoutRequest }) => {
  const { navigateTo: ctxNavigate } = useAuth();
  const [displayName, setDisplayName] = useState<string>('');
  const [avatarInitial, setAvatarInitial] = useState<string>('A');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        let query = supabase
          .from('users')
          .select('full_name, username, avatar_url, user_type')
          .limit(1);
        if (user?.id) {
          query = query.eq('id', user.id);
        } else {
          const email = localStorage.getItem('logged_in_email') || undefined;
          const publicId = localStorage.getItem('public_id') || undefined;
          if (publicId) query = query.eq('id', publicId);
          else if (email) query = query.eq('email', email);
        }
        const { data, error } = await query;
        if (error) {
          console.warn('[ProfileDropdown] profile fetch error:', error.message);
        }
        const row = Array.isArray(data) && data.length ? data[0] as { full_name?: string | null; username?: string | null; user_type?: string | null } : null;
        const name = row?.full_name || row?.username || user?.email?.split('@')[0] || 'User';
        if (mounted) {
          setDisplayName(name);
          setAvatarInitial((name || 'U').charAt(0).toUpperCase());
        }
      } catch (e) {
        console.warn('[ProfileDropdown] profile fetch exception:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleNavigation = (page: Page) => {
    // Prefer prop navigateTo; fallback to context navigateTo
    (navigateTo || ctxNavigate)?.(page);
    if (onClose) {
      onClose();
    }
  };

  const handleLogoutClick = () => {
    if (onLogoutRequest) {
      onLogoutRequest();
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="bg-surface rounded-lg shadow-lg overflow-hidden w-72 border border-soft">
      {/* User Profile Section */}
      <div className="p-4 border-b border-soft">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl">
              {avatarInitial}
            </div>
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-surface"></div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-100 truncate">{displayName || 'User'}</h3>
            <button 
              onClick={() => handleNavigation('profile')}
              className="text-xs text-gray-400 hover:text-primary transition-colors"
            >
              View profile
            </button>
          </div>
        </div>
      </div>
      
      {/* Logout only */}
      <div className="p-3 border-t border-soft mt-2">
        <button 
          onClick={handleLogoutClick}
          className="w-full py-2.5 px-4 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors flex items-center justify-center space-x-2"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>

    </div>
  );
};

export default ProfileDropdown;
