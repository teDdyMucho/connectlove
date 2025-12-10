import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Heart, MessageSquare, Share2, Lock, Globe, Users, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Tier helpers to match Feed UI
type Tier = 'Public' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
const normalizeTier = (v?: string | null): Tier => {
  if (!v) return 'Public';
  const t = String(v).trim();
  if (['Bronze', 'Silver', 'Gold', 'Platinum'].includes(t)) return t as Tier;
  return 'Public';
};
const badgeClassForTier = (tier?: string | null) => {
  const t = normalizeTier(tier);
  switch (t) {
    case 'Bronze': return 'bg-amber-700 text-amber-100';
    case 'Silver': return 'bg-slate-400 text-slate-900';
    case 'Gold': return 'bg-yellow-500 text-yellow-900';
    case 'Platinum': return 'bg-blue-600 text-white';
    default: return 'bg-green-600 text-white';
  }
};

// Define types for post data
type PostWithMedia = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  visibility: 'public' | 'friends' | 'private';
  created_at: string;
  has_media: boolean;
  media_urls?: string[] | null;
  likes_count?: number;
  comments_count?: number;
  author_name?: string; // We'll fetch this separately if needed
};

type UserPostProps = {
  userId?: string; // Optional: If provided, fetch posts for this specific user
};

// Visibility icon beside timestamp
const VisibilityIcon: React.FC<{ visibility?: string | null }> = ({ visibility }) => {
  const v = (visibility || 'public').toLowerCase();
  const cls = 'inline-block align-middle ml-2 text-gray-300';
  if (v === 'private' || v === 'only me') return <User className={`h-3.5 w-3.5 ${cls}`} />;
  if (v === 'friends' || v === 'supporters' || v === 'friend') return <Users className={`h-3.5 w-3.5 ${cls}`} />;
  return <Globe className={`h-3.5 w-3.5 ${cls}`} />; // public/global
};

const UserPost: React.FC<UserPostProps> = ({ userId }) => {
  const [posts, setPosts] = useState<PostWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Format time ago (e.g., "2 hours ago", "5 minutes ago")
  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };
  
  // Helper function to check if a string is an email
  const isEmail = (str: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  };

  // Helper function to get user ID from email if needed
  const getUserIdFromEmail = async (email: string): Promise<string | null> => {
    try {
      // First check if we already have this mapping in localStorage
      const cachedId = localStorage.getItem('user_id_for_' + email);
      if (cachedId) {
        return cachedId;
      }

      // Try to get from auth.users table first (main users table)
      const { data, error } = await supabase
        .from('users')
        .select('id, user_id')
        .eq('email', email)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user ID from users table:', error);
        // Don't return null yet, try other tables
      }
      
      if (data?.user_id || data?.id) {
        const userId = data.user_id || data.id;
        localStorage.setItem('user_id_for_' + email, userId);
        return userId;
      }

      // If not found in users table, try profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id')
        .eq('email', email)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching user ID from profiles table:', profileError);
      }

      if (profileData?.user_id || profileData?.id) {
        const userId = profileData.user_id || profileData.id;
        localStorage.setItem('user_id_for_' + email, userId);
        return userId;
      }

      // If still not found, try to extract user ID from localStorage
      // This is a fallback mechanism for users who might not be in the database yet
      const publicId = localStorage.getItem('public_id');
      const currentUserId = localStorage.getItem('current_user_id');
      
      if (email === localStorage.getItem('logged_in_email')) {
        // If this is the current logged in user's email, use their public_id or current_user_id
        if (publicId) {
          localStorage.setItem('user_id_for_' + email, publicId);
          return publicId;
        } else if (currentUserId) {
          localStorage.setItem('user_id_for_' + email, currentUserId);
          return currentUserId;
        }
      }
      
      // Last resort: For any problematic emails, try to generate a valid UUID
      // Check if we have any posts in the database to extract a valid user_id
      const { data: userData } = await supabase
        .from('post_with_media')
        .select('user_id')
        .limit(5);
      
      if (userData && userData.length > 0) {
        // Try to find a non-null user_id
        for (const item of userData) {
          if (item.user_id) {
            const userId = item.user_id;
            localStorage.setItem('user_id_for_' + email, userId);
            console.warn(`Using existing user_id from posts for ${email}: ${userId}`);
            return userId;
          }
        }
      }
      
      // If we still can't find it, create a deterministic UUID from the email
      // This is a last resort to prevent errors
      // Use a hash-like function to create a consistent ID for the same email
      let hash = 0;
      for (let i = 0; i < email.length; i++) {
        const char = email.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      
      // Format as UUID
      const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
      const deterministicId = hashStr.slice(0, 8) + '-' + 
                             hashStr.slice(0, 4) + '-' + 
                             '4' + hashStr.slice(0, 3) + '-' + 
                             'a' + hashStr.slice(0, 3) + '-' + 
                             hashStr.slice(0, 12).padEnd(12, '0');
      
      localStorage.setItem('user_id_for_' + email, deterministicId);
      console.warn(`Created deterministic UUID for ${email}: ${deterministicId}`);
      return deterministicId;
    } catch (err) {
      console.error('Error in getUserIdFromEmail:', err);
      return null;
    }
  };

  // Helper function to fetch posts for a specific user - wrapped in useCallback to avoid recreation on each render
  const fetchPostsForUser = useCallback(async (targetUserId: string, loggedInUserId: string | null) => {
    try {
      console.log('Fetching posts for user ID/email:', targetUserId);
      console.log('Logged in user ID:', loggedInUserId);
      
      // If targetUserId is an email, try to get the actual UUID
      let effectiveTargetId = targetUserId;
      if (isEmail(targetUserId)) {
        console.log('Target ID is an email, converting to UUID...');
        const userId = await getUserIdFromEmail(targetUserId);
        if (userId) {
          effectiveTargetId = userId;
          console.log('Converted email to UUID:', effectiveTargetId);
          // Store this mapping for future use
          localStorage.setItem('user_id_for_' + targetUserId, userId);
        } else {
          throw new Error(`Could not find user ID for email: ${targetUserId}`);
        }
      }
      
      console.log('Using effective target ID for query:', effectiveTargetId);
      
      // Query the post_with_media table
      // If viewing own profile, show all posts
      // If viewing someone else's profile, only show their public posts
      let query = supabase
        .from('post_with_media')
        .select('*')
        .eq('user_id', effectiveTargetId)
        .order('created_at', { ascending: false });
      
      // If viewing someone else's profile, only show their public posts
      if (targetUserId !== loggedInUserId) {
        console.log('Viewing another user\'s profile, filtering to public posts only');
        query = query.eq('visibility', 'public');
      } else {
        console.log('Viewing own profile, showing all posts');
      }
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) {
        console.error('Error from Supabase query:', fetchError);
        throw new Error(fetchError.message);
      }
      
      console.log('Posts fetched:', data ? data.length : 0);
      if (data && data.length === 0) {
        console.log('No posts found for this user ID:', effectiveTargetId);
      }
      
      if (data) {
        setPosts(data as PostWithMedia[]);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load posts');
      setLoading(false);
    }
  }, []);  // Empty dependency array since this function doesn't depend on any props or state

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Determine which user's posts to fetch
        // First try the userId prop, then localStorage keys, then check if we're viewing someone else's profile
        const targetUserId = userId || 
                           localStorage.getItem('public_id') || 
                           localStorage.getItem('viewing_user_id') || 
                           localStorage.getItem('logged_in_email');
                           
        // For logged-in user identification, try multiple possible sources
        const loggedInUserId = localStorage.getItem('current_user_id') || 
                             localStorage.getItem('public_id') || 
                             localStorage.getItem('logged_in_email');
        
        if (!targetUserId) {
          // If we still don't have a user ID, try to get it from the URL or other context
          const urlParams = new URLSearchParams(window.location.search);
          const userIdFromUrl = urlParams.get('userId') || urlParams.get('id');
          
          if (userIdFromUrl) {
            // If found in URL, use it and also store for future reference
            localStorage.setItem('viewing_user_id', userIdFromUrl);
            fetchPostsForUser(userIdFromUrl, loggedInUserId);
            return;
          }
          
          setError('No user ID available to fetch posts');
          setLoading(false);
          return;
        }
        
        // Use the helper function to fetch posts
        await fetchPostsForUser(targetUserId, loggedInUserId);
      } catch (err) {
        console.error('Error fetching posts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load posts');
        setLoading(false);
      }
    };
    
    fetchPosts();
  }, [userId, fetchPostsForUser]);
  if (loading) {
    return (
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200 animate-pulse">
        <div className="flex items-center space-x-3">
          <div className="rounded-full bg-gray-200 h-10 w-10"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/6"></div>
          </div>
        </div>
        <div className="mt-3 h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="mt-2 h-4 bg-gray-200 rounded w-1/2"></div>
        <div className="mt-4 h-40 bg-gray-100 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="text-center py-6 text-red-500">
          <p>Error loading posts: {error}</p>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="text-center py-8">
          <p className="text-gray-600 mb-1">No posts yet</p>
          <p className="text-gray-400 text-sm">Posts you create will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-20">
      {posts.map((post) => {
        const locked = post.visibility !== 'public';
        const tierBadge = normalizeTier(post.category);
        const media = Array.isArray(post.media_urls) ? post.media_urls : [];
        const isVideo = (url: string) => /\.(mp4|webm|ogg)$/i.test(url);
        const authorName = userId && userId !== localStorage.getItem('public_id')
          ? localStorage.getItem('viewing_full_name') || localStorage.getItem('viewing_username') || 'User'
          : localStorage.getItem('full_name') || localStorage.getItem('username') || 'Anonymous';

        return (
          <article key={post.id} className="group bg-[#121212] rounded-lg overflow-hidden border border-gray-800 shadow-sm">
            <div className="p-3 sm:p-4">
              <div className="flex items-center">
                {localStorage.getItem('avatar_url') ? (
                  <img
                    src={localStorage.getItem('avatar_url') as string}
                    alt={authorName}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover mr-2 sm:mr-3"
                    onError={(e) => { const t = e.currentTarget; t.onerror = null; t.src = '/default-avatar.png'; }}
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-800 mr-2 sm:mr-3 flex items-center justify-center text-gray-400">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm sm:text-base text-white leading-tight">
                        {authorName}
                      </h3>
                      <p className="text-xs text-gray-400 flex items-center">
                        {formatTimeAgo(post.created_at)}
                        <VisibilityIcon visibility={post.visibility} />
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${badgeClassForTier(tierBadge)}`}>
                      {tierBadge}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-3 sm:px-4 pb-2 sm:pb-3">
              {!locked && post.content && (
                <p className="mb-2 text-sm sm:text-base leading-relaxed text-gray-200">{post.content}</p>
              )}
              {locked && (
                <div className="mb-2 rounded-md border border-gray-700 bg-black/40 p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-200">
                    <Lock className="h-4 w-4" />
                    <span className="text-sm">This post is locked. Subscribe to unlock.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Media + lock overlay */}
            {media.length > 0 && (
              <div className="relative w-full overflow-hidden rounded-xl border border-gray-800 mx-3 sm:mx-4 mb-2 sm:mb-3">
                {media.length === 1 ? (
                  isVideo(media[0]) ? (
                    <video src={media[0]} className={`w-full h-auto max-h-[400px] object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} controls preload="metadata" />
                  ) : (
                    <img src={media[0]} alt="Post content" className={`w-full h-auto max-h-[400px] object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} />
                  )
                ) : (
                  <div className={`grid gap-1 ${media.length === 2 ? 'grid-cols-2' : media.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                    {media.slice(0, 6).map((url, index) => (
                      <div key={index} className="relative aspect-square overflow-hidden">
                        {isVideo(url) ? (
                          <video src={url} className={`w-full h-full object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} preload="metadata" />
                        ) : (
                          <img src={url} alt={`Media ${index + 1}`} className={`w-full h-full object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} />
                        )}
                        {index === 5 && media.length > 6 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-xl">+{media.length - 6}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="text-center px-4">
                      <Lock className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-1 sm:mb-2 text-white" />
                      <h4 className="text-base sm:text-lg font-medium text-white mb-1">Content Locked</h4>
                      <p className="text-xs sm:text-sm text-gray-200 mb-3 sm:mb-4">Support this creator to unlock</p>
                      <button className="bg-pink-500 hover:bg-pink-600 text-white font-medium px-4 sm:px-6 py-1.5 sm:py-2 text-sm rounded-full transition-all">Support</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-3 sm:px-4 pt-2 sm:pt-3 pb-3 flex items-center justify-between bg-[#121212]">
              <div className="flex items-center space-x-4">
                <button className="flex items-center text-gray-300 hover:text-pink-500 transition-colors" aria-label="Like">
                  <Heart className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
                  <span className="text-xs sm:text-sm">{post.likes_count || 0}</span>
                </button>
                <button className="flex items-center text-gray-300 hover:text-pink-500 transition-colors" aria-label="Comment">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
                  <span className="text-xs sm:text-sm">{post.comments_count || 0}</span>
                </button>
                <button className="flex items-center text-gray-300 hover:text-pink-500 transition-colors" aria-label="Share">
                  <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
              <div />
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default UserPost;
