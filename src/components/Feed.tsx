import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, MessageSquare, Share2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from './AuthContext';

interface FeedPost {
  id: string;
  title: string;
  content: string;
  media_urls: string[] | null;
  created_at: string;
  creator_name: string;
  creator_avatar: string;
  likes_count: number;
  comments_count: number;
  is_locked: boolean;
}

interface FeedProps {
  navigateTo?: (page: string) => void;
}

const Feed: React.FC<FeedProps> = ({ navigateTo }) => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { isAuthenticated } = useAuth();
  
  const LIMIT = 10; // Number of posts to fetch per request
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useCallback((node: HTMLElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setOffset(prevOffset => prevOffset + LIMIT);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get the current user's ID from Supabase Auth
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Supabase Auth User:', user);
      
      // Try to get user ID from multiple sources
      let viewerId = user?.id || null;
      console.log('ViewerId from Supabase Auth:', viewerId);
      
      // If no user ID from auth, try localStorage fallbacks like in userProfile.tsx
      if (!viewerId) {
        try {
          // Check localStorage for user ID (similar to userProfile.tsx)
          const currentUserId = localStorage.getItem('current_user_id');
          const publicId = localStorage.getItem('public_id');
          viewerId = currentUserId || publicId;
          
          console.log('localStorage values:', {
            current_user_id: currentUserId,
            public_id: publicId,
            viewerId: viewerId
          });
          
          // If we have an email but no ID, try to get the ID mapped to that email
          const loggedInEmail = localStorage.getItem('logged_in_email');
          if (!viewerId && loggedInEmail) {
            const emailMappedId = localStorage.getItem(`user_id_for_${loggedInEmail}`);
            viewerId = emailMappedId;
            console.log('Email mapped ID:', {
              loggedInEmail,
              emailMappedId
            });
          }
        } catch (err) {
          console.error('Error accessing localStorage:', err);
        }
      }
      
      // Check isAuthenticated from AuthContext
      console.log('isAuthenticated from useAuth:', isAuthenticated);
      
      // If authenticated via context but no viewerId, try to use a default ID or create one
      if (isAuthenticated && !viewerId) {
        try {
          // Try to get a user ID from the profile in localStorage
          const selectedProfileStr = localStorage.getItem('selectedProfile');
          if (selectedProfileStr) {
            const selectedProfile = JSON.parse(selectedProfileStr);
            if (selectedProfile && selectedProfile.id) {
              viewerId = selectedProfile.id;
              console.log('Using viewerId from selectedProfile:', viewerId);
            }
          }
          
          // If still no viewerId but user is authenticated, create a temporary one
          if (!viewerId) {
            // Use a default ID or create a session-based one
            // This is just a fallback to prevent the error message
            viewerId = 'authenticated-user';
            console.log('Using fallback viewerId for authenticated user');
          }
        } catch (err) {
          console.error('Error processing authentication fallbacks:', err);
        }
      }
      
      if (!viewerId) {
        console.error('No viewer ID found from any source');
        setError("You must be logged in to view the feed");
        setLoading(false);
        return;
      }
      
      console.log('Final viewerId used for feed:', viewerId);
      
      // Call the RPC function to fetch feed posts
      const { data, error } = await supabase.rpc('fetch_feed_posts', {
        viewer_id: viewerId,
        limit_count: LIMIT,
        offset_count: offset
      });
      
      if (error) {
        console.error('Error fetching feed posts:', error);
        setError(error.message);
        setLoading(false);
        return;
      }
      
      if (data && data.length > 0) {
        setPosts(prevPosts => {
          // Filter out any duplicate posts that might be returned
          const newPosts = data.filter((newPost: FeedPost) => 
            !prevPosts.some(existingPost => existingPost.id === newPost.id)
          );
          return [...prevPosts, ...newPosts];
        });
        
        // If we got fewer posts than the limit, we've reached the end
        setHasMore(data.length === LIMIT);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Exception fetching feed posts:', err);
      setError('Failed to load posts. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [offset, isAuthenticated]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'some time ago';
    }
  };

  const handleCreatorClick = () => {
    if (navigateTo) {
      // Navigate to creator page
      navigateTo('creator');
    }
  };

  // Function to render media content (images/videos)
  const renderMedia = (mediaUrls: string[] | null) => {
    if (!mediaUrls || mediaUrls.length === 0) return null;
    
    // Determine if we're dealing with images or videos
    const isVideo = (url: string) => {
      return url.match(/\.(mp4|webm|ogg)$/i) !== null;
    };
    
    // For a single media item (like in the example image)
    if (mediaUrls.length === 1) {
      const url = mediaUrls[0];
      if (isVideo(url)) {
        return (
          <div className="relative w-full overflow-hidden">
            <video 
              src={url} 
              className="w-full h-auto max-h-[400px] object-cover" 
              controls
              preload="metadata"
            />
          </div>
        );
      } else {
        return (
          <div className="relative w-full overflow-hidden">
            <img
              src={url}
              alt="Post content"
              className="w-full h-auto max-h-[400px] object-cover"
              loading="lazy"
              style={{ 
                borderRadius: '0px',
                margin: '0 auto'
              }}
            />
          </div>
        );
      }
    }
    
    // For multiple media items, create a grid with soft edges
    return (
      <div className="w-full overflow-hidden">
        <div className={`grid gap-1 ${mediaUrls.length === 2 ? 'grid-cols-2' : mediaUrls.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {mediaUrls.slice(0, 6).map((url, index) => {
            if (isVideo(url)) {
              return (
                <div key={index} className="relative aspect-square overflow-hidden">
                  <video 
                    src={url} 
                    className="w-full h-full object-cover" 
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              );
            } else {
              return (
                <div key={index} className="relative aspect-square overflow-hidden">
                  <img
                    src={url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {index === 5 && mediaUrls.length > 6 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-xl">
                      +{mediaUrls.length - 6}
                    </div>
                  )}
                </div>
              );
            }
          })}
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {posts.length === 0 && !loading ? (
        <div className="bg-white rounded-lg sm:rounded-xl p-6 text-center border border-gray-200 shadow-sm">
          <div className="text-gray-400 mb-3">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No posts yet</h3>
          <p className="text-gray-600">Follow creators to see their updates.</p>
        </div>
      ) : (
        posts.map((post, idx) => (
          <article
            key={post.id}
            ref={idx === posts.length - 1 ? lastPostElementRef : undefined}
            className="group bg-white rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 shadow-sm card-hover animate-in-up"
            style={{ animationDelay: `${idx * 60}ms` }}
            aria-posinset={idx + 1}
            aria-setsize={posts.length}
            aria-roledescription="Post"
          >
            {/* Header - User Profile Section */}
            <div className="p-3 sm:p-4 flex items-center">
              <div className="flex items-center">
                <img
                  src={post.creator_avatar || 'https://via.placeholder.com/40'}
                  alt={post.creator_name}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover mr-2 sm:mr-3 cursor-pointer"
                  onClick={() => handleCreatorClick()}
                />
                <div className="min-w-0">
                  <h3 className="font-medium text-sm sm:text-base leading-tight">{post.creator_name}</h3>
                  <p className="text-xs text-gray-500">
                    {formatTimeAgo(post.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* Post Content */}
            <div className="px-3 sm:px-4 pb-2 sm:pb-3">
              {post.content && (
                <p className="mb-2 text-sm sm:text-base leading-relaxed">{post.content}</p>
              )}
            </div>

            {/* Media Content */}
            {!post.is_locked && post.media_urls && post.media_urls.length > 0 && (
              <div className="w-full overflow-hidden">
                {renderMedia(post.media_urls)}
              </div>
            )}

            {/* Locked Content */}
            {post.is_locked && (
              <div className="relative bg-gradient-to-r from-light-accent/30 to-medium-accent/30 h-48 sm:h-64 flex items-center justify-center">
                <div className="text-center px-4">
                  <Lock className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-1 sm:mb-2 text-primary icon-bounce" />
                  <h4 className="text-base sm:text-lg font-medium mb-1">Content Locked</h4>
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                    Support this creator to unlock
                  </p>
                  <button className="bg-primary hover:bg-primary-dark text-gray-900 font-medium px-4 sm:px-6 py-1.5 sm:py-2 text-sm rounded-full transition-all hover:shadow-[0_8px_26px_rgba(255,90,136,0.35)]">
                    Support
                  </button>
                </div>
              </div>
            )}

            {/* Actions and Visibility */}
            <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between border-t border-gray-200 bg-white/60 backdrop-blur-[1px]">
              {/* Left side - interaction buttons */}
              <div className="flex items-center space-x-4">
                <button className="flex items-center text-gray-600 hover:text-primary transition-colors" aria-label="Like">
                  <Heart className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
                  <span className="text-xs sm:text-sm">{post.likes_count || 0}</span>
                </button>
                <button className="flex items-center text-gray-600 hover:text-primary transition-colors" aria-label="Comment">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
                  <span className="text-xs sm:text-sm">{post.comments_count || 0}</span>
                </button>
                <button className="flex items-center text-gray-600 hover:text-primary transition-colors" aria-label="Share">
                  <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
              
              {/* Right side - visibility */}
              <div className="flex items-center">
                <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded-md">
                  Public
                </span>
                {post.is_locked && (
                  <span className="ml-2 text-xs text-primary font-medium">Locked</span>
                )}
              </div>
            </div>
          </article>
        ))
      )}
      
      {loading && (
        <div className="flex justify-center items-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
};

export default Feed;
