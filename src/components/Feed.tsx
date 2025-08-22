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
  creator_category?: string;
  category?: string;
  likes_count: number;
  comments_count: number;
  is_locked: boolean;
  // Optional creator id for resolving display fields when missing
  creator_id?: string;
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
  // Track posts we've already added to avoid duplicates across pagination and re-renders
  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<boolean>(false);
  const { isAuthenticated, setSelectedProfile } = useAuth();
  
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
    if (fetchingRef.current) return; // prevent overlapping fetches
    fetchingRef.current = true;
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
        // Debug: inspect the first row shape to confirm field names from RPC
        try {
          console.debug('[feed] sample row keys:', Object.keys(data[0] || {}));
        } catch { /* noop */ }

        type RpcRow = {
          id?: string | number;
          title?: string | null;
          content?: string | null;
          media_urls?: string[] | null;
          created_at?: string | null;
          creator_name?: string | null;
          author_name?: string | null;
          full_name?: string | null;
          username?: string | null;
          creator_avatar?: string | null;
          avatar_url?: string | null;
          user_type?: string | null;
          category?: string | null;
          likes_count?: number | null;
          comments_count?: number | null;
          is_locked?: boolean | null;
          user_id?: string | null;
          creator_id?: string | null;
          author_id?: string | null;
          user?: string | null;
          owner_id?: string | null;
        };

        const normalizePost = (p: RpcRow): FeedPost => {
          const name = p?.creator_name || p?.author_name || p?.full_name || p?.username || '';
          const avatar = p?.creator_avatar || p?.avatar_url || '';
          const cid = p?.user_id || p?.creator_id || p?.author_id || p?.user || p?.owner_id || undefined;
          return {
            id: String(p?.id ?? ''),
            title: String(p?.title ?? ''),
            content: String(p?.content ?? ''),
            media_urls: Array.isArray(p?.media_urls) ? p.media_urls : null,
            created_at: String(p?.created_at ?? new Date().toISOString()),
            creator_name: name,
            creator_avatar: avatar,
            creator_category: p?.user_type || undefined,
            category: p?.category ? String(p.category) : undefined,
            likes_count: Number(p?.likes_count ?? 0),
            comments_count: Number(p?.comments_count ?? 0),
            is_locked: Boolean(p?.is_locked ?? false),
            creator_id: cid ? String(cid) : undefined,
          };
        };

        // Normalize first; actual dedupe will be done inside setPosts using prev state
        const normalized = (data as RpcRow[]).map(normalizePost);

        // Attempt to resolve missing creator fields by creator_id in one batch
        const missingWithId = normalized.filter(p => (!p.creator_name || !p.creator_avatar || !p.creator_category) && p.creator_id);
        const ids = Array.from(new Set(missingWithId.map(p => p.creator_id!).filter(Boolean)));

        if (ids.length > 0) {
          type UsersRow = { id: string; full_name: string | null; username: string | null; avatar_url: string | null; user_type: string | null };
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, full_name, username, avatar_url, user_type')
            .in('id', ids);
          if (usersError) {
            console.warn('[feed] users resolve error:', usersError.message);
          }
          const urows = (Array.isArray(usersData) ? usersData : []) as UsersRow[];
          const map = new Map<string, UsersRow>();
          for (const u of urows) { if (u?.id) map.set(u.id, u); }

          // Merge resolved fields into normalized
          for (const p of normalized) {
            if (p.creator_id && map.has(p.creator_id)) {
              const u = map.get(p.creator_id)!;
              if (!p.creator_name) p.creator_name = u.full_name || u.username || p.creator_name || '';
              if (!p.creator_avatar) p.creator_avatar = u.avatar_url || p.creator_avatar || '';
              if (!p.creator_category) p.creator_category = u.user_type || 'User';
            }
          }
        }

        // Deduplicate inside state setter to avoid race conditions
        setPosts(prev => {
          const merged: FeedPost[] = [];
          const localSeen = new Set<string>(seenIdsRef.current);
          // Seed with prev
          for (const p of prev) {
            const id = String(p.id);
            if (!localSeen.has(id)) {
              localSeen.add(id);
              merged.push(p);
            }
          }
          // Add new
          for (const p of normalized) {
            const id = String(p.id);
            if (!localSeen.has(id)) {
              localSeen.add(id);
              merged.push(p);
            }
          }
          // Update the ref after building the final list
          seenIdsRef.current = localSeen;
          return merged;
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
      fetchingRef.current = false;
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

  const handleCreatorClick = async (creatorName: string, creatorAvatar?: string) => {
    type UsersRow = {
      id?: string;
      username?: string | null;
      full_name?: string | null;
      avatar_url?: string | null;
      user_type?: string | null;
    };
    try {
      // Try to resolve the creator by username or full_name, mirroring search behavior
      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url, user_type')
        .or(`full_name.eq.${creatorName},username.eq.${creatorName}`)
        .limit(1);

      const row: UsersRow | null = Array.isArray(data) && data.length > 0 ? (data[0] as UsersRow) : null;
      if (error) {
        console.warn('Creator lookup error:', error.message);
      }

      const profile = row
        ? {
            name: (row.full_name as string) || (row.username as string) || creatorName,
            username: (row.username as string) || (row.id as string) || creatorName,
            avatar: (row.avatar_url as string) || creatorAvatar || 'https://i.pravatar.cc/150',
            category: (row.user_type as string) || 'User',
          }
        : {
            name: creatorName,
            username: creatorName,
            avatar: creatorAvatar || 'https://i.pravatar.cc/150',
            category: 'User',
          };

      // Set selected profile for the Creator page to consume
      setSelectedProfile?.({ name: profile.name, username: profile.username, avatar: profile.avatar });

      // Push a friendly URL (non-router) for /profile/:userId
      try {
        const userIdForUrl = encodeURIComponent(profile.username || profile.name);
        window.history.pushState({}, '', `/profile/${userIdForUrl}`);
      } catch { /* noop */ }

      // Navigate using app's page navigation
      if (navigateTo) navigateTo('creator');
    } catch (e) {
      console.warn('Creator click failed:', e);
      if (navigateTo) navigateTo('creator');
    }
  };

  // Function to render media content (images/videos)
  const renderMedia = (mediaUrls: string[] | null, locked: boolean = false) => {
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
              className={`w-full h-auto max-h-[400px] object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} 
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
              className={`w-full h-auto max-h-[400px] object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`}
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
                    className={`w-full h-full object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} 
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
                    className={`w-full h-full object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`}
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
        <div className="bg-slate-900 text-gray-100 rounded-lg sm:rounded-xl p-6 text-center border border-slate-700 shadow-sm">
          <div className="text-gray-400 mb-3">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-100 mb-1">No posts yet</h3>
          <p className="text-gray-400">Follow creators to see their updates.</p>
        </div>
      ) : (
        posts.map((post, idx) => (
          <article
            key={post.id}
            ref={idx === posts.length - 1 ? lastPostElementRef : undefined}
            className="group bg-slate-900 text-gray-100 rounded-lg sm:rounded-xl overflow-hidden border border-slate-700 shadow-sm card-hover animate-in-up"
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
                  onClick={() => handleCreatorClick(post.creator_name, post.creator_avatar)}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className="font-medium text-sm sm:text-base leading-tight cursor-pointer hover:underline text-gray-100"
                      onClick={() => handleCreatorClick(post.creator_name, post.creator_avatar)}
                      title={`View ${post.creator_name}'s profile`}
                    >
                      {post.creator_name || 'Unknown'}
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs bg-primary/10 text-primary border border-primary/20">
                      {post.category || post.creator_category || 'User'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {formatTimeAgo(post.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* Post Content */}
            <div className="px-3 sm:px-4 pb-2 sm:pb-3">
              {post.content && (
                <p className="mb-2 text-sm sm:text-base leading-relaxed text-gray-200">{post.content}</p>
              )}
            </div>

            {/* Media Content with lock overlay when needed */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-slate-700 mx-3 sm:mx-4 mb-2 sm:mb-3">
                {renderMedia(post.media_urls, post.is_locked)}
                {post.is_locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="text-center px-4">
                      <Lock className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-1 sm:mb-2 text-white" />
                      <h4 className="text-base sm:text-lg font-medium text-white mb-1">Content Locked</h4>
                      <p className="text-xs sm:text-sm text-gray-200 mb-3 sm:mb-4">
                        Support this creator to unlock
                      </p>
                      <button className="bg-primary hover:bg-primary-dark text-gray-900 font-medium px-4 sm:px-6 py-1.5 sm:py-2 text-sm rounded-full transition-all hover:shadow-[0_8px_26px_rgba(255,90,136,0.35)]">
                        Support
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions and Visibility */}
            <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between border-t border-slate-700 bg-slate-900/80">
              {/* Left side - interaction buttons */}
              <div className="flex items-center space-x-4">
                <button className="flex items-center text-gray-300 hover:text-primary transition-colors" aria-label="Like">
                  <Heart className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
                  <span className="text-xs sm:text-sm">{post.likes_count || 0}</span>
                </button>
                <button className="flex items-center text-gray-300 hover:text-primary transition-colors" aria-label="Comment">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
                  <span className="text-xs sm:text-sm">{post.comments_count || 0}</span>
                </button>
                <button className="flex items-center text-gray-300 hover:text-primary transition-colors" aria-label="Share">
                  <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
              
              {/* Right side - visibility */}
              <div className="flex items-center">
                <span className="text-xs text-gray-300 px-2 py-1 bg-slate-800 rounded-md border border-slate-700">Public</span>
                {post.is_locked && (
                  <span className="ml-2 text-xs text-primary font-medium">Locked</span>
                )}
                {post.category && (
                  <span className="ml-2 text-xs px-2 py-1 rounded-md bg-slate-800 text-gray-300 border border-slate-700">{post.category}</span>
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
