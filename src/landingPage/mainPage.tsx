import React, { useState, useRef, useEffect } from 'react';
import { Heart, MessageSquare, Share2, Lock, Search, Bell, User, Home, Video } from 'lucide-react';
import './mainPage.css';
import ProfileDropdown from '../components/ProfileDropdown';

interface MainPageProps {
  navigateTo: (page: string) => void;
}

const MainPage: React.FC<MainPageProps> = ({ navigateTo }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
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
  // Mock data for posts
  const posts = [
    {
      id: 1,
      creator: {
        name: 'Alexandra Star',
        avatar: 'https://i.pravatar.cc/150?img=1',
        hoursAgo: 2
      },
      content: 'Check out my latest photoshoot behind the scenes...',
      likes: 1247,
      comments: 89,
      locked: true
    },
    {
      id: 2,
      creator: {
        name: 'Sophia Dream',
        avatar: 'https://i.pravatar.cc/150?img=5',
        hoursAgo: 5
      },
      content: 'Here\'s my complete morning workout routine! This 30-minute session will help you start your day with energy and confidence. Thanks for your support! ✨',
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1170&q=80',
      likes: 892,
      comments: 124,
      locked: false
    },
    {
      id: 3,
      creator: {
        name: 'Luna Moon',
        avatar: 'https://i.pravatar.cc/150?img=9',
        daysAgo: 1
      },
      content: 'Today I want to share something very personal with you...',
      likes: 2156,
      comments: 283,
      locked: true,
      fullPost: true
    }
  ];

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
    <div className="main-page bg-background text-gray-900 min-h-screen flex flex-col relative">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-4 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-primary font-bold text-xl">ConnectLove</div>
          <div className="flex items-center space-x-4">
            <div className="relative hidden md:block">
              <form onSubmit={(e) => { e.preventDefault(); navigateTo('search'); }}>
                <input
                  type="text"
                  placeholder="Search..."
                  className="bg-gray-100 rounded-full py-1 px-4 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </form>
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
      
      {/* Top Navigation Section - Home, Live Stream, Messages */}
      <div className="fixed top-16 left-0 right-0 bg-white shadow-sm z-40 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center py-2">
            <div className="flex space-x-6">
              <a href="#" className="flex items-center py-2 px-3 text-primary font-medium border-b-2 border-primary transition-all duration-200">
                <Home className="h-5 w-5 mr-2" />
                <span>Home</span>
              </a>
              <a href="#" className="flex items-center py-2 px-3 text-gray-600 hover:text-primary hover:border-b-2 hover:border-primary transition-all duration-200">
                <Video className="h-5 w-5 mr-2" />
                <span>Live Stream</span>
              </a>
              <a onClick={() => navigateTo('messages')} className="flex items-center py-2 px-3 text-gray-600 hover:text-primary hover:border-b-2 hover:border-primary transition-all duration-200 cursor-pointer">
                <MessageSquare className="h-5 w-5 mr-2" />
                <span>Messages</span>
              </a>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Container */}
      <div className="flex flex-1 max-w-6xl mx-auto px-4 mt-28">
        {/* Main Feed */}
        <main className="flex-1 py-6 pr-0 md:pr-4">
        {/* Search bar at the top of feed - matching first image */}
        <div className="bg-white rounded-md p-1 mb-4 flex items-center shadow-sm border border-gray-200">
          <button className="p-1 text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </button>
          <input
            type="text"
            placeholder="What's on your mind?"
            className="flex-1 bg-transparent border-none focus:outline-none text-xs px-2"
          />
          <button className="bg-primary text-white rounded-md w-6 h-6 flex items-center justify-center">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">News Feed</h1>
          <div className="flex items-center">
            <span className="text-sm text-gray-600 mr-2">Support creators to unlock exclusive content</span>
          </div>
        </header>

        {/* Posts Feed */}
        <div className="space-y-6">
          {posts.map(post => (
            <article key={post.id} className="bg-white rounded-lg overflow-hidden">
              {/* Post Header */}
              <div className="p-4 flex items-center">
                <img 
                  src={post.creator.avatar} 
                  alt={post.creator.name} 
                  className="w-10 h-10 rounded-full object-cover mr-3 cursor-pointer"
                  onClick={() => navigateTo('creator')}
                />
                <div>
                  <h3 className="font-medium">{post.creator.name}</h3>
                  <p className="text-xs text-gray-600">
                    {post.creator.hoursAgo ? `${post.creator.hoursAgo} hours ago` : `${post.creator.daysAgo} day ago`}
                  </p>
                </div>
                {!post.locked && (
                  <button className="ml-auto bg-primary text-gray-900 text-xs px-3 py-1 rounded-full">
                    Support
                  </button>
                )}
              </div>
              
              {/* Post Content */}
              <div className="px-4 pb-2">
                <p className="mb-4">{post.content}</p>
              </div>
              
              {/* Post Image or Locked Content */}
              {post.locked ? (
                <div className="relative bg-gradient-to-r from-light-accent/30 to-medium-accent/30 h-64 flex items-center justify-center">
                  <div className="text-center">
                    <Lock className="h-12 w-12 mx-auto mb-2 text-primary" />
                    <h4 className="text-lg font-medium mb-2">{post.fullPost ? "Full Content Locked" : "Content Locked"}</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Support this creator to {post.fullPost ? "read the complete post" : "unlock"}
                    </p>
                    <button className="bg-primary hover:bg-primary-dark text-gray-900 font-medium px-6 py-2 rounded-full transition-colors">
                      Support
                    </button>
                  </div>
                </div>
              ) : post.image && (
                <div className="relative">
                  <img 
                    src={post.image} 
                    alt="Post content" 
                    className="w-full h-80 object-cover"
                  />
                </div>
              )}
              
              {/* Post Actions */}
              <div className="px-4 py-3 flex items-center border-t border-gray-200">
                <button className="flex items-center text-gray-600 hover:text-gray-900 mr-6">
                  <Heart className="h-5 w-5 mr-1" />
                  <span>{post.likes}</span>
                </button>
                <button className="flex items-center text-gray-600 hover:text-gray-900 mr-6">
                  <MessageSquare className="h-5 w-5 mr-1" />
                  <span>{post.comments}</span>
                </button>
                <button className="flex items-center text-gray-600 hover:text-gray-900">
                  <Share2 className="h-5 w-5 mr-1" />
                  <span>Share</span>
                </button>
                
                {post.locked && (
                  <span className="ml-auto text-xs text-primary font-medium">Locked</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Right Sidebar - Suggested Creators */}
      <aside className="hidden lg:block w-72 p-4 mt-6">
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Suggested Creators</h2>
            <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
          </div>
          
          <div className="space-y-4">
            {suggestedCreators.map(creator => (
              <div key={creator.id} className="flex items-center">
                <img 
                  src={creator.avatar} 
                  alt={creator.name} 
                  className="w-10 h-10 rounded-full object-cover mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="font-medium text-sm">{creator.name}</h3>
                    <div className="ml-2 flex items-center text-yellow-400">
                      <span className="text-xs mr-1">★</span>
                      <span className="text-xs">{creator.rating}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">{creator.category}</p>
                  <p className="text-xs text-gray-500">{creator.supporters} supporters</p>
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 text-sm text-primary hover:text-primary-dark">
            View all creators →
          </button>
        </div>
      </aside>
      </div>

      {/* Mobile Bottom Navigation - Visible only on mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex justify-around z-40">
        <a href="#" className="flex flex-col items-center text-primary">
          <Home className="w-6 h-6" />
          <span className="text-xs mt-1">Home</span>
        </a>
        <a onClick={() => navigateTo('search')} className="flex flex-col items-center text-gray-600 cursor-pointer">
          <Search className="w-6 h-6" />
          <span className="text-xs mt-1">Explore</span>
        </a>
        <a href="#" className="flex flex-col items-center text-gray-600">
          <Video className="w-6 h-6" />
          <span className="text-xs mt-1">Live</span>
        </a>
        <a onClick={() => navigateTo('messages')} className="flex flex-col items-center text-gray-600 cursor-pointer">
          <MessageSquare className="w-6 h-6" />
          <span className="text-xs mt-1">Messages</span>
        </a>
        <a href="#" onClick={toggleDropdown} className="flex flex-col items-center text-gray-600 hover:text-primary">
          <User className="w-6 h-6" />
          <span className="text-xs mt-1">Profile</span>
        </a>
      </nav>
    </div>
  );
};

export default MainPage;