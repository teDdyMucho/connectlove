import React, { useState } from 'react';
import { Search } from 'lucide-react';
import './mainPage.css';
import { useAuth } from '../components/AuthContext';

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

const SearchProfile: React.FC<SearchProfileProps> = ({ navigateTo }) => {
  const { setSelectedProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [error, setError] = useState<string | null>(null);



  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
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
        body: JSON.stringify({ query: searchQuery }),
        signal: controller.signal,
        mode: 'cors' // Explicitly set CORS mode
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle the single user object response from the webhook
      if (data) {
        // Check for undefined values in array response
        if (Array.isArray(data) && data.length > 0) {
          // Check if all values in the first object are "undefined"
          const firstItem = data[0];
          if (firstItem && 
              (firstItem.username === "undefined" || firstItem.username === undefined) && 
              (firstItem.full_name === "undefined" || firstItem.full_name === undefined) && 
              (firstItem.user_type === "undefined" || firstItem.user_type === undefined)) {
            setError('User not found');
            setSearchResults([]);
            return;
          }
          
          setSearchResults(data);
          
          if (data.length === 0) {
            setError('No profiles found matching your search');
          }
        }
        // If it's a single user object (not an array), convert it to an array with one item
        else if (data.username || data.full_name) {
          // Check if all values are "undefined"
          if ((data.username === "undefined" || data.username === undefined) && 
              (data.full_name === "undefined" || data.full_name === undefined) && 
              (data.user_type === "undefined" || data.user_type === undefined)) {
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
            bio: data.bio || `${data.full_name || 'User'}'s profile`
          };
          
          setSearchResults([profileData]);
        } 
        // If it's an array of profiles
        else if (Array.isArray(data.profiles)) {
          // Check if profiles contain undefined values
          if (data.profiles.length > 0) {
            const firstProfile = data.profiles[0];
            if (firstProfile && 
                Object.values(firstProfile).every(val => val === "undefined" || val === undefined)) {
              setError('User not found');
              setSearchResults([]);
              return;
            }
          }
          
          setSearchResults(data.profiles);
          
          if (data.profiles.length === 0) {
            setError('No profiles found matching your search');
          }
        } 
        else {
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

  return (
    <div className="search-profile bg-background text-gray-900 min-h-screen flex flex-col relative pt-16">
      {/* Header with Search */}
      <header className="bg-white shadow-sm py-4 px-4 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-primary font-bold text-xl">ConnectLove</div>
          <div className="flex items-center space-x-4 w-full max-w-md">
            <form onSubmit={handleSearch} className="relative w-full">
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