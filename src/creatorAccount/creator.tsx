import React, { useState, useRef, useEffect } from 'react';
import { Heart, Settings, Lock, User, X, Search, Bell } from 'lucide-react';
import './creator.css';
import ProfileDropdown from '../components/ProfileDropdown';
import { useAuth } from '../components/AuthContext';
import handleSupportCreator, { SupportTags } from './subscriptions';


interface CreatorProps {
  navigateTo?: (page: string) => void;
}

const Creator: React.FC<CreatorProps> = ({ navigateTo }) => {
  const { selectedProfile } = useAuth();
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportTags, setSupportTags] = useState<SupportTags>({} as SupportTags);
  const [selectedTier, setSelectedTier] = useState<'Platinum' | 'Gold' | 'Silver' | 'Bronze'>('Bronze');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // If selected profile is the logged-in user, redirect to own profile
  useEffect(() => {
    if (!navigateTo) return;
    try {
      const publicId = localStorage.getItem('public_id') || '';
      const email = localStorage.getItem('logged_in_email') || '';
      const storedUsername = localStorage.getItem('username') || '';
      const candidates = [publicId, email, storedUsername]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      const targetIds = [selectedProfile?.username, selectedProfile?.name]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      const isSelf = candidates.length > 0 && targetIds.length > 0 && candidates.some(c => targetIds.includes(c));
      if (isSelf) navigateTo('profile');
    } catch {
      /* ignore */
    }
  }, [selectedProfile, navigateTo]);

  const onSupportNow = async () => {
    const supporterId = localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '';
    const creatorId = selectedProfile?.username || selectedProfile?.name || '';
    if (!supporterId || !creatorId) {
      alert('Missing supporter or creator identity. Please sign in and try again.');
      return;
    }
    await handleSupportCreator({
      supporterId,
      creatorId,
      selectedTier,
      setSupportTags,
      setLoading: setSupportLoading,
      onSuccess: () => {
        setShowSupportModal(false);
      },
    });
  };

  // Read current tag for this supporter (if any) to reflect state and avoid unused lint
  const getSupporterKey = () => localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '';
  const currentTag = supportTags[getSupporterKey() || ''];

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };
  
  const closeDropdown = () => {
    setShowDropdown(false);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && 
          !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && 
          !buttonRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // User data: prefer selected profile from context, fallback to defaults
  const userData = {
    name: selectedProfile?.name || 'Creator',
    username: selectedProfile?.username ? `@${selectedProfile.username}` : '@creator',
    bio: selectedProfile?.bio || 'Welcome to my profile! 🎉',
    supporters: selectedProfile?.supporters || '0',
    posts: 89,
    rating: selectedProfile?.rating ?? 4.8
  };
  const authorName = userData.name;

  // Mock posts data
  const posts = [
    {
      id: 1,
      author: 'Sarah Johnson',
      timeAgo: '2 hours ago',
      content: '',
      likes: 24,
      locked: true
    },
    {
      id: 2,
      author: 'Sarah Johnson',
      timeAgo: '5 hours ago',
      content: 'Just finished an amazing workout session! 💪 Who wants to join me for tomorrow\'s session?',
      likes: 42,
      locked: false
    },
    {
      id: 3,
      author: 'Sarah Johnson',
      timeAgo: '1 day ago',
      content: '',
      likes: 18,
      locked: true
    },
    {
      id: 4,
      author: 'Sarah Johnson',
      timeAgo: '1 day ago',
      content: '',
      likes: 18,
      locked: true
    },
    {
      id: 5,
      author: 'Sarah Johnson',
      timeAgo: '1 day ago',
      content: '',
      likes: 18,
      locked: false
    },
    {
      id: 6,
      author: 'Sarah Johnson',
      timeAgo: '1 day ago',
      content: '',
      likes: 18,
      locked: true
    },
    {
        id: 7,
        author: 'Sarah Johnson',
        timeAgo: '1 day ago',
        content: '',
        likes: 1000,
        locked: true
      }
  ];

  const handleBackToFeed = () => {
    if (navigateTo) {
      navigateTo('main');
    }
  };

  return (
    <div className="creator-page bg-background min-h-screen">
      {/* Header with navigation and search */}
      <header className="bg-white shadow-sm py-2 px-4 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <button 
              onClick={handleBackToFeed}
              className="text-gray-600 hover:text-gray-900 mr-4"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-primary font-bold text-xl">ConnectLove</div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search..."
                className="bg-gray-100 rounded-full py-1 px-4 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
            <button className="text-gray-600 hover:text-gray-900">
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative">
              <button 
                ref={buttonRef}
                onClick={toggleDropdown}
                className="bg-primary hover:bg-primary-dark rounded-full p-1"
              >
                <User className="h-5 w-5 text-white" />
              </button>
              
              {/* Profile Dropdown Menu */}
              {showDropdown && (
                <div 
                  ref={dropdownRef}
                  className="absolute right-0 mt-2 dropdown-animation z-50"
                >
                  <ProfileDropdown onClose={closeDropdown} navigateTo={navigateTo} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Profile Section */}
      <div className="flex flex-col md:flex-row max-w-6xl mx-auto pt-20">
        {/* Left Profile Section */}
        <div className="profile-section md:w-1/3 relative p-4 md:p-6 flex flex-col items-center bg-white rounded-lg shadow-sm my-4 mx-2 overflow-y-auto">
        <div className="profile-avatar w-24 h-24 border-4 border-white rounded-full overflow-hidden bg-gray-100 mb-4 relative shadow-md">
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <User className="h-16 w-16" />
            </div>
            <div className="absolute bottom-1 right-1 w-6 h-5 bg-green-500 rounded-full border-2 border-white pulse-animation"></div>
          </div>
          
          <h1 className="text-xl font-bold text-center text-gray-800">{userData.name}</h1>
          <p className="text-primary text-sm mb-2">{userData.username}</p>
          <p className="text-gray-600 text-sm text-center mb-4">{userData.bio}</p>
          
          <div className="flex justify-center space-x-6 w-full mb-6">
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{userData.supporters}</div>
              <div className="text-gray-500 text-xs">Supporters</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{userData.posts}</div>
              <div className="text-gray-500 text-xs">Posts</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{userData.rating}</div>
              <div className="text-gray-500 text-xs">Rating</div>
            </div>
          </div>
          
          <div className="supporter-badges flex flex-wrap justify-center gap-2 mb-6">
            <div className="supporter-badge bg-purple-600 text-white rounded-full p-1 shadow-sm">
              <span className="inline-block w-6 h-6 rounded-full flex items-center justify-center font-bold">P</span>
            </div>
            <div className="supporter-badge bg-yellow-500 text-yellow-900 rounded-full p-1 shadow-sm">
              <span className="inline-block w-6 h-6 rounded-full flex items-center justify-center font-bold">G</span>
            </div>
            <div className="supporter-badge bg-gray-400 text-gray-800 rounded-full p-1 shadow-sm">
              <span className="inline-block w-6 h-6 rounded-full flex items-center justify-center font-bold">S</span>
            </div>
            <div className="supporter-badge bg-amber-700 text-amber-200 rounded-full p-1 shadow-sm">
              <span className="inline-block w-6 h-6 rounded-full flex items-center justify-center font-bold">B</span>
            </div>
          </div>
          
          <button 
            onClick={() => setShowSupportModal(true)}
            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold rounded-full px-6 py-2 flex items-center justify-center transition-colors mb-4"
          >
            <Heart className="h-4 w-4 mr-2" />
            Support Creator
          </button>
          
          <div className="flex justify-center space-x-8 w-full pt-4 border-t border-gray-200">
            <button className="flex items-center text-gray-500 hover:text-primary">
              <Settings className="h-5 w-5 mr-2" />
              <span>Settings</span>
            </button>
            <button className="flex items-center text-gray-500 hover:text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Privacy</span>
            </button>
          </div>
        </div>
        
        {/* Right Content Section */}
        <div className="content-section md:w-2/3 p-4">
          {/* Create Post Button */}
          <div className="mb-4">
            <button className="w-full bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg py-3 flex items-center justify-center transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Create New Post
            </button>
          </div>

          {/* Posts Feed */}
          <div className="posts-feed space-y-4 pb-20">
            {posts.map(post => (
              <div key={post.id} className="post bg-white rounded-lg overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                      <User className="h-6 w-6 text-gray-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800">{authorName}</div>
                      <div className="text-xs text-gray-500">{post.timeAgo}</div>
                    </div>
                    {post.locked && (
                      <div className="ml-auto">
                        <span className="bg-primary bg-opacity-20 text-white text-xs px-2 py-1 rounded-md flex items-center">
                          <Lock className="h-3 w-3 mr-1" />
                          Locked
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {post.content && (
                    <div className="mt-3">
                      <p className="text-gray-700">{post.content}</p>
                    </div>
                  )}
                  
                  {post.locked ? (
                    <div className="mt-4 bg-gray-50 rounded-lg p-8 flex flex-col items-center justify-center">
                      <button className="bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg px-6 py-2 transition-colors">
                        Unlock Content
                      </button>
                    </div>
                  ) : null}
                  
                  <div className="mt-4 flex items-center">
                    <button className="flex items-center text-gray-500 hover:text-primary">
                      <Heart className="h-5 w-5 mr-1" />
                      <span>{post.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-5 relative shadow-lg">
            <button 
              onClick={() => setShowSupportModal(false)} 
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
            >
              <X className="h-5 w-5" />
            </button>
            
            <h2 className="text-xl font-bold text-center mb-2 text-gray-800">Support {userData.name}</h2>
            <p className="text-gray-600 text-center text-sm mb-1">Choose your support level and earn exclusive benefits!</p>
            {currentTag ? (
              <p className="text-xs text-center text-primary mb-3">Your current tier: {currentTag}</p>
            ) : (
              <p className="text-xs text-center text-gray-400 mb-3">No active tier yet</p>
            )}
            
            <div className="space-y-3 mb-5">
              <div
                className={`bg-gray-50 hover:bg-gray-100 rounded-lg p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Platinum' ? 'border-primary' : 'border-transparent'}`}
                onClick={() => setSelectedTier('Platinum')}
              >
                <div className="supporter-badge bg-purple-600 text-white rounded-full p-1 mr-3">
                  <span className="inline-block w-8 h-8 rounded-full flex items-center justify-center font-bold">P</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Platinum Supporter</div>
                  <div className="text-xs text-gray-600">$20 Platinum Credit</div>
                </div>
              </div>
              
              <div
                className={`bg-gray-50 hover:bg-gray-100 rounded-lg p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Gold' ? 'border-primary' : 'border-transparent'}`}
                onClick={() => setSelectedTier('Gold')}
              >
                <div className="supporter-badge bg-yellow-500 text-yellow-900 rounded-full p-1 mr-3">
                  <span className="inline-block w-8 h-8 rounded-full flex items-center justify-center font-bold">G</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Gold Supporter</div>
                  <div className="text-xs text-gray-600">$10 Gold Credit</div>
                </div>
              </div>
              
              <div
                className={`bg-gray-50 hover:bg-gray-100 rounded-lg p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Silver' ? 'border-primary' : 'border-transparent'}`}
                onClick={() => setSelectedTier('Silver')}
              >
                <div className="supporter-badge bg-gray-400 text-gray-800 rounded-full p-1 mr-3">
                  <span className="inline-block w-8 h-8 rounded-full flex items-center justify-center font-bold">S</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Silver Supporter</div>
                  <div className="text-xs text-gray-600">$5 Silver Credit</div>
                </div>
              </div>
              
              <div
                className={`bg-gray-50 hover:bg-gray-100 rounded-lg p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Bronze' ? 'border-primary' : 'border-transparent'}`}
                onClick={() => setSelectedTier('Bronze')}
              >
                <div className="supporter-badge bg-amber-700 text-amber-200 rounded-full p-1 mr-3">
                  <span className="inline-block w-8 h-8 rounded-full flex items-center justify-center font-bold">B</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Bronze Supporter</div>
                  <div className="text-xs text-gray-600">$3 Bronze Credit</div>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setShowSupportModal(false)}
                className="w-1/2 py-2 text-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSupportNow}
                disabled={supportLoading || currentTag === selectedTier}
                className={`w-1/2 py-2 text-center rounded-lg text-white font-semibold transition-colors ${supportLoading ? 'bg-primary/60 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark'}`}
              >
                {supportLoading ? 'Processing...' : currentTag === selectedTier ? 'Already on this tier' : 'Support Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Creator;
