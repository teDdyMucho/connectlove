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
    <div className="search-profile bg-background text-gray-900 min-h-screen flex flex-col relative pt-16">
      {/* Header with Search */}
      <header className="bg-white shadow-sm py-4 px-4 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-primary font-bold text-xl">ConnectLove</div>
          <div className="flex items-center space-x-4 w-full max-w-md">
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
                placeholder="Search profiles..."
                className="bg-gray-100 rounded-full py-2 px-4 pr-10 w-full focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button 
                type="submit" 
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-primary"
                disabled={isSearching}
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Live suggestions dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 mt-2 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      <img
                        src={s.avatar || 'https://i.pravatar.cc/150'}
                        alt={s.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-500">@{s.id}{s.category ? ` • ${s.category}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigateTo('main')} 
              className="text-primary hover:text-primary-dark"
            >
              Back to Home
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {/* Search Status */}
        {isSearching && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Searching profiles...</p>
          </div>
        )}

        {/* Error Message */}
        {error && !isSearching && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* Search Results */}
        {!isSearching && searchResults.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Search Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchResults.map((profile) => (
                <div key={profile.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-4">
                    <div className="flex items-center">
                      <img 
                        src={profile.avatar || 'https://i.pravatar.cc/150'} 
                        alt={profile.name} 
                        className="w-16 h-16 rounded-full object-cover mr-4"
                      />
                      <div>
                        <h3 className="font-medium text-lg">{profile.name}</h3>
                        {profile.category && (
                          <p className="text-sm text-gray-600">{profile.category}</p>
                        )}
                        {profile.rating && (
                          <div className="flex items-center text-yellow-400">
                            <span className="text-xs mr-1">★</span>
                            <span className="text-xs">{profile.rating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {profile.bio && (
                      <p className="mt-3 text-sm text-gray-700">{profile.bio}</p>
                    )}
                    
                    {profile.supporters && (
                      <p className="mt-2 text-xs text-gray-500">{profile.supporters} supporters</p>
                    )}
                    
                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between">
                      <button
                        className="text-primary hover:text-primary-dark text-sm font-medium"
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
                        View Profile
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
          <div className="text-center py-12">
            <Search className="h-16 w-16 mx-auto text-gray-300" />
            <p className="mt-4 text-gray-600">Search for profiles to connect with</p>
            <p className="text-sm text-gray-500">Enter a name, location, or interest</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default SearchProfile;