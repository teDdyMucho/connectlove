import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, MessageSquare, Share2, Lock, Users, Globe, User as UserIcon } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from './AuthContext';

type Tier = 'Public' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

type RawRpcRow = {
  id: string;
  user_id: string;
  name: string;
  title: string;
  content: string;
  category: string;
  visibility: string;
  created_at: string;
  media_urls: string[];
  creator_name: string;
  creator_avatar: string;
  creator_category: string;
  likes_count: number;
  comments_count: number;
  is_locked: boolean;
};

// Visibility icon beside timestamp
const VisibilityIcon: React.FC<{ visibility?: string | null }> = ({ visibility }) => {
  const v = (visibility || 'public').toLowerCase();
  const cls = 'inline-block align-middle ml-2 text-gray-300';
  if (v === 'private' || v === 'only me') return <UserIcon className={`h-3.5 w-3.5 ${cls}`} />;
  if (v === 'friends' || v === 'supporters' || v === 'friend') return <Users className={`h-3.5 w-3.5 ${cls}`} />;
  return <Globe className={`h-3.5 w-3.5 ${cls}`} />;
};

interface FeedPost {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: Tier;
  visibility: string;
  createdAt: string;
  media: string[];
  authorName: string;
  authorAvatar: string;
  authorCategory: string;
  likesCount: number;
  commentsCount: number;
  isLocked: boolean;
}

interface FeedProps {
  navigateTo?: (page: string) => void;
  refreshSignal?: number; // bump this to force a refresh
}

const LIMIT = 10;

// -----------------------------------------------------------------------------
// Tier helpers
// -----------------------------------------------------------------------------
const normalizeTier = (v?: string | null): Tier => {
  if (!v) return 'Public';
  const t = String(v).trim();
  if (['Bronze', 'Silver', 'Gold', 'Platinum'].includes(t)) return t as Tier;
  return 'Public';
};

const badgeClassForTier = (tier?: string | null) => {
  const t = normalizeTier(tier);
  switch (t) {
    case 'Bronze':
      return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-500/20';
    case 'Silver':
      return 'bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-lg shadow-slate-400/20';
    case 'Gold':
      return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-black shadow-lg shadow-yellow-400/20';
    case 'Platinum':
      return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20';
    default:
      return 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/20'; // Public
  }
};

// -----------------------------------------------------------------------------
// Viewer resolution – SINGLE source of truth (custom login via localStorage)
// -----------------------------------------------------------------------------

const resolveViewerIdFromStorage = (): string | null => {
  if (typeof window === 'undefined') return null;

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
      if (v && v !== 'null' && v !== 'undefined') {
        return v;
      }
    }

    // Fallback: stored profile object
    const rawProfile = ls.getItem('user_profile');
    if (rawProfile) {
      try {
        const parsed = JSON.parse(rawProfile) as { id?: string; user_id?: string };
        if (parsed?.id) return String(parsed.id);
        if (parsed?.user_id) return String(parsed.user_id);
      } catch {
        /* ignore */
      }
    }
  } catch {
    // ignore
  }

  return null;
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const Feed: React.FC<FeedProps> = ({ navigateTo, refreshSignal }) => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<boolean>(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const viewerIdRef = useRef<string | null>(null);

  const { setSelectedProfile } = useAuth();

  // Resolve viewer once on mount
  useEffect(() => {
    const id = resolveViewerIdFromStorage();
    viewerIdRef.current = id;
    console.log('[FEED] viewer resolved from localStorage:', id);
  }, []);

  // IntersectionObserver for infinite scroll
  const lastPostElementRef = useCallback(
    (node: HTMLElement | null) => {
      if (fetchingRef.current) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) {
            setOffset((prev) => prev + LIMIT);
          }
        },
        { rootMargin: '200px' },
      );
      if (node) observer.current.observe(node);
    },
    [hasMore],
  );

  // Normalize rows coming from RPC into FeedPost
  const normalizeRow = (r: RawRpcRow): FeedPost => {
    const id = String(r?.id ?? '');
    const createdAt = r?.created_at ?? new Date().toISOString();
    const authorName = r?.creator_name || r?.name || 'Unknown';
    const authorAvatar = r?.creator_avatar || '';
    const category = normalizeTier(r?.category ?? 'Public');
    const visibility = r?.visibility ?? 'public';
    const media = Array.isArray(r?.media_urls) ? r.media_urls : [];

    return {
      id,
      userId: String(r?.user_id ?? ''),
      title: String(r?.title ?? ''),
      content: String(r?.content ?? ''),
      category,
      visibility,
      createdAt,
      media,
      authorName,
      authorAvatar,
      authorCategory: r?.creator_category ?? 'User',
      likesCount: Number(r?.likes_count ?? 0),
      commentsCount: Number(r?.comments_count ?? 0),
      isLocked: Boolean(r?.is_locked ?? false),
    };
  };

  // Trust RPC is_locked; only enforce owner-unlock on the client as a safeguard
  const computeLockMap = useCallback(async (rows: FeedPost[], viewerId: string | null) => {
    if (!rows.length) return rows;
    return rows.map((p) =>
      viewerId && p.userId && p.userId === viewerId ? { ...p, isLocked: false } : p,
    );
  }, []);

  const fetchPosts = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setError(null);

    try {
      setLoading(true);

      // Always resolve viewer from localStorage (custom auth)
      const viewerId = resolveViewerIdFromStorage();
      viewerIdRef.current = viewerId || null;
      console.log('[FEED] Viewer ID:', viewerId);

      // RPC call
      let rows: RawRpcRow[] = [];
      try {
        const rpcRes = await supabase.rpc('fetch_feed_posts', {
          viewer_id: viewerId,
          limit_count: LIMIT,
          offset_count: offset,
        });

        if (rpcRes.error) {
          console.log('[FEED] RPC fetch_feed_posts error:', rpcRes.error);
        }

        rows = Array.isArray(rpcRes.data) ? (rpcRes.data as RawRpcRow[]) : [];
        console.log('[FEED] RPC rows:', rows?.length ?? 0);
      } catch (e) {
        console.log('[FEED] RPC fetch_feed_posts exception:', e);
        rows = [];
      }

      // End-of-feed handling
      if (!rows || rows.length === 0) {
        setHasMore(false);
        return;
      }

      // Normalize + compute lock state
      const normalized = rows.map(normalizeRow);
      console.log('[FEED] normalized len:', normalized.length, normalized[0]);
      const computed = await computeLockMap(normalized, viewerId || null);
      console.log('[FEED] computed len:', computed.length, computed[0]);

      // Merge & de-duplicate
      setPosts((prev) => {
        console.log('[FEED] merge prev:', prev.length, 'new:', computed.length);
        const map = new Map<string, FeedPost>();
        prev.forEach((p) => map.set(p.id, p));
        computed.forEach((p) => map.set(p.id, p));
        const merged = Array.from(map.values());
        seenIdsRef.current = new Set(merged.map((p) => p.id));
        console.log('[FEED] merged len:', merged.length);
        return merged;
      });

      setHasMore(rows.length === LIMIT);
    } catch (err) {
      console.error('[FEED] exception:', err);
      setError('Failed to load posts. Try again later.');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [offset, computeLockMap]);

  // Fetch on mount + when offset changes
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Handle explicit refresh (e.g., after posting)
  useEffect(() => {
    if (typeof refreshSignal === 'number') {
      seenIdsRef.current = new Set();
      setPosts([]);
      setHasMore(true);
      if (offset !== 0) {
        setOffset(0);
      } else {
        fetchPosts();
      }
    }
  }, [refreshSignal, fetchPosts, offset]);

  const formatTimeAgo = useCallback((dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'some time ago';
    }
  }, []);

  const handleCreatorClick = useCallback(
    async (creatorName: string, creatorAvatar?: string) => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, username, full_name, avatar_url, user_type')
          .or(`full_name.eq.${creatorName},username.eq.${creatorName}`)
          .limit(1);

        const row = Array.isArray(data) && data.length ? data[0] : null;

        const profile = row
          ? {
              name: row.full_name || row.username || creatorName,
              username: row.username || row.id,
              avatar: row.avatar_url || creatorAvatar || 'https://i.pravatar.cc/150',
              category: row.user_type || 'User',
            }
          : {
              name: creatorName,
              username: creatorName,
              avatar: creatorAvatar || 'https://i.pravatar.cc/150',
              category: 'User',
            };

        setSelectedProfile?.({
          name: profile.name,
          username: profile.username,
          avatar: profile.avatar,
        });

        try {
          window.history.pushState({}, '', `/profile/${encodeURIComponent(profile.username || profile.name)}`);
        } catch {
          /* noop */
        }

        if (navigateTo) navigateTo('creator');
      } catch (e) {
        console.warn('[FEED] handleCreatorClick failed', e);
        if (navigateTo) navigateTo('creator');
      }
    },
    [navigateTo, setSelectedProfile],
  );

  const renderMedia = useCallback((media: string[], locked: boolean = false) => {
    if (!media || media.length === 0) return null;

    const isVideo = (url: string) => /\.(mp4|webm|ogg)$/i.test(url);

    if (media.length === 1) {
      const url = media[0];
      if (isVideo(url)) {
        return (
          <div className="relative w-full overflow-hidden">
            <video
              src={url}
              className={`w-full h-auto max-h-[400px] object-cover ${
                locked ? 'blur-xl pointer-events-none select-none' : ''
              }`}
              controls
              preload="metadata"
            />
          </div>
        );
      }
      return (
        <div className="relative w-full overflow-hidden">
          <img
            src={url}
            alt="Post content"
            className={`w-full h-auto max-h-[400px] object-cover ${
              locked ? 'blur-xl pointer-events-none select-none' : ''
            }`}
            loading="lazy"
          />
        </div>
      );
    }

    return (
      <div className="w-full overflow-hidden">
        <div
          className={`grid gap-1 ${
            media.length === 2 ? 'grid-cols-2' : media.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'
          }`}
        >
          {media.slice(0, 6).map((url, index) => {
            if (isVideo(url)) {
              return (
                <div key={index} className="relative aspect-square overflow-hidden">
                  <video
                    src={url}
                    className={`w-full h-full object-cover ${
                      locked ? 'blur-xl pointer-events-none select-none' : ''
                    }`}
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg
                      className="w-10 h-10 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              );
            }
            return (
              <div key={index} className="relative aspect-square overflow-hidden">
                <img
                  src={url}
                  alt={`Media ${index + 1}`}
                  className={`w-full h-full object-cover ${
                    locked ? 'blur-xl pointer-events-none select-none' : ''
                  }`}
                  loading="lazy"
                />
                {index === 5 && media.length > 6 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-xl">
                    +{media.length - 6}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 backdrop-blur-sm border border-red-500/30 text-red-300 rounded-xl shadow-xl">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {posts.length === 0 && !loading ? (
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl text-gray-100 rounded-2xl p-8 text-center border border-pink-500/20 shadow-2xl shadow-pink-500/10">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-2">No posts yet</h3>
          <p className="text-gray-300 mb-4">Follow creators to see their exclusive content</p>
          <div className="inline-flex items-center text-sm text-pink-300">
            <span className="w-2 h-2 bg-pink-400 rounded-full mr-2 animate-pulse"></span>
            Start discovering amazing creators
          </div>
        </div>
      ) : (
        posts.map((post, idx) => (
          <article
            key={post.id}
            ref={idx === posts.length - 1 ? lastPostElementRef : undefined}
            className="group bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl text-gray-100 rounded-2xl overflow-hidden border border-pink-500/20 shadow-2xl shadow-pink-500/10 hover:shadow-pink-500/20 transition-all hover:scale-[1.02] animate-in-up"
            style={{ animationDelay: `${idx * 60}ms` }}
            aria-posinset={idx + 1}
            aria-setsize={posts.length}
            aria-roledescription="Post"
          >
            <div className="p-4 sm:p-6">
              <div className="flex items-center">
                {post.authorAvatar ? (
                  <div className="relative">
                    <img
                      src={post.authorAvatar}
                      alt={post.authorName}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover mr-3 sm:mr-4 cursor-pointer ring-2 ring-pink-500/30 hover:ring-pink-400/50 transition-all"
                      onError={(e) => { const t = e.currentTarget; t.onerror = null; t.src = '/default-avatar.png'; }}
                      onClick={() => handleCreatorClick(post.authorName, post.authorAvatar)}
                    />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-green-500 rounded-full border-2 border-gray-900"></div>
                  </div>
                ) : (
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 mr-3 sm:mr-4 flex items-center justify-center text-gray-400 cursor-default ring-2 ring-gray-600/30">
                    <UserIcon className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3
                        className="font-bold text-base sm:text-lg leading-tight cursor-pointer hover:text-pink-300 transition-colors text-white"
                        onClick={() => handleCreatorClick(post.authorName, post.authorAvatar)}
                        title={`View ${post.authorName}'s profile`}
                      >
                        {post.authorName || 'Unknown'}
                      </h3>
                      <p className="text-xs text-gray-400 flex items-center font-medium">
                        {formatTimeAgo(post.createdAt)}
                        <VisibilityIcon visibility={post.visibility} />
                      </p>
                    </div>
                    <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${badgeClassForTier(post.category)}`}>
                      {post.category ?? 'Public'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-4 sm:px-6 pb-3 sm:pb-4">
              {!post.isLocked && post.content && (
                <p className="mb-3 text-sm sm:text-base leading-relaxed text-gray-200">
                  {post.content}
                </p>
              )}
              {post.isLocked && (
                <div className="mb-3 rounded-xl border border-pink-500/30 bg-gradient-to-r from-pink-900/20 to-purple-900/20 backdrop-blur-sm p-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-pink-300">
                    <Lock className="h-5 w-5" />
                    <span className="text-sm font-medium">This post is locked. Subscribe to unlock exclusive content.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Media + lock overlay */}
            {post.media && post.media.length > 0 && (
              <div className="relative w-full overflow-hidden rounded-2xl border border-pink-500/20 mx-4 sm:mx-6 mb-3 sm:mb-4 shadow-xl">
                {renderMedia(post.media, post.isLocked)}
                {post.isLocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-center px-4">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
                        <Lock className="h-8 w-8 text-pink-400" />
                      </div>
                      <h4 className="text-lg sm:text-xl font-bold text-white mb-2">
                        Premium Content
                      </h4>
                      <p className="text-sm text-gray-200 mb-4">
                        Subscribe to unlock exclusive content
                      </p>
                      <button className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium px-6 sm:px-8 py-2.5 sm:py-3 text-sm rounded-full transition-all shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40">
                        Subscribe Now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-4 flex items-center justify-between border-t border-pink-500/20 bg-gradient-to-r from-gray-900/50 to-gray-800/50">
              <div className="flex items-center space-x-6">
                <button
                  className="flex items-center text-gray-300 hover:text-pink-400 transition-all hover:scale-105 group"
                  aria-label="Like"
                >
                  <Heart className="h-5 w-5 sm:h-6 sm:w-6 mr-2 group-hover:fill-pink-400" />
                  <span className="text-sm sm:text-base font-medium">{post.likesCount || 0}</span>
                </button>
                <button
                  className="flex items-center text-gray-300 hover:text-blue-400 transition-all hover:scale-105 group"
                  aria-label="Comment"
                >
                  <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 mr-2 group-hover:fill-blue-400" />
                  <span className="text-sm sm:text-base font-medium">{post.commentsCount || 0}</span>
                </button>
                <button
                  className="flex items-center text-gray-300 hover:text-purple-400 transition-all hover:scale-105 group"
                  aria-label="Share"
                >
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
        ))
      )}

      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-pink-500/20 border-t-pink-500" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Feed;
