import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import './mainPage.css';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabaseClient';

interface SearchProfileProps {
  navigateTo: (page: string) => void;
}

interface ProfileResult {
  id: string;
  name: string;
  avatar: string;
  category?: string;
  supporters?: string;
  rating?: number;
  bio?: string;
}

// Shape of rows returned from Supabase 'users' table for live suggestions
type UserRow = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
  email?: string | null;
};

const SearchProfile: React.FC<SearchProfileProps> = ({ navigateTo }) => {
  const { setSelectedProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Live suggestions dropdown state
  const [suggestions, setSuggestions] = useState<ProfileResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const latestQueryRef = useRef('');
  const blurTimeoutRef = useRef<number | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery);
  };

  // Extracted runner so we can trigger search on mount from header-enter
  const runSearch = async (query: string) => {
    const q = (query || '').trim();
    if (!q) {
      setError('Please enter a search term');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('https://primary-production-6722.up.railway.app/webhook/c24cb5f2-5613-4bdb-8367-f371b65ea6da', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query: q }),
        signal: controller.signal,
        mode: 'cors'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (data) {
        if (Array.isArray(data) && data.length > 0) {
          const firstItem = data[0];
          if (firstItem &&
              (firstItem.username === 'undefined' || firstItem.username === undefined) &&
              (firstItem.full_name === 'undefined' || firstItem.full_name === undefined) &&
              (firstItem.user_type === 'undefined' || firstItem.user_type === undefined)) {
            setError('User not found');
            setSearchResults([]);
            return;
          }
          setSearchResults(data);
          if (data.length === 0) setError('No profiles found matching your search');
        } else if (data.username || data.full_name) {
          if ((data.username === 'undefined' || data.username === undefined) &&
              (data.full_name === 'undefined' || data.full_name === undefined) &&
              (data.user_type === 'undefined' || data.user_type === undefined)) {
            setError('User not found');
            setSearchResults([]);
            return;
          }
          const profileData = {
            id: data.username || '1',
            name: data.full_name || data.username || 'User',
            avatar: data.avatar || 'https://i.pravatar.cc/150',
            category: data.user_type || 'User',
            supporters: data.supporters || '0',
            rating: data.rating || 4.5,
            bio: data.bio || `${data.full_name || 'User'}'s profile`,
          };
          setSearchResults([profileData]);
        } else if (Array.isArray(data.profiles)) {
          if (data.profiles.length > 0) {
            const firstProfile = data.profiles[0];
            if (
              firstProfile &&
              Object.values(firstProfile).every((val: unknown) => (typeof val === 'string' && val === 'undefined') || val === undefined)
            ) {
              setError('User not found');
              setSearchResults([]);
              return;
            }
          }
          setSearchResults(data.profiles);
          if (data.profiles.length === 0) setError('No profiles found matching your search');
        } else {
          console.error('Unexpected response format:', data);
          setError('No matching profiles found');
          setSearchResults([]);
        }
      } else {
        setError('No data received from server');
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search profiles. Please try again later.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // On mount: if coming from header enter, run search immediately
  useEffect(() => {
    try {
      const pending = localStorage.getItem('pending_search_query');
      if (pending && pending.trim()) {
        setSearchQuery(pending);
        // Fire and forget
        void runSearch(pending);
        localStorage.removeItem('pending_search_query');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Debounced live search suggestions from Supabase
  useEffect(() => {
    // Clear suggestions when query is empty
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    latestQueryRef.current = searchQuery;
    const q = searchQuery.trim();
    const timeout = window.setTimeout(async () => {
      try {
        // Query 'users' table for similar names/usernames
        // Using ilike for case-insensitive partial match
        const { data, error: sbError } = await supabase
          .from('users')
          .select('username, full_name, avatar_url, user_type, email')
          .or(`full_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(8);

        // Ignore if query changed while awaiting
        if (latestQueryRef.current !== searchQuery) return;

        if (sbError) {
          // Do not surface as page error; just hide suggestions
          console.error('Supabase live search error:', sbError.message);
          setSuggestions([]);
          setShowDropdown(false);
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
        setShowDropdown(mapped.length > 0);
      } catch (err) {
        console.error('Live search suggestions error:', err);
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 300); // debounce 300ms

    return () => {
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  const handleSelectSuggestion = (profile: ProfileResult) => {
    // When picking a suggestion, go to creator or self profile
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
    } catch {
      isSelf = false;
    }

    setShowDropdown(false);

    if (isSelf) {
      navigateTo('profile');
      return;
    }

    setSelectedProfile({
      name: profile.name,
      username: profile.id,
      avatar: profile.avatar,
      bio: profile.bio,
      supporters: profile.supporters,
      rating: profile.rating,
    });
    navigateTo('creator');
  };

  return (
    <div className="search-profile bg-gradient-to-br from-gray-900 via-black to-gray-900 text-gray-100 min-h-screen flex flex-col relative pt-14 sm:pt-16 overflow-x-hidden">
      {/* Header with Search */}
      <header className="bg-black/20 backdrop-blur-xl border-b border-pink-500/20 shadow-lg shadow-pink-500/10 py-3 sm:py-4 px-2 sm:px-4 fixed top-0 left-0 right-0 z-50 safe-area-inset-top">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-transparent bg-gradient-to-r from-pink-400 to-purple-600 bg-clip-text font-bold text-lg sm:text-xl tracking-tight">ConnectLove</div>
          <div className="flex items-center space-x-2 sm:space-x-4 w-full max-w-xs sm:max-w-md mx-2 sm:mx-4">
            <form onSubmit={handleSearch} className="relative w-full"
              onFocus={() => {
                if (suggestions.length > 0 && searchQuery.trim()) setShowDropdown(true);
              }}
              onBlur={() => {
                // Delay hiding to allow click
                if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
                blurTimeoutRef.current = window.setTimeout(() => setShowDropdown(false), 120);
              }}
            >
              <input
                type="text"
                placeholder="Search creators..."
                className="bg-gray-800/50 backdrop-blur-sm rounded-full py-1.5 sm:py-2 px-3 sm:px-4 pr-8 sm:pr-10 w-full focus:outline-none focus:ring-2 focus:ring-pink-500/50 border border-gray-700/50 focus:border-pink-500/60 text-xs sm:text-sm text-gray-100 placeholder-gray-400 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button 
                type="submit" 
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-pink-400 transition-colors"
                disabled={isSearching}
              >
                <Search className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {/* Live suggestions dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 sm:mt-2 left-0 right-0 bg-gray-900/95 backdrop-blur-xl border border-pink-500/20 rounded-xl shadow-2xl shadow-pink-500/10 max-h-48 sm:max-h-64 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-gradient-to-r hover:from-pink-500/10 hover:to-purple-500/10 flex items-center gap-2 sm:gap-3 transition-all hover:text-pink-300"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      <img
                        src={s.avatar || 'https://i.pravatar.cc/150'}
                        alt={s.name}
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-100">{s.name}</div>
                        <div className="text-[10px] sm:text-xs text-gray-400">@{s.id}{s.category ? ` • ${s.category}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => navigateTo('main')} 
              className="text-pink-400 hover:text-pink-300 text-xs sm:text-sm whitespace-nowrap px-1 sm:px-2 transition-colors font-medium"
            >
              <span className="hidden xs:inline">Back to Home</span>
              <span className="xs:hidden">Back</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-2 sm:px-4 py-4 sm:py-6">
        {/* Search Status */}
        {isSearching && (
          <div className="text-center py-6 sm:py-8">
            <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-t-2 border-b-2 border-pink-500 mx-auto"></div>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-600">Searching profiles...</p>
          </div>
        )}

        {/* Error Message */}
        {error && !isSearching && (
          <div className="bg-red-900/20 backdrop-blur-sm border border-red-500/30 text-red-300 px-3 sm:px-4 py-2 sm:py-3 rounded-xl mb-4 sm:mb-6 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {/* Search Results */}
        {!isSearching && searchResults.length > 0 && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-lg sm:text-xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-3 sm:mb-4">Search Results</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
              {searchResults.map((profile) => (
                <div key={profile.id} className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-2xl border border-pink-500/20 overflow-hidden shadow-xl shadow-pink-500/10 hover:shadow-pink-500/20 transition-all hover:scale-105 group">
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center mb-4">
                      <div className="relative">
                        <img 
                          src={profile.avatar || 'https://i.pravatar.cc/150'} 
                          alt={profile.name} 
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ring-2 ring-pink-500/30 group-hover:ring-pink-400/50 transition-all"
                        />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-r from-green-400 to-green-500 rounded-full border-2 border-gray-900"></div>
                      </div>
                      <div className="ml-4 flex-1 min-w-0">
                        <h3 className="font-bold text-lg sm:text-xl truncate text-white group-hover:text-pink-300 transition-colors">{profile.name}</h3>
                        {profile.category && (
                          <p className="text-sm text-pink-300 truncate font-medium">{profile.category}</p>
                        )}
                        {profile.rating && (
                          <div className="flex items-center text-yellow-400 mt-1">
                            <span className="text-sm mr-1">★</span>
                            <span className="text-sm font-medium">{profile.rating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {profile.bio && (
                      <p className="mb-3 text-sm text-gray-300 line-clamp-2">{profile.bio}</p>
                    )}
                    
                    {profile.supporters && (
                      <p className="mb-4 text-xs text-gray-400 font-medium">{profile.supporters} subscribers</p>
                    )}
                    
                    <div className="border-t border-pink-500/20 pt-4">
                      <button
                        className="w-full py-3 bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-pink-300 hover:text-white transition-all font-medium rounded-xl text-sm"
                        onClick={() => {
                          // If the clicked profile is the logged-in user, go to own profile
                          let isSelf = false;
                          try {
                            const publicId = localStorage.getItem('public_id') || '';
                            const email = localStorage.getItem('logged_in_email') || '';
                            const storedUsername = localStorage.getItem('username') || '';
                            const candidates = [publicId, email, storedUsername]
                              .filter(Boolean)
                              .map(v => String(v).toLowerCase());
                            const targetIds = [profile.id, profile.name]
                              .filter(Boolean)
                              .map(v => String(v).toLowerCase());
                            isSelf = candidates.some(c => targetIds.includes(c));
                          } catch {
                            isSelf = false;
                          }

                          if (isSelf) {
                            navigateTo('profile');
                            return;
                          }

                          // Otherwise, view as creator profile
                          setSelectedProfile({
                            name: profile.name,
                            username: profile.id,
                            avatar: profile.avatar,
                            bio: profile.bio,
                            supporters: profile.supporters,
                            rating: profile.rating,
                          });
                          navigateTo('creator');
                        }}
                      >
                        Subscribe Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Search Performed Yet */}
        {!isSearching && searchResults.length === 0 && !error && (
          <div className="text-center py-8 sm:py-12">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
              <Search className="h-10 w-10 text-pink-400" />
            </div>
            <h3 className="text-xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-2">Discover Amazing Creators</h3>
            <p className="text-gray-300 mb-1">Search for creators to connect with</p>
            <p className="text-sm text-gray-400">Enter a name, category, or interest</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default SearchProfile;