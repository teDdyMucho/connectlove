import React, { useState, useRef, useEffect } from 'react';
import { Heart, Settings, Lock, User, X, Search, Bell, MessageCircle, Share2, Eye, Users, Globe, FileText, Image, Video, Radio } from 'lucide-react';
import './creator.css';
import ProfileDropdown from '../components/ProfileDropdown';
import { useAuth } from '../components/AuthContext';
import handleSupportCreator from './subscriptions';
import { supabase } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import UserImageGallery from '../components/userProfile/userImageGallery';



interface CreatorProps {
  navigateTo?: (page: string) => void;
}

interface PostWithMedia {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  visibility: string;
  created_at: string;
  media_urls: string[];
  author_name?: string;
  author_username?: string;
  author_avatar?: string | null;
  is_locked?: boolean;
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
  const [activeTab, setActiveTab] = useState<'Post' | 'Picture' | 'Videos' | 'Streaming'>('Post');
  const [creatorContentUserId, setCreatorContentUserId] = useState<string | null>(null);
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
      case 'Bronze': return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-500/20';
      case 'Silver': return 'bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-lg shadow-slate-400/20';
      case 'Gold': return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-400/20';
      case 'Platinum': return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20';
      default: return 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/20';
    }
  };

  const VisibilityIcon: React.FC<{ visibility?: string | null }> = ({ visibility }) => {
    const v = (visibility || 'public').toLowerCase();
    const cls = 'inline-block align-middle ml-2 text-gray-300';
    if (v === 'private' || v === 'only me') return <User className={`h-3.5 w-3.5 ${cls}`} />;
    if (v === 'friends' || v === 'supporters' || v === 'friend') return <Users className={`h-3.5 w-3.5 ${cls}`} />;
    return <Globe className={`h-3.5 w-3.5 ${cls}`} />; // public/global
  };

  // Resolve viewer id from localStorage (same strategy as Feed)
  const resolveViewerIdFromStorage = (): string | null => {
    try {
      const ls = window.localStorage;
      const candidates = [
        ls.getItem('current_user_id'),
        ls.getItem('public_id'),
        ls.getItem('user_id'),
        ls.getItem('viewing_user_id'),
      ];
      for (const raw of candidates) {
        const v = raw?.trim();
        if (v && v !== 'null' && v !== 'undefined') return v;
      }
      const rawProfile = ls.getItem('user_profile');
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile) as { id?: string; user_id?: string };
        return parsed?.id || parsed?.user_id || null;
      }
      return null;
    } catch { return null; }
  };

  // Fetch posts for this creator using the RPC so is_locked is accurate
  useEffect(() => {
    const fetchPosts = async () => {
      if (!selectedProfile?.username && !selectedProfile?.name) return;
      setIsLoadingPosts(true);
      setPostError(null);
      try {
        const profileIdentifier = selectedProfile?.username || selectedProfile?.name || '';
        const creatorUserId = await resolveUserId(profileIdentifier);
        if (!creatorUserId) {
          setPostError('Could not identify the creator');
          setIsLoadingPosts(false);
          return;
        }

        // store for use by Picture tab (gallery)
        setCreatorContentUserId(creatorUserId);

        const viewerId = resolveViewerIdFromStorage();
        const { data: rpcData, error: rpcErr } = await supabase.rpc('fetch_feed_posts', {
          viewer_id: viewerId,
          limit_count: 50,
          offset_count: 0,
        });
        if (rpcErr) {
          console.log('[creator] RPC error:', rpcErr);
        }
        type RpcRowMinimal = {
          id: string;
          user_id: string;
          title?: string | null;
          content?: string | null;
          category?: string | null;
          visibility?: string | null;
          created_at?: string | null;
          media_urls?: string[] | null;
          creator_name?: string | null;
          creator_avatar?: string | null;
          is_locked?: boolean | null;
        };
        const rows: RpcRowMinimal[] = Array.isArray(rpcData) ? (rpcData as RpcRowMinimal[]) : [];
        const filtered = rows.filter(r => String(r.user_id) === String(creatorUserId));
        const processed: PostWithMedia[] = filtered.map((r) => ({
          id: String(r.id),
          user_id: String(r.user_id),
          title: String(r.title ?? ''),
          content: String(r.content ?? ''),
          category: String(r.category ?? 'Public'),
          visibility: String(r.visibility ?? 'public'),
          created_at: String(r.created_at ?? new Date().toISOString()),
          media_urls: Array.isArray(r.media_urls) ? r.media_urls : [],
          author_name: selectedProfile?.name || r.creator_name || '',
          author_username: selectedProfile?.username || '',
          author_avatar: r.creator_avatar ?? null,
          is_locked: Boolean(r.is_locked ?? false),
        }));
        setPosts(processed);
      } catch (e) {
        console.error('[creator] fetchPosts exception:', e);
        setPostError('Failed to load posts');
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
  
  // Lock flag from RPC (already computed server-side)
  const isPostLocked = (post: PostWithMedia): boolean => {
    // owner unlock safeguard (if ever needed)
    try {
      const viewer = resolveViewerIdFromStorage();
      if (viewer && viewer === post.user_id) return false;
    } catch { /* ignore */ }
    return Boolean(post.is_locked);
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
        <div className="profile-section md:w-1/3 relative p-4 sm:p-6 md:p-8 flex flex-col items-center bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-pink-500/10 border border-pink-500/20 my-3 sm:my-4 mx-0 sm:mx-2 overflow-y-auto">
        <div className="profile-avatar w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800 mb-4 sm:mb-6 relative shadow-2xl ring-4 ring-pink-500/30 hover:ring-pink-400/50 transition-all">
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <User className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-gradient-to-r from-green-400 to-green-500 rounded-full border-3 border-gray-900 shadow-lg animate-pulse"></div>
          </div>
          
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-1">{displayName || ' '}</h1>
          <p className="text-pink-400 text-sm sm:text-base font-medium mb-2 sm:mb-3">{displayUsername}</p>
          <p className="text-gray-300 text-sm sm:text-base text-center mb-4 sm:mb-6 line-clamp-3 leading-relaxed">{displayBio}</p>
          
          <div className="flex justify-center space-x-6 sm:space-x-8 w-full mb-6 sm:mb-8 bg-gradient-to-r from-gray-800/50 to-gray-700/50 backdrop-blur-sm rounded-2xl p-4 border border-pink-500/20">
            <div className="text-center">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1">{displaySupporters}</div>
              <div className="text-pink-300 text-xs sm:text-sm font-medium">Supporters</div>
            </div>
            <div className="text-center border-x border-pink-500/20 px-6">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1">0</div>
              <div className="text-pink-300 text-xs sm:text-sm font-medium">Posts</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1">{typeof displayRating === 'number' ? displayRating : '-'}</div>
              <div className="text-pink-300 text-xs sm:text-sm font-medium">Rating</div>
            </div>
          </div>
          
          {/* Show only one tier badge for this creator if subscribed AND following */}
          {currentTag && isFollowing ? (
            <div className="supporter-badges flex flex-wrap justify-center gap-3 mb-6 sm:mb-8">
              {(() => {
                const tier = String(currentTag);
                const t = tier.toLowerCase();
                const badge = t.startsWith('p') ? 'P' : t.startsWith('g') ? 'G' : t.startsWith('s') ? 'S' : 'B';
                const cls =
                  badge === 'P' ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30' :
                  badge === 'G' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-400/30' :
                  badge === 'S' ? 'bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-lg shadow-slate-400/30' :
                                  'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-500/30';
                return (
                  <div className={`supporter-badge ${cls} rounded-full p-2 shadow-xl border border-white/20`}>
                    <span className="inline-flex w-8 h-8 sm:w-10 sm:h-10 rounded-full items-center justify-center text-sm sm:text-base font-bold">{badge}</span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="mb-6 sm:mb-8" />
          )}
          
          <button 
            onClick={() => setShowSupportModal(true)}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold rounded-full px-6 sm:px-8 py-3 sm:py-4 flex items-center justify-center transition-all shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 hover:scale-105 mb-4 sm:mb-5 text-sm sm:text-base"
          >
            <Heart className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
            {isFollowing && currentTag ? 'Upgrade Subscription' : 'Support Creator'}
          </button>
          {/* Follow/Unfollow control (independent of subscription tier) */}
          {
            !isFollowing ? (
              <button
                onClick={onFollowNow}
                className="w-full bg-gray-900/50 backdrop-blur-sm border-2 border-pink-500 text-pink-400 hover:bg-pink-500/10 hover:text-pink-300 font-bold rounded-full px-6 sm:px-8 py-3 sm:py-4 flex items-center justify-center transition-all hover:scale-105 mb-4 sm:mb-5 text-sm sm:text-base shadow-lg"
              >
                Follow
              </button>
            ) : (
              <button
                onClick={onUnfollowNow}
                className="w-full bg-gray-900/50 backdrop-blur-sm border-2 border-gray-600 text-gray-300 hover:bg-gray-800/50 hover:text-gray-200 font-medium rounded-full px-6 sm:px-8 py-3 sm:py-4 flex items-center justify-center transition-all hover:scale-105 mb-4 sm:mb-5 text-sm sm:text-base shadow-lg"
              >
                Unfollow
              </button>
            )
          }
          
          <div className="flex justify-center space-x-6 sm:space-x-8 w-full pt-4 sm:pt-6 border-t border-pink-500/20">
            <button className="flex items-center text-gray-300 hover:text-pink-400 text-sm sm:text-base font-medium transition-all hover:scale-105">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
              <span>Settings</span>
            </button>
            <button className="flex items-center text-gray-300 hover:text-pink-400 text-sm sm:text-base font-medium transition-all hover:scale-105">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Privacy</span>
            </button>
          </div>
          {/* Supporter View CTA at bottom */}
          <div className="mt-4 sm:mt-6 w-full">
            <button
              onClick={handleSupporterView}
              className="w-full py-3 sm:py-4 px-6 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-pink-300 hover:text-white flex items-center justify-center space-x-3 transition-all hover:scale-105 border border-pink-500/30 backdrop-blur-sm shadow-lg font-medium"
            >
              <Eye className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="text-sm sm:text-base">Supporter View</span>
            </button>
          </div>
        </div>
        
        {/* Right Content Section */}
        <div className="content-section md:w-2/3 p-3 sm:p-4">

          {/* Icon Navigation Bar */}
          <div className="mb-6 sm:mb-8 flex justify-center">
            <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 rounded-2xl p-3 backdrop-blur-md border border-gray-700/50 shadow-2xl w-full max-w-md">
              <div className="flex space-x-4 justify-between">
                <button
                  className={`flex flex-col items-center justify-center w-20 h-16 rounded-xl transition-all duration-300 ${
                    activeTab === 'Post' 
                      ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30 scale-105' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                  }`}
                  onClick={() => setActiveTab('Post')}
                  title="Posts"
                >
                  <FileText className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">Posts</span>
                </button>
                <button
                  className={`flex flex-col items-center justify-center w-20 h-16 rounded-xl transition-all duration-300 ${
                    activeTab === 'Picture' 
                      ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30 scale-105' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                  }`}
                  onClick={() => setActiveTab('Picture')}
                  title="Pictures"
                >
                  <Image className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">Photos</span>
                </button>
                <button
                  className={`flex flex-col items-center justify-center w-20 h-16 rounded-xl transition-all duration-300 ${
                    activeTab === 'Videos' 
                      ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30 scale-105' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                  }`}
                  onClick={() => setActiveTab('Videos')}
                  title="Videos"
                >
                  <Video className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">Videos</span>
                </button>
                <button
                  className={`flex flex-col items-center justify-center w-20 h-16 rounded-xl transition-all duration-300 ${
                    activeTab === 'Streaming' 
                      ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30 scale-105' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                  }`}
                  onClick={() => setActiveTab('Streaming')}
                  title="Live Streaming"
                >
                  <Radio className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">Live</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'Post' && (
            <div className="posts-feed space-y-6 pb-16 sm:pb-20">
              {isLoadingPosts ? (
                <div className="flex justify-center items-center py-8">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-12 w-12 border-2 border-pink-500/20 border-t-pink-500" />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 animate-pulse" />
                  </div>
                </div>
              ) : postError ? (
                <div className="p-4 bg-red-900/20 backdrop-blur-sm border border-red-500/30 text-red-300 rounded-xl shadow-xl text-center">{postError}</div>
              ) : posts.length === 0 ? (
                <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl text-gray-100 rounded-2xl p-8 text-center border border-pink-500/20 shadow-2xl shadow-pink-500/10">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-2">No posts yet</h3>
                  <p className="text-gray-300 mb-4">Start sharing exclusive content with your subscribers</p>
                  <div className="inline-flex items-center text-sm text-pink-300">
                    <span className="w-2 h-2 bg-pink-400 rounded-full mr-2 animate-pulse"></span>
                    Create your first post
                  </div>
                </div>
              ) : posts.map(post => {
              const locked = isPostLocked(post);
              const tierBadge = normalizeTier(post.category);
              const media = Array.isArray(post.media_urls) ? post.media_urls : [];
              const isVideo = (url: string) => /\.(mp4|webm|ogg)$/i.test(url);

              return (
                <article key={post.id} className="group bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-2xl overflow-hidden border border-pink-500/20 shadow-2xl shadow-pink-500/10 hover:shadow-pink-500/20 transition-all hover:scale-[1.02] animate-in-up">
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center">
                      {post.author_avatar ? (
                        <div className="relative">
                          <img
                            src={post.author_avatar}
                            alt={post.author_name || authorName}
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover mr-3 sm:mr-4 ring-2 ring-pink-500/30 hover:ring-pink-400/50 transition-all"
                            onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.onerror = null; t.src = '/default-avatar.png'; }}
                          />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-green-500 rounded-full border-2 border-gray-900"></div>
                        </div>
                      ) : (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 mr-3 sm:mr-4 flex items-center justify-center text-gray-400 ring-2 ring-gray-600/30">
                          <User className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-base sm:text-lg text-white leading-tight hover:text-pink-300 transition-colors cursor-pointer">
                              {post.author_name || authorName}
                            </h3>
                            <p className="text-xs text-gray-400 flex items-center font-medium">
                              {formatTimeAgo(post.created_at)}
                              <VisibilityIcon visibility={post.visibility} />
                            </p>
                          </div>
                          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${badgeClassForTier(tierBadge)}`}>
                            {tierBadge}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-4 sm:px-6 pb-3 sm:pb-4">
                    {!locked && post.content && (
                      <p className="mb-3 text-sm sm:text-base leading-relaxed text-gray-200">{post.content}</p>
                    )}
                    {locked && (
                      <div className="mb-3 rounded-xl border border-pink-500/30 bg-gradient-to-r from-pink-900/20 to-purple-900/20 backdrop-blur-sm p-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-pink-300">
                          <Lock className="h-5 w-5" />
                          <span className="text-sm font-medium">This post is locked. Subscribe to unlock exclusive content.</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Media + lock overlay */}
                  {media.length > 0 && (
                    <div className="relative w-full overflow-hidden rounded-2xl border border-pink-500/20 mx-4 sm:mx-6 mb-3 sm:mb-4 shadow-xl">
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
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                          <div className="text-center px-4">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
                              <Lock className="h-8 w-8 text-pink-400" />
                            </div>
                            <h4 className="text-lg sm:text-xl font-bold text-white mb-2">Premium Content</h4>
                            <p className="text-sm text-gray-200 mb-4">Subscribe to unlock exclusive content</p>
                            <button className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium px-6 sm:px-8 py-2.5 sm:py-3 text-sm rounded-full transition-all shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40">Subscribe Now</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-4 flex items-center justify-between border-t border-pink-500/20 bg-gradient-to-r from-gray-900/50 to-gray-800/50">
                    <div className="flex items-center space-x-6">
                      <button className="flex items-center text-gray-300 hover:text-pink-400 transition-all hover:scale-105 group" aria-label="Like">
                        <Heart className="h-5 w-5 sm:h-6 sm:w-6 mr-2 group-hover:fill-pink-400" />
                        <span className="text-sm sm:text-base font-medium">0</span>
                      </button>
                      <button className="flex items-center text-gray-300 hover:text-blue-400 transition-all hover:scale-105 group" aria-label="Comment">
                        <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 mr-2 group-hover:fill-blue-400" />
                        <span className="text-sm sm:text-base font-medium">0</span>
                      </button>
                      <button className="flex items-center text-gray-300 hover:text-purple-400 transition-all hover:scale-105 group" aria-label="Share">
                        <Share2 className="h-5 w-5 sm:h-6 sm:w-6 group-hover:scale-110" />
                      </button>
                    </div>
                    <div className="flex items-center">
                      <button className="text-gray-400 hover:text-pink-400 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </article>
              );
              })}
            </div>
          )}

          {activeTab === 'Picture' && (
            <div className="pb-16 sm:pb-20 max-h-[calc(100vh-200px)] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#ff3d6e #374151' }}>
              <UserImageGallery userId={creatorContentUserId || undefined} />
            </div>
          )}

          {activeTab === 'Videos' && (
            <div className="text-center text-gray-400 py-6 sm:py-8 text-sm sm:text-base">
              Videos coming soon.
            </div>
          )}

          {activeTab === 'Streaming' && (
            <div className="text-center text-gray-400 py-6 sm:py-8 text-sm sm:text-base">
              Streaming coming soon.
            </div>
          )}

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
                  <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full items-center justify-center text-xs sm:text-base font-bold">P</span>
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
                  <span className="inline-flex w-6 h-6 sm:w-8 sm:h-8 rounded-full items-center justify-center text-xs sm:text-base font-bold">G</span>
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
                  <span className="inline-flex w-6 h-6 sm:w-8 sm:h-8 rounded-full items-center justify-center text-xs sm:text-base font-bold">S</span>
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
                  <span className="inline-flex w-6 h-6 sm:w-8 sm:h-8 rounded-full items-center justify-center text-xs sm:text-base font-bold">B</span>
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
