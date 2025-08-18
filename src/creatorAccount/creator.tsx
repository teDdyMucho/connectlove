import React, { useState, useRef, useEffect } from 'react';
import { Heart, Settings, Lock, User, X, Search, Bell } from 'lucide-react';
import './creator.css';
import ProfileDropdown from '../components/ProfileDropdown';
import { useAuth } from '../components/AuthContext';
import handleSupportCreator from './subscriptions';
import { supabase } from '../lib/supabaseClient';



interface CreatorProps {
  navigateTo?: (page: string) => void;
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

  // Posts: real data not wired yet; show empty state instead of mock
  const posts: Array<{ id: number; author: string; timeAgo?: string; content?: string; likes?: number; locked?: boolean }> = [];

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
          
          <h1 className="text-xl font-bold text-center text-gray-800">{displayName || ' '}</h1>
          <p className="text-primary text-sm mb-2">{displayUsername}</p>
          <p className="text-gray-600 text-sm text-center mb-4">{displayBio}</p>
          
          <div className="flex justify-center space-x-6 w-full mb-6">
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{displaySupporters}</div>
              <div className="text-gray-500 text-xs">Supporters</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">0</div>
              <div className="text-gray-500 text-xs">Posts</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">{typeof displayRating === 'number' ? displayRating : '-'}</div>
              <div className="text-gray-500 text-xs">Rating</div>
            </div>
          </div>
          
          {/* Show only one tier badge for this creator if subscribed AND following */}
          {currentTag && isFollowing ? (
            <div className="supporter-badges flex flex-wrap justify-center gap-2 mb-6">
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
                    <span className="inline-block w-6 h-6 rounded-full flex items-center justify-center font-bold">{badge}</span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="mb-6" />
          )}
          
          <button 
            onClick={() => setShowSupportModal(true)}
            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold rounded-full px-6 py-2 flex items-center justify-center transition-colors mb-4"
          >
            <Heart className="h-4 w-4 mr-2" />
            {isFollowing && currentTag ? 'Upgrade Subscription' : 'Support Creator'}
          </button>
          {/* Follow/Unfollow control (independent of subscription tier) */}
          {
            !isFollowing ? (
              <button
                onClick={onFollowNow}
                className="w-full bg-white border border-primary text-primary hover:bg-primary/5 font-semibold rounded-full px-6 py-2 flex items-center justify-center transition-colors mb-4"
              >
                Follow
              </button>
            ) : (
              <button
                onClick={onUnfollowNow}
                className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-full px-6 py-2 flex items-center justify-center transition-colors mb-4"
              >
                Unfollow
              </button>
            )
          }
          
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
            {posts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No posts yet</div>
            ) : posts.map(post => (
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
            
            <h2 className="text-xl font-bold text-center mb-2 text-gray-800">Support {displayName || 'Creator'}</h2>
            <p className="text-gray-600 text-center text-sm mb-1">Choose your support level and earn exclusive benefits!</p>
            {currentTag && isFollowing ? (
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

      {/* Toast / Snackbar */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-[100]">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Creator;
