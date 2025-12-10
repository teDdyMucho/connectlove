import React, { useState, useRef, useEffect } from 'react';
import { Heart, Settings, Lock, User, X, Search, Bell, MessageCircle, Share2, Eye } from 'lucide-react';
import './creator.css';
import ProfileDropdown from '../components/ProfileDropdown';
import { useAuth } from '../components/AuthContext';
import handleSupportCreator from './subscriptions';
import { supabase } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';



interface CreatorProps {
  navigateTo?: (page: string) => void;
}

interface PostWithMedia {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  visibility: 'public' | 'private' | 'supporters';
  created_at: string;
  media_urls: string[];
  author_name?: string;
  author_username?: string;
}

const Creator: React.FC<CreatorProps> = ({ navigateTo }) => {
  const { selectedProfile } = useAuth();
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const noopSetSupportTags = () => {};
  const [selectedTier, setSelectedTier] = useState<'Platinum' | 'Gold' | 'Silver' | 'Bronze'>('Bronze');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [posts, setPosts] = useState<PostWithMedia[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  // All subscriptions for the logged-in user (deduped by creator_id -> latest row)
  const [mySubs, setMySubs] = useState<Record<string, { tier: string | null; created_at: string; following?: boolean | null }>>({});
  const [supporterDbId, setSupporterDbId] = useState<string>('');
  const [creatorDbId, setCreatorDbId] = useState<string>('');
  // Toast/snackbar state
  const [toast, setToast] = useState<string>('');
  
  // Normalize DB value to boolean | null (handles text 'true'/'false')
  const asBool = (v: unknown): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
    }
    return null;
  };
  
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

  // Helper: read local identity (email or public_id)
  const getLocalIdentity = () =>
    localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '';

  // Helper: best-effort resolve to DB user id using the same strategy as `subscriptions.tsx`
  const uuidLike = (v: string) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v);
  const resolveUserId = async (identifier: string): Promise<string> => {
    try {
      // Email
      if (identifier.includes('@')) {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('email', identifier)
          .maybeSingle();
        if (data?.id) return data.id as string;
      }
      // Username
      {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('username', identifier)
          .maybeSingle();
        if (data?.id) return data.id as string;
      }
      // Direct id
      {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('id', identifier)
          .maybeSingle();
        if (data?.id) return data.id as string;
      }
      return identifier; // fallback
    } catch {
      return identifier;
    }
  };

  // Unfollow action: only flip following flag, keep any existing tier intact
  const onUnfollowNow = async () => {
    const supporterId = localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '';
    const creatorId = selectedProfile?.username || selectedProfile?.name || '';
    if (!supporterId || !creatorId) {
      alert('Missing supporter or creator identity. Please sign in and try again.');
      return;
    }
    const supporterName = localStorage.getItem('username') || localStorage.getItem('logged_in_email') || '';
    const creatorName = selectedProfile?.name || selectedProfile?.username || '';
    await handleSupportCreator({
      supporterId,
      creatorId,
      selectedTier: mySubs[creatorDbId || '']?.tier || '', // do not change tier; backend should ignore if unchanged
      supporterName,
      creatorName,
      setSupportTags: noopSetSupportTags,
      setLoading: setSupportLoading,
      following: false,
      onSuccess: () => {
        if (creatorDbId) {
          setMySubs((prev) => ({
            ...(prev || {}),
            [creatorDbId]: { tier: prev?.[creatorDbId]?.tier ?? null, created_at: new Date().toISOString(), following: false },
          }));
        }
        setToast('Unfollowed');
      },
    });
  };

  // Load existing tier that the current supporter used to subscribe to this creator
  useEffect(() => {
    const loadExistingTier = async () => {
      try {
        const supporterIdentifier = getLocalIdentity();
        const creatorIdentifier = selectedProfile?.username || selectedProfile?.name || '';
        if (!supporterIdentifier || !creatorIdentifier) return;

        const supporterId = uuidLike(supporterIdentifier)
          ? supporterIdentifier
          : await resolveUserId(supporterIdentifier);
        const creatorId = uuidLike(creatorIdentifier)
          ? creatorIdentifier
          : await resolveUserId(creatorIdentifier);
        if (!uuidLike(supporterId) || !uuidLike(creatorId)) return;

        // Pull a small window of recent rows so we can:
        // - take following from the latest row
        // - take tier from the latest NON-NULL tier row
        const { data, error } = await supabase
          .from('supports')
          .select('tier, created_at, following')
          .eq('supporter_id', supporterId)
          .eq('creator_id', creatorId)
          .order('created_at', { ascending: false })
          .limit(25);

        if (error) {
          // Non-fatal; just log for debugging
          console.warn('[supports] loadExistingTier error:', error.message);
          return;
        }

        type TierOption = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
        type SupportRow = { tier: TierOption | null; created_at: string; following: string | boolean | null };
        const rows = (Array.isArray(data) ? data : []) as SupportRow[];
        // Store resolved IDs for later use
        setSupporterDbId(supporterId);
        setCreatorDbId(creatorId);
        if (rows.length > 0) {
          const latest = rows[0];
          const follow = asBool(latest.following);
          // find the first non-null tier across the list (already ordered desc)
          const tierPersisted = (rows.find(r => r.tier) || null)?.tier ?? null;
          setMySubs((prev) => ({
            ...(prev || {}),
            [creatorId]: {
              tier: tierPersisted,
              created_at: latest.created_at || new Date().toISOString(),
              following: follow,
            },
          }));
        }
      } catch (e) {
        console.warn('[supports] Failed to load tier', e);
      }
    };

    loadExistingTier();
    // Re-run when viewing another creator
  }, [selectedProfile?.username, selectedProfile?.name]);

  // Load all subscriptions for the logged-in user and dedupe by creator_id (latest only)
  useEffect(() => {
    const loadAllSubs = async () => {
      if (!supporterDbId) return;
      try {
        const { data, error } = await supabase
          .from('supports')
          .select('creator_id, tier, created_at, following')
          .eq('supporter_id', supporterDbId)
          .order('created_at', { ascending: false });
        if (error) {
          console.warn('[supports] loadAllSubs error:', error.message);
          return;
        }
        type TierOption = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
        type SupportRow = { creator_id: string; tier: TierOption | null; created_at: string; following: string | boolean | null };
        const rows = (data as SupportRow[]) || [];
        const map: Record<string, { tier: TierOption | null; created_at: string; following?: boolean | null }> = {};
        for (const row of rows) {
          const id = row.creator_id;
          if (!map[id]) {
            // initialize with latest row's created_at and following
            map[id] = {
              tier: row.tier ?? null,
              created_at: row.created_at,
              following: asBool(row.following),
            };
          }
          // backfill tier if currently null and we encounter a non-null tier in older rows
          if (map[id].tier === null && row.tier) {
            map[id].tier = row.tier;
          }
        }
        setMySubs(map);
      } catch (e) {
        console.warn('[supports] Failed to load subscriptions', e);
      }
    };
    loadAllSubs();
  }, [supporterDbId]);

  // Realtime: update only the 'following' field on backend changes
  useEffect(() => {
    if (!supporterDbId || !creatorDbId) return;

    type SupportsRow = {
      creator_id?: string;
      following?: string | boolean | null;
      created_at?: string;
    };

    const channel = supabase
      .channel(`supports-${supporterDbId}-${creatorDbId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'supports', filter: `supporter_id=eq.${supporterDbId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as SupportsRow | undefined;
          if (!row || row.creator_id !== creatorDbId) return;

          if (payload.eventType === 'DELETE') {
            setMySubs((prev) => ({
              ...(prev || {}),
              [creatorDbId]: {
                tier: prev?.[creatorDbId]?.tier ?? null,
                created_at: prev?.[creatorDbId]?.created_at ?? new Date().toISOString(),
                following: null,
              },
            }));
            return;
          }

          const follow = asBool(row.following ?? null);
          setMySubs((prev) => ({
            ...(prev || {}),
            [creatorDbId]: {
              tier: prev?.[creatorDbId]?.tier ?? null, // do not change tier via realtime
              created_at: row.created_at || new Date().toISOString(),
              following: follow,
            },
          }));
        }
      );

    channel.subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supporterDbId, creatorDbId]);

  const onSupportNow = async () => {
    const supporterId = localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '';
    const creatorId = selectedProfile?.username || selectedProfile?.name || '';
    if (!supporterId || !creatorId) {
      alert('Missing supporter or creator identity. Please sign in and try again.');
      return;
    }
    const supporterName = localStorage.getItem('username') || localStorage.getItem('logged_in_email') || '';
    const creatorName = selectedProfile?.name || selectedProfile?.username || '';
    await handleSupportCreator({
      supporterId,
      creatorId,
      selectedTier,
      supporterName,
      creatorName,
      setSupportTags: noopSetSupportTags,
      setLoading: setSupportLoading,
      onSuccess: () => {
        setShowSupportModal(false);
        // Optimistically update local subscriptions map to avoid duplicates
        if (creatorDbId) {
          setMySubs((prev) => ({
            ...(prev || {}),
            // Auto-follow on subscribe/upgrade: reflect immediately in UI
            [creatorDbId]: { tier: selectedTier, created_at: new Date().toISOString(), following: true },
          }));
        }
        setToast('Support updated');
      },
    });
  };

  // Follow action when there is no subscription tier yet
  const onFollowNow = async () => {
    const supporterId = localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '';
    const creatorId = selectedProfile?.username || selectedProfile?.name || '';
    if (!supporterId || !creatorId) {
      alert('Missing supporter or creator identity. Please sign in and try again.');
      return;
    }
    const supporterName = localStorage.getItem('username') || localStorage.getItem('logged_in_email') || '';
    const creatorName = selectedProfile?.name || selectedProfile?.username || '';
    await handleSupportCreator({
      supporterId,
      creatorId,
      selectedTier: '', // no tier for follow-only
      supporterName,
      creatorName,
      setSupportTags: noopSetSupportTags,
      setLoading: setSupportLoading,
      following: true,
      onSuccess: () => {
        if (creatorDbId) {
          setMySubs((prev) => ({
            ...(prev || {}),
            [creatorDbId]: { tier: prev?.[creatorDbId]?.tier ?? null, created_at: new Date().toISOString(), following: true },
          }));
        }
        setToast('Now following');
      },
    });
  };

  // Current tier for this creator (type-safe normalization)
  const rawTier = creatorDbId ? mySubs[creatorDbId]?.tier : undefined;
  const currentTag: 'Platinum' | 'Gold' | 'Silver' | 'Bronze' | undefined =
    rawTier === 'Platinum' || rawTier === 'Gold' || rawTier === 'Silver' || rawTier === 'Bronze'
      ? rawTier
      : undefined;
  const isFollowing = creatorDbId ? !!mySubs[creatorDbId]?.following : false;

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };
  
  const closeDropdown = () => {
    setShowDropdown(false);
  };

  // Navigate to Supporter View (main feed)
  const handleSupporterView = () => {
    if (navigateTo) navigateTo('main');
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

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Profile display values from selectedProfile (no mock defaults)
  const displayName = selectedProfile?.name || '';
  const displayUsername = selectedProfile?.username ? `@${selectedProfile.username}` : '';
  const displayBio = selectedProfile?.bio || '';
  const displaySupporters = selectedProfile?.supporters || '0';
  const displayRating = selectedProfile?.rating;
  const authorName = displayName;

  // Fetch posts from the post_with_media table for the selected profile
  useEffect(() => {
    const fetchPosts = async () => {
      if (!selectedProfile?.username && !selectedProfile?.name) return;
      
      setIsLoadingPosts(true);
      setPostError(null);
      
      try {
        // Get the user_id for the selected profile
        const profileIdentifier = selectedProfile?.username || selectedProfile?.name || '';
        const userId = await resolveUserId(profileIdentifier);
        
        if (!userId) {
          setPostError('Could not identify the creator');
          setIsLoadingPosts(false);
          return;
        }
        
        // Fetch posts from post_with_media table
        const { data, error } = await supabase
          .from('post_with_media')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
          
        if (error) {
          console.error('Error fetching posts:', error);
          setPostError('Failed to load posts');
          setIsLoadingPosts(false);
          return;
        }
        
        // Process the posts data
        if (data && Array.isArray(data)) {
          const processedPosts = data.map(post => ({
            ...post,
            media_urls: Array.isArray(post.media_urls) ? post.media_urls : [],
            author_name: selectedProfile?.name || '',
            author_username: selectedProfile?.username || ''
          })) as PostWithMedia[];
          
          setPosts(processedPosts);
        } else {
          setPosts([]);
        }
      } catch (error) {
        console.error('Error in fetchPosts:', error);
        setPostError('An unexpected error occurred');
      } finally {
        setIsLoadingPosts(false);
      }
    };
    
    fetchPosts();
  }, [selectedProfile?.username, selectedProfile?.name]);
  
  // Format time to display as "time ago"
  const formatTimeAgo = (dateString: string): string => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'recently';
    }
  };
  
  // Check if a post should be locked based on visibility and user's subscription
  const isPostLocked = (post: PostWithMedia): boolean => {
    // If post is public, it's not locked
    if (post.visibility === 'public') return false;
    
    // If post is for supporters only, check if user is a supporter
    if (post.visibility === 'supporters') {
      return !currentTag; // Locked if user doesn't have a subscription tier
    }
    
    // If post is private, it's always locked for other users
    return post.visibility === 'private';
  };

  const handleBackToFeed = () => {
    if (navigateTo) {
      navigateTo('main');
    }
  };

  return (
    <div className="creator-page bg-[#0a0a0a] min-h-screen">
      {/* Header with navigation and search */}
      <header className="bg-[#121212] shadow-md py-2 px-3 sm:px-4 fixed top-0 left-0 right-0 z-50 safe-top">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <button 
              onClick={handleBackToFeed}
              className="text-gray-300 hover:text-white mr-2 sm:mr-4"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-white font-bold text-lg sm:text-xl">ConnectLove</div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search..."
                className="bg-gray-800 text-gray-200 rounded-full py-1 px-3 sm:px-4 focus:outline-none focus:ring-2 focus:ring-pink-500 text-xs sm:text-sm w-24 sm:w-auto"
              />
              <Search className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
            </div>
            <button className="text-gray-300 hover:text-white">
              <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <div className="relative">
              <button 
                ref={buttonRef}
                onClick={toggleDropdown}
                className="bg-pink-500 hover:bg-pink-600 rounded-full p-1"
              >
                <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
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
      <div className="flex flex-col md:flex-row max-w-6xl mx-auto pt-16 sm:pt-20 px-2 sm:px-4">
        {/* Left Profile Section */}
        <div className="profile-section md:w-1/3 relative p-3 sm:p-4 md:p-6 flex flex-col items-center bg-[#121212] rounded-lg shadow-md my-3 sm:my-4 mx-0 sm:mx-2 overflow-y-auto">
        <div className="profile-avatar w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 border-3 sm:border-4 border-[#121212] rounded-full overflow-hidden bg-gray-800 mb-3 sm:mb-4 relative shadow-md">
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <User className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16" />
            </div>
            <div className="absolute bottom-0.5 sm:bottom-1 right-0.5 sm:right-1 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-5 bg-green-500 rounded-full border-2 border-[#121212] pulse-animation"></div>
          </div>
          
          <h1 className="text-lg sm:text-xl font-bold text-center text-white">{displayName || ' '}</h1>
          <p className="text-pink-500 text-xs sm:text-sm mb-1 sm:mb-2">{displayUsername}</p>
          <p className="text-gray-400 text-xs sm:text-sm text-center mb-3 sm:mb-4 line-clamp-3">{displayBio}</p>
          
          <div className="flex justify-center space-x-4 sm:space-x-6 w-full mb-4 sm:mb-6">
            <div className="text-center">
              <div className="text-base sm:text-lg md:text-xl font-bold text-white">{displaySupporters}</div>
              <div className="text-gray-400 text-[10px] sm:text-xs">Supporters</div>
            </div>
            <div className="text-center">
              <div className="text-base sm:text-lg md:text-xl font-bold text-white">0</div>
              <div className="text-gray-400 text-[10px] sm:text-xs">Posts</div>
            </div>
            <div className="text-center">
              <div className="text-base sm:text-lg md:text-xl font-bold text-white">{typeof displayRating === 'number' ? displayRating : '-'}</div>
              <div className="text-gray-400 text-[10px] sm:text-xs">Rating</div>
            </div>
          </div>
          
          {/* Show only one tier badge for this creator if subscribed AND following */}
          {currentTag && isFollowing ? (
            <div className="supporter-badges flex flex-wrap justify-center gap-2 mb-4 sm:mb-6">
              {(() => {
                const tier = String(currentTag);
                const t = tier.toLowerCase();
                const badge = t.startsWith('p') ? 'P' : t.startsWith('g') ? 'G' : t.startsWith('s') ? 'S' : 'B';
                const cls =
                  badge === 'P' ? 'bg-purple-600 text-white' :
                  badge === 'G' ? 'bg-yellow-500 text-yellow-900' :
                  badge === 'S' ? 'bg-gray-400 text-gray-800' :
                                  'bg-amber-700 text-amber-200';
                return (
                  <div className={`supporter-badge ${cls} rounded-full p-1 shadow-sm`}>
                    <span className="inline-block w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold">{badge}</span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="mb-4 sm:mb-6" />
          )}
          
          <button 
            onClick={() => setShowSupportModal(true)}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-full px-4 sm:px-6 py-1.5 sm:py-2 flex items-center justify-center transition-colors mb-3 sm:mb-4 text-xs sm:text-sm"
          >
            <Heart className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            {isFollowing && currentTag ? 'Upgrade Subscription' : 'Support Creator'}
          </button>
          {/* Follow/Unfollow control (independent of subscription tier) */}
          {
            !isFollowing ? (
              <button
                onClick={onFollowNow}
                className="w-full bg-[#1a1a1a] border border-pink-500 text-pink-500 hover:bg-pink-500/10 font-semibold rounded-full px-4 sm:px-6 py-1.5 sm:py-2 flex items-center justify-center transition-colors mb-3 sm:mb-4 text-xs sm:text-sm"
              >
                Follow
              </button>
            ) : (
              <button
                onClick={onUnfollowNow}
                className="w-full bg-[#1a1a1a] border border-gray-600 text-gray-300 hover:bg-gray-800 font-medium rounded-full px-4 sm:px-6 py-1.5 sm:py-2 flex items-center justify-center transition-colors mb-3 sm:mb-4 text-xs sm:text-sm"
              >
                Unfollow
              </button>
            )
          }
          
          <div className="flex justify-center space-x-4 sm:space-x-8 w-full pt-3 sm:pt-4 border-t border-gray-800">
            <button className="flex items-center text-gray-400 hover:text-pink-500 text-xs sm:text-sm">
              <Settings className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
              <span>Settings</span>
            </button>
            <button className="flex items-center text-gray-400 hover:text-pink-500 text-xs sm:text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Privacy</span>
            </button>
          </div>
          {/* Supporter View CTA at bottom */}
          <div className="mt-3 sm:mt-4 w-full">
            <button
              onClick={handleSupporterView}
              className="w-full py-2.5 px-4 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 flex items-center justify-center space-x-2 transition-colors"
            >
              <Eye className="w-5 h-5" />
              <span>Supporter View</span>
            </button>
          </div>
        </div>
        
        {/* Right Content Section */}
        <div className="content-section md:w-2/3 p-3 sm:p-4">

          {/* Posts Feed */}
          <div className="posts-feed space-y-4 pb-16 sm:pb-20">
            {isLoadingPosts ? (
              <div className="text-center text-gray-400 py-6 sm:py-8 text-sm sm:text-base">Loading posts...</div>
            ) : postError ? (
              <div className="text-center text-red-400 py-6 sm:py-8 text-sm sm:text-base">{postError}</div>
            ) : posts.length === 0 ? (
              <div className="text-center text-gray-400 py-6 sm:py-8 text-sm sm:text-base">No posts yet</div>
            ) : posts.map(post => {
              const locked = isPostLocked(post);
              const tierBadge = currentTag || (post.visibility === 'supporters' ? 'Bronze' : null);
              
              return (
                <div key={post.id} className="post bg-[#121212] rounded-lg overflow-hidden shadow-md">
                  <div className="p-4">
                    {/* Post Header - User Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center mr-3">
                          <User className="h-6 w-6 text-gray-400" />
                        </div>
                        <div>
                          <div className="flex items-center">
                            <span className="font-medium text-white text-sm">{post.author_name || authorName}</span>
                            {tierBadge && (
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${tierBadge === 'Gold' ? 'bg-yellow-500 text-yellow-900' : tierBadge === 'Bronze' ? 'bg-amber-700 text-amber-200' : 'bg-gray-700 text-gray-300'}`}>
                                {tierBadge}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">{formatTimeAgo(post.created_at)}</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Post Content */}
                    {!locked ? (
                      <div className="mt-3">
                        {post.title && (
                          <h3 className="font-medium text-white mb-2">{post.title}</h3>
                        )}
                        <p className="text-gray-300 text-sm">{post.content}</p>
                        
                        {/* Display media if available */}
                        {post.media_urls && post.media_urls.length > 0 && (
                          <div className="mt-3">
                            {post.media_urls.slice(0, 1).map((url, index) => (
                              <div key={index} className="relative rounded-md overflow-hidden">
                                <img 
                                  src={url} 
                                  alt={`Media ${index + 1}`} 
                                  className="w-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = 'https://via.placeholder.com/600x400?text=Image+Not+Available';
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-col items-center justify-center py-8">
                        <Lock className="h-6 w-6 text-gray-400 mb-2" />
                        <p className="text-gray-300 text-sm mb-4">This content is locked</p>
                        <button className="bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-full px-6 py-2 transition-colors text-sm">
                          Unlock Content
                        </button>
                      </div>
                    )}
                    
                    {/* Post Footer - Interactions */}
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <button className="flex items-center text-gray-400 hover:text-pink-500">
                          <Heart className="h-5 w-5 mr-1" />
                          <span className="text-sm">0</span>
                        </button>
                        <button className="flex items-center text-gray-400 hover:text-blue-500">
                          <MessageCircle className="h-5 w-5 mr-1" />
                          <span className="text-sm">0</span>
                        </button>
                        <button className="flex items-center text-gray-400 hover:text-green-500">
                          <Share2 className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-xs text-gray-500">
                          {post.visibility === 'public' ? 'Public' : post.visibility === 'supporters' ? 'Supporters Only' : 'Private'}
                        </div>
                        <div className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                          {post.category}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-[#121212] rounded-lg max-w-xs sm:max-w-md w-full p-4 sm:p-5 relative shadow-lg border border-gray-800">
            <button 
              onClick={() => setShowSupportModal(false)} 
              className="absolute top-2 sm:top-3 right-2 sm:right-3 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            
            <h2 className="text-lg sm:text-xl font-bold text-center mb-1 sm:mb-2 text-white">Support {displayName || 'Creator'}</h2>
            <p className="text-gray-300 text-center text-xs sm:text-sm mb-1">Choose your support level and earn exclusive benefits!</p>
            {currentTag && isFollowing ? (
              <p className="text-[10px] sm:text-xs text-center text-pink-500 mb-2 sm:mb-3">Your current tier: {currentTag}</p>
            ) : (
              <p className="text-[10px] sm:text-xs text-center text-gray-400 mb-2 sm:mb-3">No active tier yet</p>
            )}
            
            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-5">
              <div
                className={`bg-[#1a1a1a] hover:bg-[#222] rounded-lg p-2 sm:p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Platinum' ? 'border-pink-500' : 'border-gray-800'}`}
                onClick={() => setSelectedTier('Platinum')}
              >
                <div className="supporter-badge bg-purple-600 text-white rounded-full p-0.5 sm:p-1 mr-2 sm:mr-3">
                  <span className="inline-block w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base font-bold">P</span>
                </div>
                <div>
                  <div className="font-semibold text-white text-xs sm:text-base">Platinum Supporter</div>
                  <div className="text-[10px] sm:text-xs text-gray-400">$20 Platinum Credit</div>
                </div>
              </div>
              
              <div
                className={`bg-[#1a1a1a] hover:bg-[#222] rounded-lg p-2 sm:p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Gold' ? 'border-pink-500' : 'border-gray-800'}`}
                onClick={() => setSelectedTier('Gold')}
              >
                <div className="supporter-badge bg-yellow-500 text-yellow-900 rounded-full p-0.5 sm:p-1 mr-2 sm:mr-3">
                  <span className="inline-block w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base font-bold">G</span>
                </div>
                <div>
                  <div className="font-semibold text-white text-xs sm:text-base">Gold Supporter</div>
                  <div className="text-[10px] sm:text-xs text-gray-400">$10 Gold Credit</div>
                </div>
              </div>
              
              <div
                className={`bg-[#1a1a1a] hover:bg-[#222] rounded-lg p-2 sm:p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Silver' ? 'border-pink-500' : 'border-gray-800'}`}
                onClick={() => setSelectedTier('Silver')}
              >
                <div className="supporter-badge bg-gray-400 text-gray-800 rounded-full p-0.5 sm:p-1 mr-2 sm:mr-3">
                  <span className="inline-block w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base font-bold">S</span>
                </div>
                <div>
                  <div className="font-semibold text-white text-xs sm:text-base">Silver Supporter</div>
                  <div className="text-[10px] sm:text-xs text-gray-400">$5 Silver Credit</div>
                </div>
              </div>
              
              <div
                className={`bg-[#1a1a1a] hover:bg-[#222] rounded-lg p-2 sm:p-3 flex items-center cursor-pointer border transition-colors ${selectedTier === 'Bronze' ? 'border-pink-500' : 'border-gray-800'}`}
                onClick={() => setSelectedTier('Bronze')}
              >
                <div className="supporter-badge bg-amber-700 text-amber-200 rounded-full p-0.5 sm:p-1 mr-2 sm:mr-3">
                  <span className="inline-block w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base font-bold">B</span>
                </div>
                <div>
                  <div className="font-semibold text-white text-xs sm:text-base">Bronze Supporter</div>
                  <div className="text-[10px] sm:text-xs text-gray-400">$3 Bronze Credit</div>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-2 sm:space-x-3">
              <button 
                onClick={() => setShowSupportModal(false)}
                className="w-1/2 py-1.5 sm:py-2 text-center rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors text-xs sm:text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onSupportNow}
                disabled={supportLoading || currentTag === selectedTier}
                className={`w-1/2 py-1.5 sm:py-2 text-center rounded-full text-white font-semibold transition-colors text-xs sm:text-sm ${supportLoading ? 'bg-pink-500/60 cursor-not-allowed' : 'bg-pink-500 hover:bg-pink-600'}`}
              >
                {supportLoading ? 'Processing...' : currentTag === selectedTier ? 'Already on this tier' : 'Support Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast / Snackbar */}
      {toast && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 bg-pink-500 text-white text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-lg z-[100] safe-bottom">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Creator;
