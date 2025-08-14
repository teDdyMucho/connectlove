// Define types for authentication and navigation
export type Page = 'landing' | 'signin' | 'signup' | 'main' | 'creator' | 'profile' | 'messages' | 'search' | '';
export type UserType = 'creator' | 'supporter';

// Lightweight profile info shared across pages
export interface SelectedProfile {
  name: string;
  username?: string;
  avatar?: string;
  bio?: string;
  supporters?: string;
  rating?: number;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  currentPage: Page;
  userType: UserType;
  login: () => void;
  logout: () => void;
  navigateTo: (page: Page) => void;
  setUserTypeValue: (type: UserType) => void;
  // Selected profile to view on creator page
  selectedProfile?: SelectedProfile | null;
  setSelectedProfile: (p: SelectedProfile | null) => void;
}
