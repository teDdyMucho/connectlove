import React, { createContext, useContext, useState, useEffect } from 'react';

// Import types from separate file
import { Page, UserType, AuthContextType, SelectedProfile } from './types';

// AuthContextType is now imported from types.ts

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Check localStorage for existing auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const saved = localStorage.getItem('isAuthenticated');
    return saved === 'true';
  });
  
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const saved = localStorage.getItem('currentPage') as Page | null;
    return saved || 'landing';
  });
  
  const [userType, setUserType] = useState<UserType>(() => {
    const saved = localStorage.getItem('userType') as UserType | null;
    return saved || 'creator';
  });
  // selected profile to view on creator page (persist to localStorage)
  const [selectedProfile, setSelectedProfile] = useState<SelectedProfile | null>(() => {
    try {
      const raw = localStorage.getItem('selectedProfile');
      return raw ? (JSON.parse(raw) as SelectedProfile) : null;
    } catch {
      return null;
    }
  });

  // Update localStorage when state changes
  useEffect(() => {
    localStorage.setItem('isAuthenticated', isAuthenticated.toString());
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem('userType', userType);
  }, [userType]);

  // Persist selectedProfile whenever it changes
  useEffect(() => {
    try {
      if (selectedProfile) {
        localStorage.setItem('selectedProfile', JSON.stringify(selectedProfile));
      } else {
        localStorage.removeItem('selectedProfile');
      }
    } catch {
      /* ignore */
    }
  }, [selectedProfile]);

  // Auth methods
  const login = () => setIsAuthenticated(true);
  const logout = () => {
    setIsAuthenticated(false);
    setCurrentPage('landing');
  };
  
  const navigateTo = (page: Page) => {
    // If trying to access protected pages while not authenticated
    if ((page === 'main' || page === 'creator' || page === 'profile') && !isAuthenticated) {
      setCurrentPage('signin');
      return;
    }
    
    // If logging out
    if (page === 'landing' && currentPage === 'main') {
      logout();
      return;
    }
    
    setCurrentPage(page);
  };
  
  const setUserTypeValue = (type: UserType) => setUserType(type);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      currentPage, 
      userType, 
      login, 
      logout, 
      navigateTo, 
      setUserTypeValue,
      selectedProfile,
      setSelectedProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
