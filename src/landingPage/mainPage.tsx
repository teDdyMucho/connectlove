import React, { useState, useRef, useEffect } from 'react';
import { Heart, MessageSquare, Search, Bell, User, Home, Video } from 'lucide-react';
import './mainPage.css';
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
  const { setSelectedProfile } = useAuth();

  // Header search state
  const [headerQuery, setHeaderQuery] = useState('');
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
    <div className="main-page bg-background text-gray-900 min-h-screen flex flex-col relative scroll-smooth overflow-x-hidden">

      {/* Header */}
      <header className="bg-white shadow-sm py-3 sm:py-4 px-3 sm:px-4 fixed top-0 left-0 right-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-primary font-bold text-lg sm:text-xl tracking-tight flex items-center">
            <Heart className="h-5 w-5 sm:h-6 sm:w-6 mr-1 sm:mr-2 inline-block" />
            <span className="hidden xs:inline">ConnectLove</span>
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
                  className="bg-gray-100 rounded-full py-2 pl-4 pr-9 text-sm w-48 sm:w-60 md:w-72 border border-gray-200 focus:border-primary/60 focus:outline-none focus:ring-0 transition-colors"
                  value={headerQuery}
                  onChange={(e) => setHeaderQuery(e.target.value)}
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                {showSearchDropdown && suggestions.length > 0 && (
                  <div className="absolute z-50 mt-2 left-0 right-0 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto dropdown-animation">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-3 transition-colors text-gray-100"
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
              className="md:hidden text-gray-600 hover:text-primary transition-colors icon-bounce p-2"
              aria-label="Search"
              onClick={() => navigateTo('search')}
            >
              <Search className="h-5 w-5" />
            </button>

            <button className="text-gray-600 hover:text-primary transition-colors icon-bounce p-2" aria-label="Notifications">
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
                  <ProfileDropdown onClose={closeDropdown} navigateTo={navigateTo} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Top Navigation */}
      <div className="fixed top-12 sm:top-16 left-0 right-0 bg-white shadow-sm z-40 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-2 sm:px-4">
          <div className="flex justify-between items-center py-1 sm:py-2 overflow-x-auto hide-scrollbar">
            <div className="flex space-x-2 sm:space-x-6">
              <a
                href="#"
                className="group flex items-center py-1 sm:py-2 px-2 sm:px-3 text-primary font-medium border-b-2 border-primary transition-all duration-200 whitespace-nowrap"
              >
                <Home className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 group-hover:scale-105 transition-transform" />
                <span className="text-sm sm:text-base">Home</span>
              </a>
              <a
                href="#"
                className="group flex items-center py-1 sm:py-2 px-2 sm:px-3 text-gray-300 hover:text-primary hover:border-b-2 hover:border-primary transition-all duration-200 whitespace-nowrap"
              >
                <Video className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 group-hover:scale-105 transition-transform" />
                <span className="text-sm sm:text-base">Live Stream</span>
              </a>
              <a
                onClick={() => navigateTo('messages')}
                className="group flex items-center py-1 sm:py-2 px-2 sm:px-3 text-gray-300 hover:text-primary hover:border-b-2 hover:border-primary transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 group-hover:scale-105 transition-transform" />
                <span className="text-sm sm:text-base">Messages</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 max-w-6xl mx-auto px-2 sm:px-4 mt-24 sm:mt-28">
        {/* Main Feed */}
        <main className="flex-1 py-4 sm:py-6 pr-0 md:pr-4" role="feed" aria-busy="false">
          {/* Composer/Search bar */}
          <div className="bg-slate-900 text-gray-100 rounded-lg sm:rounded-xl p-2 mb-3 sm:mb-4 flex items-center shadow-sm border border-slate-700 card-hover">
            <button className="p-1 sm:p-2 text-gray-400 hover:text-primary transition-colors" aria-label="Add post">
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            </button>
            <input
              type="text"
              placeholder="What's on your mind?"
              className="flex-1 bg-transparent border-none focus:outline-none text-xs sm:text-sm px-2 placeholder-gray-400 text-gray-100"
            />
            <button
              className="bg-primary text-white rounded-md w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center transition-all hover:shadow-[0_8px_26px_rgba(255,90,136,0.35)]"
              aria-label="Create post"
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <header className="flex items-center justify-between mb-3 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold">News Feed</h1>
            <div className="hidden sm:flex items-center">
              <span className="text-xs sm:text-sm text-gray-600 mr-2">Support creators to unlock exclusive content</span>
            </div>
          </header>

          {/* Feed Component */}
          <Feed navigateTo={navigateTo} />
        </main>

        {/* Right Sidebar */}
        <aside className="hidden md:block md:w-60 lg:w-72 p-3 sm:p-4 mt-4 sm:mt-6">
          <div className="bg-slate-900 text-gray-100 rounded-xl p-3 sm:p-4 border border-slate-700 shadow-sm card-hover sticky top-28">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-medium">Suggested Creators</h2>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
              </svg>
            </div>

            <div className="space-y-2 sm:space-y-3">
              {suggestedCreators.slice(0, 4).map((creator) => (
                <div key={creator.id} className="flex items-center rounded-lg transition-colors hover:bg-slate-800 p-1.5 sm:p-2">
                  <img
                    src={creator.avatar}
                    alt={creator.name}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover mr-2 sm:mr-3"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <h3 className="font-medium text-xs sm:text-sm truncate text-gray-100">{creator.name}</h3>
                      <div className="ml-1 sm:ml-2 flex items-center text-yellow-400">
                        <span className="text-xs mr-0.5 sm:mr-1">★</span>
                        <span className="text-xs">{creator.rating}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{creator.category}</p>
                    <p className="text-xs text-gray-400">{creator.supporters} supporters</p>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-3 sm:mt-4 text-xs sm:text-sm text-primary hover:text-primary-dark transition-colors">
              View all creators →
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 px-2 py-2 flex justify-around z-40 safe-area-inset-bottom text-gray-200">
        <a href="#" className="flex flex-col items-center text-primary px-1">
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </a>
        <a onClick={() => navigateTo('search')} className="flex flex-col items-center text-gray-300 cursor-pointer px-1">
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Explore</span>
        </a>
        <a href="#" className="flex flex-col items-center text-gray-300 px-1">
          <Video className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Live</span>
        </a>
        <a onClick={() => navigateTo('messages')} className="flex flex-col items-center text-gray-300 cursor-pointer px-1">
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
