import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Search, Bell, User, Home, Video } from 'lucide-react';
import './mainPage.css';
import '../components/creatorDashboard/CreatorDashboard.css';
import ProfileDropdown from '../components/ProfileDropdown';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../components/AuthContext';
import Feed from '../components/Feed';

interface MainPageProps {
  navigateTo: (page: string) => void;
}

const MainPage: React.FC<MainPageProps> = ({ navigateTo }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { setSelectedProfile, setUserTypeValue, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  // removed user display name/initial from sidebar header

  // Header search state
  const [headerQuery, setHeaderQuery] = useState('');
  // Signal to force refresh of the Feed component after a post is created
  const [feedRefreshToken] = useState<number>(0);
  
  // CreatorDashboard-like Create Post states (exact component & logic)
  type ProfileInfo = {
    email: string | null;
    full_name: string | null;
    username: string | null;
    avatar_url?: string | null;
    user_type?: string | null;
    user_id?: string | null;
    id?: string | null;
  };

  const scrollToTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { /* noop */ }
  };

  const scrollToFeed = () => {
    try {
      const el = document.getElementById('news-feed');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch { /* noop */ }
  };

  const handleLogoutRequest = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch { /* noop */ }
    logout();
    setShowLogoutModal(false);
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(null);
  
  // removed promo slider data
  type UserRow = {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    user_type: string | null;
    email?: string | null;
  };
  type ProfileResult = {
    id: string;
    name: string;
    avatar: string;
    category?: string;
  };
  const [suggestions, setSuggestions] = useState<ProfileResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const latestHeaderQueryRef = useRef('');

  const toggleDropdown = () => setShowDropdown((s) => !s);
  const closeDropdown = () => setShowDropdown(false);

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(event.target as Node)
    ) {
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Resolve and cache the current user's display name for the UI (strictly from Supabase session)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          if (mounted) {
            setCurrentProfile(null);
          }
          return;
        }
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, username, avatar_url, user_type, email')
          .eq('id', user.id)
          .limit(1);
        if (error) {
          console.warn('[MainPage] profile fetch error:', error.message);
        }
        const row = Array.isArray(data) && data.length ? data[0] as { id?: string | null; full_name?: string | null; username?: string | null; avatar_url?: string | null; user_type?: string | null; email?: string | null } : null;
        if (mounted) {
          setCurrentProfile({
            id: row?.id || user.id,
            user_id: row?.id || user.id,
            email: row?.email ?? user.email ?? null,
            full_name: row?.full_name ?? null,
            username: row?.username ?? null,
            avatar_url: row?.avatar_url ?? null,
            user_type: row?.user_type ?? null,
          });
        }
      } catch (e) {
        console.warn('[MainPage] profile fetch exception:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Removed Create New Post handlers and helpers

  // Debounced live suggestions for header search
  useEffect(() => {
    if (!headerQuery.trim()) {
      setSuggestions([]);
      setShowSearchDropdown(false);
      return;
    }
    latestHeaderQueryRef.current = headerQuery;
    const q = headerQuery.trim();
    const t = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('username, full_name, avatar_url, user_type, email')
          .or(`full_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(8);
        if (latestHeaderQueryRef.current !== headerQuery) return;
        if (error) {
          console.error('Header live search error:', error.message);
          setSuggestions([]);
          setShowSearchDropdown(false);
          return;
        }
        const rows = (data || []) as UserRow[];
        const mapped: ProfileResult[] = rows.map((u) => ({
          id: u.username || u.full_name || 'user',
          name: u.full_name || u.username || 'User',
          avatar: u.avatar_url || 'https://i.pravatar.cc/150',
          category: u.user_type || 'User',
        }));
        setSuggestions(mapped);
        setShowSearchDropdown(mapped.length > 0);
      } catch (e) {
        console.error('Header live search exception:', e);
        setSuggestions([]);
        setShowSearchDropdown(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [headerQuery]);

  const handleSelectSuggestion = (profile: ProfileResult) => {
    // Self vs creator route
    let isSelf = false;
    try {
      const publicId = localStorage.getItem('public_id') || '';
      const email = localStorage.getItem('logged_in_email') || '';
      const storedUsername = localStorage.getItem('username') || '';
      const candidates = [publicId, email, storedUsername]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      const targetIds = [profile.id, profile.name]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      isSelf = candidates.some((c) => targetIds.includes(c));
    } catch { isSelf = false; }
    setShowSearchDropdown(false);
    if (isSelf) { navigateTo('profile'); return; }
    setSelectedProfile({ name: profile.name, username: profile.id, avatar: profile.avatar });
    // Push friendly URL for deep link
    try {
      const userIdForUrl = encodeURIComponent(profile.id || profile.name);
      window.history.pushState({}, '', `/profile/${userIdForUrl}`);
    } catch { /* noop */ }
    navigateTo('creator');
  };

  // Feed posts are now handled by the Feed component

  // (Removed) resolveCurrentUserId — we now require a real auth session for posting to satisfy RLS

  // Become a Creator: route user to the Creator sign-up (verification) flow
  const handleBecomeCreator = async () => {
    try {
      // If not signed in, go to signin first; otherwise proceed to signup with creator mode
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        navigateTo('signin');
        return;
      }
      setUserTypeValue('creator');
      navigateTo('signup');
    } catch {
      setUserTypeValue('creator');
      navigateTo('signup');
    }
  };

  // Navigate to Creator Dashboard when already a creator
  const handleGoToCreatorView = () => {
    try { navigateTo('creator'); } catch { /* noop */ }
  };

  // Mock data for suggested creators
  const suggestedCreators = [
    { id: 1, name: 'Emma Grace', avatar: 'https://i.pravatar.cc/150?img=3', category: 'Fitness & Wellness', supporters: '12.4K', rating: 4.9 },
    { id: 2, name: 'Maya Chen', avatar: 'https://i.pravatar.cc/150?img=4', category: 'Art & Design', supporters: '8.6K', rating: 4.8 },
    { id: 3, name: 'Zoe Williams', avatar: 'https://i.pravatar.cc/150?img=7', category: 'Lifestyle', supporters: '22.1K', rating: 4.7 },
    { id: 4, name: 'Isabella Rose', avatar: 'https://i.pravatar.cc/150?img=8', category: 'Music', supporters: '12.8K', rating: 4.6 },
    { id: 5, name: 'Aria Storm', avatar: 'https://i.pravatar.cc/150?img=10', category: 'Gaming', supporters: '15.6K', rating: 4.8 },
    { id: 6, name: 'Lily Parker', avatar: 'https://i.pravatar.cc/150?img=11', category: 'Cooking', supporters: '9.5K', rating: 4.9 }
  ];

  return (
    <div className="main-page bg-background text-gray-100 min-h-screen flex flex-col relative scroll-smooth overflow-x-hidden">

      {/* Header */}
      <header className="bg-surface shadow-sm h-16 px-3 sm:px-4 fixed top-0 left-0 right-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-surface/90 border-b border-soft">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between">
          <div className="text-primary font-bold text-lg sm:text-xl tracking-tight flex items-center">
            <img src="/images/Clove_logo2.png" alt="ConnectLove Logo" className="h-12 sm:h-12 w-auto" />
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Search - Hidden on mobile, shown as icon that expands */}
            <div className="relative hidden md:block">
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = headerQuery.trim();
                  if (q) {
                    try { localStorage.setItem('pending_search_query', q); } catch { /* noop */ }
                  }
                  navigateTo('search');
                }}
                onFocus={() => { if (suggestions.length > 0 && headerQuery.trim()) setShowSearchDropdown(true); }}
                onBlur={() => { window.setTimeout(() => setShowSearchDropdown(false), 120); }}
              >
                <input
                  type="text"
                  placeholder="Search..."
                  className="bg-surface rounded-full py-2 pl-4 pr-9 text-sm w-48 sm:w-60 md:w-72 border border-soft focus:border-primary/60 focus:outline-none focus:ring-0 transition-colors text-gray-100"
                  value={headerQuery}
                  onChange={(e) => setHeaderQuery(e.target.value)}
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                {showSearchDropdown && suggestions.length > 0 && (
                  <div className="absolute z-50 mt-2 left-0 right-0 bg-surface border border-soft rounded-lg shadow-lg max-h-64 overflow-y-auto dropdown-animation">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-surface-light flex items-center gap-3 transition-colors text-gray-100"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <img src={s.avatar} alt={s.name} className="w-8 h-8 rounded-full object-cover" />
                        <div>
                          <div className="text-sm font-medium text-gray-100">{s.name}</div>
                          <div className="text-xs text-gray-400">@{s.id}{s.category ? ` • ${s.category}` : ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </div>

            {/* Mobile search button */}
            <button 
              className="md:hidden text-gray-300 hover:text-primary transition-colors icon-bounce p-2"
              aria-label="Search"
              onClick={() => navigateTo('search')}
            >
              <Search className="h-5 w-5" />
            </button>

            <button className="text-gray-300 hover:text-primary transition-colors icon-bounce p-2" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                ref={buttonRef}
                onClick={toggleDropdown}
                className="bg-primary hover:bg-primary-dark rounded-full p-1 ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition"
                aria-label="Open profile menu"
              >
                <User className="h-5 w-5 text-white" />
              </button>
              {showDropdown && (
                <div ref={dropdownRef} className="absolute right-0 mt-2 dropdown-animation z-50">
                  <ProfileDropdown onClose={closeDropdown} navigateTo={navigateTo} onLogoutRequest={handleLogoutRequest} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-8xl mx-auto px-2 sm:px-4 lg:pr-[380px] xl:pr-[480px] 2xl:pr-[500px] 3xl:pr-[540px] mt-20 md:mt-28">
        {/* Left Sidebar */}
        <aside className="hidden lg:block lg:col-span-3">
          <div className="bg-surface rounded-xl border border-soft shadow-sm sticky top-28 overflow-hidden">
            {/* User Profile Section removed as requested */}
            
            {/* Main Navigation */}
            <div className="p-2">
              <h4 className="text-xs font-medium text-gray-400 px-3 py-2">Main Menu</h4>
              <nav className="space-y-1">
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); scrollToTop(); }}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  <span>Dashboard</span>
                </a>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); scrollToFeed(); }}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                    <line x1="6" y1="1" x2="6" y2="4"></line>
                    <line x1="10" y1="1" x2="10" y2="4"></line>
                    <line x1="14" y1="1" x2="14" y2="4"></line>
                  </svg>
                  <span>Feed</span>
                </a>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); navigateTo('messages'); }}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>Messages</span>
                </a>
                <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                    <line x1="1" y1="10" x2="23" y2="10"></line>
                  </svg>
                  <span>Wallet</span>
                </a>
                <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                  <span>Subscriptions</span>
                </a>
                <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span>Orders</span>
                </a>
              </nav>
            </div>
            
            {/* Creator Settings */}
            <div className="p-2 border-t border-soft mt-2">
              <h4 className="text-xs font-medium text-gray-400 px-3 py-2">Creator Settings</h4>
              <nav className="space-y-1">
                <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>Tip</span>
                </a>
                <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 7l-7 5 7 5V7z"></path>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  <span>Stream</span>
                </a>
                <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-surface-light text-gray-100 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span>Memberships</span>
                </a>
              </nav>
            </div>
            
            {/* Action Buttons */}
            <div className="p-3 space-y-2 border-t border-soft mt-2">
              {currentProfile?.user_type === 'creator' ? (
                <button
                  onClick={handleGoToCreatorView}
                  className="w-full py-2.5 px-4 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center space-x-2 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <span>Creator View</span>
                </button>
              ) : (
                <button
                  onClick={handleBecomeCreator}
                  className="w-full py-2.5 px-4 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center space-x-2 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Become a Creator</span>
                </button>
              )}
            </div>
          </div>
        </aside>
        
        {/* Main Feed */}
        <main className="lg:col-span-9 xl:col-span-9 py-4 sm:py-6 px-0 md:px-4" role="feed" aria-busy="false">
          <div className="w-full max-w-3xl lg:ml-0">
            {/* Create New Post UI removed as requested */}

            {/* Original simple composer (commented as requested) */}
            {/**
            <div className="bg-surface text-gray-100 rounded-lg sm:rounded-xl p-2 mb-3 sm:mb-4 flex items-center shadow-sm border border-soft card-hover">
              <button className="p-1 sm:p-2 text-gray-400 hover:text-primary transition-colors" aria-label="Add post">
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
              </button>
              <input
                type="text"
                placeholder="What's on your mind?"
                className="flex-1 bg-transparent border-none focus:outline-none text-xs sm:text-sm px-2 placeholder-gray-400 text-gray-100"
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreatePost(); } }}
              />
              <button
                className="bg-primary text-white rounded-md w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center transition-all hover:shadow-[0_8px_26px_rgba(255,90,136,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="Create post"
                onClick={handleCreatePost}
                disabled={posting || !newPost.trim()}
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            **/}
            
            {/* Suggested Creators Row (Clean vertical cards in horizontal scroll) */}
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base sm:text-lg font-medium text-gray-100">Suggested Creators</h2>
                <button className="text-xs text-primary hover:text-primary-dark transition-colors flex items-center">
                  View all creators
                  <svg className="w-3 h-3 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="overflow-x-auto hide-scrollbar">
                <div className="flex space-x-3 py-2">
                  {suggestedCreators.map((creator) => (
                    <div key={creator.id} className="flex-shrink-0 w-[180px] bg-surface rounded-xl border border-soft overflow-hidden">
                      <div className="cursor-pointer">
                        <div className="flex flex-col">
                          <div className="p-3 pb-2">
                            <div className="flex items-center">
                              <img 
                                src={creator.avatar} 
                                alt={creator.name} 
                                className="w-10 h-10 rounded-full object-cover mr-3"
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm truncate text-gray-100">{creator.name}</h3>
                                <div className="flex items-center">
                                  <span className="text-xs text-yellow-400 mr-1">★</span>
                                  <span className="text-xs text-yellow-400">{creator.rating}</span>
                                </div>
                              </div>
                            </div>
                            <div className="mt-2">
                              <p className="text-xs text-gray-400">{creator.category}</p>
                              <p className="text-xs text-gray-400">{creator.supporters} supporters</p>
                            </div>
                          </div>
                          <div className="mt-auto border-t border-soft">
                            <button className="w-full py-2 text-xs text-primary hover:text-primary-dark transition-colors font-medium">
                              View Profile
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex-shrink-0 w-[180px] bg-surface rounded-xl border border-soft overflow-hidden flex items-center justify-center h-[120px]">
                    <div className="text-center">
                      <div className="flex justify-center">
                        <div className="w-10 h-10 rounded-full bg-surface-light flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Discover More</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <header id="news-feed" className="flex items-center justify-between mb-3 sm:mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-100">News Feed</h1>
              <div className="hidden sm:flex items-center">
                <span className="text-xs sm:text-sm text-gray-400 mr-2">Support creators to unlock exclusive content</span>
              </div>
            </header>

            {/* Feed Component */}
            <Feed navigateTo={navigateTo} refreshSignal={feedRefreshToken} />
          </div>
        </main>

        {/* Right rail is defined below as a fixed container; this space is reserved by padding above */}
      </div>

      {/* Right Rail promotional carousel removed as requested */}

      {/* Logout Confirmation Modal - Full Screen Overlay */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-surface rounded-lg p-6 mx-4 max-w-sm w-full border border-soft shadow-xl">
            <h3 className="text-lg font-medium text-gray-100 mb-4 text-center">
              Confirm Logout
            </h3>
            <p className="text-gray-300 text-sm mb-6 text-center">
              Are you sure you want to logout?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={cancelLogout}
                className="flex-1 py-2.5 px-4 rounded-lg bg-surface-light hover:bg-soft text-gray-100 hover:text-primary transition-colors"
              >
                No
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-soft px-2 py-2 flex justify-around z-40 safe-area-inset-bottom text-gray-200">
        <a href="#" className="flex flex-col items-center text-primary px-1">
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </a>
        <a onClick={() => navigateTo('search')} className="flex flex-col items-center text-gray-300 hover:text-primary transition-colors cursor-pointer px-1">
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Explore</span>
        </a>
        <a href="#" className="flex flex-col items-center text-gray-300 hover:text-primary transition-colors px-1">
          <Video className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Live</span>
        </a>
        <a onClick={() => navigateTo('messages')} className="flex flex-col items-center text-gray-300 hover:text-primary transition-colors cursor-pointer px-1">
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Messages</span>
        </a>
        <a href="#" onClick={toggleDropdown} className="flex flex-col items-center text-gray-300 hover:text-primary px-1">
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Profile</span>
        </a>
      </nav>
    </div>
  );
};

export default MainPage;
