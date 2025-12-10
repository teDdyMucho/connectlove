import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, MessageSquare, Share2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from './AuthContext';

type Tier = 'Public' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

type RawRpcRow = {
  id?: string;
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
  creator_category?: string | null;
  category?: string | null;
  visibility?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  is_locked?: boolean | null;
  user_id?: string | null; // post owner
  creator_id?: string | null;
  author_id?: string | null;
  owner_id?: string | null;
};

interface FeedPost {
  id: string;
  title: string;
  content: string;
  media_urls: string[] | null;
  created_at: string;
  creator_name: string;
  creator_avatar: string;
  creator_category?: string;
  category?: Tier;
  visibility?: 'public' | 'friends' | 'private' | string;
  likes_count: number;
  comments_count: number;
  is_locked: boolean;
  creator_id?: string;
  user_id?: string; // owner id
}

interface FeedProps {
  navigateTo?: (page: string) => void;
  refreshSignal?: number; // bump this to force a refresh
}

const LIMIT = 10;

// Tier precedence helper
const tierPrecedence: Record<Tier, number> = {
  Public: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
};

// Map tier strings to Tier type safely
const normalizeTier = (v?: string | null): Tier => {
  if (!v) return 'Public';
  const t = String(v).trim();
  if (['Bronze', 'Silver', 'Gold', 'Platinum'].includes(t)) return t as Tier;
  return 'Public';
};

const badgeClassForTier = (tier?: string | null) => {
  const t = normalizeTier(tier);
  switch (t) {
    case 'Bronze': return 'bg-amber-700 text-white';
    case 'Silver': return 'bg-slate-400 text-black';
    case 'Gold': return 'bg-yellow-500 text-black';
    case 'Platinum': return 'bg-blue-600 text-white';
    default: return 'bg-green-600 text-white'; // Public
  }
};

const Feed: React.FC<FeedProps> = ({ navigateTo, refreshSignal }) => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<boolean>(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const { setSelectedProfile } = useAuth();

  // IntersectionObserver for infinite scroll
  const lastPostElementRef = useCallback((node: HTMLElement | null) => {
    if (fetchingRef.current) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setOffset(prev => prev + LIMIT);
      }
    }, { rootMargin: '200px' });
    if (node) observer.current.observe(node);
  }, [hasMore]);

  // Normalize rows coming from RPC / fallback queries into FeedPost
  const normalizeRow = (r: RawRpcRow): FeedPost => {
    const id = String(r.id ?? '');
    const created_at = r.created_at ?? new Date().toISOString();
    const creator_name = r.creator_name || r.author_name || r.full_name || r.username || (r as any).name || 'Unknown';
    const creator_avatar = r.creator_avatar || r.avatar_url || '';
    const category = r.category ? normalizeTier(r.category) : (r.creator_category ? normalizeTier(r.creator_category) : 'Public');
    const visibility = (r.visibility as any) || 'public';
    return {
      id,
      title: String(r.title ?? ''),
      content: String(r.content ?? ''),
      media_urls: Array.isArray(r.media_urls) ? r.media_urls : null,
      created_at,
      creator_name,
      creator_avatar,
      creator_category: r.creator_category ?? undefined,
      category,
      visibility,
      likes_count: Number(r.likes_count ?? 0),
      comments_count: Number(r.comments_count ?? 0),
      is_locked: Boolean(r.is_locked ?? false), // may be corrected later
      creator_id: r.creator_id || r.user_id || r.author_id || r.owner_id || undefined,
      user_id: r.user_id || undefined,
    };
  };

  // Compute locking when we don't have is_locked from RPC
  const computeLockMap = useCallback(async (rows: FeedPost[], viewerId: string | null) => {
    // If all posts already have is_locked provided, return as-is
    const needsCompute = rows.some(r => r.is_locked === undefined || r.is_locked === null);
    if (!needsCompute && viewerId) return rows;

    // Build set of unique creator ids and their required category
    const creators: Record<string, Tier> = {};
    for (const p of rows) {
      const cid = p.creator_id;
      if (!cid) continue;
      // store highest required tier if multiple posts differ
      const current = creators[cid];
      const needed = p.category ?? 'Public';
      if (!current || tierPrecedence[needed] > tierPrecedence[current]) creators[cid] = needed;
    }

    // If no viewerId or no creators, compute simple rules
    if (!viewerId || Object.keys(creators).length === 0) {
      return rows.map(p => {
        // owner never locked (if viewerId not provided we can't check ownership)
        if (!viewerId) {
          // conservatively: Public -> unlocked, others locked
          return { ...p, is_locked: Boolean(p.category && p.category !== 'Public') };
        }
        return { ...p, is_locked: Boolean(p.category && p.category !== 'Public') };
      });
    }

    // Fetch supports for this viewer against creators in batch
    const creatorIds = Object.keys(creators);
    try {
      const { data: supportsData, error: supportsError } = await supabase
        .from('supports')
        .select('creator_id, supporter_id, tier')
        .eq('supporter_id', viewerId)
        .in('creator_id', creatorIds);

      if (supportsError) {
        console.warn('[feed] supports fetch error:', supportsError);
      }

      const supportMap = new Map<string, string>();
      if (Array.isArray(supportsData)) {
        for (const s of supportsData as any[]) {
          if (s.creator_id && s.tier) supportMap.set(s.creator_id, s.tier);
        }
      }

      // Now compute each post's locked state deterministically
      const computed = rows.map(p => {
        // owner always unlocked
        if (p.creator_id && p.creator_id === viewerId) return { ...p, is_locked: false };

        // Public is unlocked
        if (!p.category || p.category === 'Public') return { ...p, is_locked: false };

        // If viewer supports creator, check tier precedence
        const required = p.category ?? 'Public';
        const supportedTier = p.creator_id ? supportMap.get(p.creator_id) : undefined;
        if (supportedTier) {
          const supT = normalizeTier(supportedTier);
          const ok = tierPrecedence[supT] >= tierPrecedence[required];
          return { ...p, is_locked: !ok };
        }

        // Otherwise locked
        return { ...p, is_locked: true };
      });

      return computed;
    } catch (e) {
      console.warn('[feed] failed to compute locks, defaulting conservatively', e);
      return rows.map(p => ({ ...p, is_locked: Boolean(p.category && p.category !== 'Public') }));
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setError(null);
    try {
      setLoading(true);

      // Get viewer id from supabase auth
      const { data: { user } } = await supabase.auth.getUser();
      const viewerId = user?.id ?? null;

      // Try primary RPC (try get_feed_posts then fetch_feed_posts if needed)
      let rpcRows: RawRpcRow[] = [];
      const rpcCandidates = ['get_feed_posts', 'fetch_feed_posts'];

      for (const rpcName of rpcCandidates) {
        try {
          const rpcRes = await supabase.rpc(rpcName, {
            viewer_id: viewerId,
            limit_count: LIMIT,
            offset_count: offset,
          });
          // rpcRes may have shape { data, error }
          if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
            rpcRows = rpcRes.data as RawRpcRow[];
            break;
          }
        } catch (e) {
          // try next
          console.warn(`[feed] rpc ${rpcName} failed, trying fallback`, e);
        }
      }

      // If RPC returned nothing, fallback to more complete posts query
      let rows: RawRpcRow[] = [];
      if (rpcRows.length > 0) {
        rows = rpcRows;
      } else {
        // attempt to fetch more fields from posts + post_with_media + users where possible
        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select(`
            id,
            user_id,
            title,
            content,
            category,
            visibility,
            created_at,
            -- post_with_media may be a view, attempt safe join-like select if available (supabase allows selecting related)
            post_with_media ( media_urls ),
            users ( id, full_name, username, avatar_url, user_type )
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + LIMIT - 1);

        if (postsError) {
          console.error('[feed] posts fallback error:', postsError);
          setError(postsError.message || 'Failed to fetch posts');
          setLoading(false);
          fetchingRef.current = false;
          return;
        }

        // Normalize joined shape to RawRpcRow
        rows = (Array.isArray(postsData) ? postsData : []).map((p: any) => {
          return {
            id: p.id,
            title: p.title,
            content: p.content,
            category: p.category,
            visibility: p.visibility,
            created_at: p.created_at,
            media_urls: p.post_with_media?.media_urls ?? null,
            creator_name: (p.users && (p.users.full_name || p.users.username)) || '',
            creator_avatar: p.users?.avatar_url ?? '',
            creator_category: p.users?.user_type ?? null,
            user_id: p.user_id,
          } as RawRpcRow;
        });
      }

      // If nothing returned: signal end of feed
      if (!rows || rows.length === 0) {
        setHasMore(false);
        return;
      }

      // Normalize
      const normalized = rows.map(normalizeRow);

      // Resolve missing creator fields by batch user fetch
      const needResolve = normalized.filter(p => (!p.creator_name || !p.creator_avatar || !p.creator_category) && p.creator_id);
      const idsToResolve = Array.from(new Set(needResolve.map(x => x.creator_id!).filter(Boolean)));
      if (idsToResolve.length > 0) {
        try {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, full_name, username, avatar_url, user_type')
            .in('id', idsToResolve);
          const users = Array.isArray(usersData) ? usersData : [];
          const uMap = new Map<string, any>();
          users.forEach(u => { if (u.id) uMap.set(u.id, u); });
          for (const p of normalized) {
            if (p.creator_id && uMap.has(p.creator_id)) {
              const u = uMap.get(p.creator_id);
              if (!p.creator_name) p.creator_name = u.full_name || u.username || p.creator_name;
              if (!p.creator_avatar) p.creator_avatar = u.avatar_url || p.creator_avatar;
              if (!p.creator_category) p.creator_category = u.user_type || p.creator_category;
            }
          }
        } catch (e) {
          console.warn('[feed] failed to resolve users batch', e);
        }
      }

      // If RPC didn't provide is_locked, compute it using supports table
      const computed = await computeLockMap(normalized, viewerId);

      // Dedupe + merge into state
      setPosts(prev => {
        const merged: FeedPost[] = [];
        const localSeen = new Set<string>(seenIdsRef.current);
        // keep existing prev in order
        for (const p of prev) {
          if (!localSeen.has(p.id)) {
            localSeen.add(p.id);
            merged.push(p);
          }
        }
        // append new unique posts in order
        for (const p of computed) {
          if (!localSeen.has(p.id)) {
            localSeen.add(p.id);
            merged.push(p);
          }
        }
        seenIdsRef.current = localSeen;
        return merged;
      });

      // set hasMore flag
      setHasMore(rows.length === LIMIT);
    } catch (err) {
      console.error('[feed] exception:', err);
      setError('Failed to load posts. Try again later.');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [offset, computeLockMap]);

  // Fetch on mount and when offset changes
  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPosts]);

  // Refresh signal handling
  useEffect(() => {
    if (typeof refreshSignal === 'number') {
      seenIdsRef.current = new Set();
      setPosts([]);
      setHasMore(true);
      if (offset !== 0) {
        setOffset(0);
      } else {
        // immediate fetch
        fetchPosts();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const formatTimeAgo = useCallback((dateString: string) => {
    try { return formatDistanceToNow(new Date(dateString), { addSuffix: true }); }
    catch { return 'some time ago'; }
  }, []);

  const handleCreatorClick = useCallback(async (creatorName: string, creatorAvatar?: string) => {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url, user_type')
        .or(`full_name.eq.${creatorName},username.eq.${creatorName}`)
        .limit(1);
      const row = Array.isArray(data) && data.length ? data[0] : null;
      const profile = row
        ? { name: row.full_name || row.username || creatorName, username: row.username || row.id, avatar: row.avatar_url || creatorAvatar || 'https://i.pravatar.cc/150', category: row.user_type || 'User' }
        : { name: creatorName, username: creatorName, avatar: creatorAvatar || 'https://i.pravatar.cc/150', category: 'User' };
      setSelectedProfile?.({ name: profile.name, username: profile.username, avatar: profile.avatar });
      try { window.history.pushState({}, '', `/profile/${encodeURIComponent(profile.username || profile.name)}`); } catch { /* noop */ }
      if (navigateTo) navigateTo('creator');
    } catch (e) {
      console.warn('[feed] handleCreatorClick failed', e);
      if (navigateTo) navigateTo('creator');
    }
  }, [navigateTo, setSelectedProfile]);

  const renderMedia = useCallback((mediaUrls: string[] | null, locked: boolean = false) => {
    if (!mediaUrls || mediaUrls.length === 0) return null;
    const isVideo = (url: string) => /\.(mp4|webm|ogg)$/i.test(url);

    if (mediaUrls.length === 1) {
      const url = mediaUrls[0];
      if (isVideo(url)) {
        return (
          <div className="relative w-full overflow-hidden">
            <video src={url} className={`w-full h-auto max-h-[400px] object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} controls preload="metadata" />
          </div>
        );
      } else {
        return (
          <div className="relative w-full overflow-hidden">
            <img src={url} alt="Post content" className={`w-full h-auto max-h-[400px] object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} loading="lazy" />
          </div>
        );
      }
    }

    return (
      <div className="w-full overflow-hidden">
        <div className={`grid gap-1 ${mediaUrls.length === 2 ? 'grid-cols-2' : mediaUrls.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {mediaUrls.slice(0, 6).map((url, index) => {
            if (isVideo(url)) {
              return (
                <div key={index} className="relative aspect-square overflow-hidden">
                  <video src={url} className={`w-full h-full object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" /></svg>
                  </div>
                </div>
              );
            } else {
              return (
                <div key={index} className="relative aspect-square overflow-hidden">
                  <img src={url} alt={`Media ${index + 1}`} className={`w-full h-full object-cover ${locked ? 'blur-xl pointer-events-none select-none' : ''}`} loading="lazy" />
                  {index === 5 && mediaUrls.length > 6 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-xl">+{mediaUrls.length - 6}</div>
                  )}
                </div>
              );
            }
          })}
        </div>
      </div>
    );
  }, []);

  if (error) {
    return <div className="p-4 bg-red-50 text-red-600 rounded-lg"><p>{error}</p></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {posts.length === 0 && !loading ? (
        <div className="bg-surface text-gray-100 rounded-lg sm:rounded-xl p-6 text-center border border-slate-700 shadow-sm">
          <div className="text-gray-400 mb-3">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <h3 className="text-lg font-medium text-gray-100 mb-1">No posts yet</h3>
          <p className="text-gray-400">Follow creators to see their updates.</p>
        </div>
      ) : (
        posts.map((post, idx) => (
          <article
            key={post.id}
            ref={idx === posts.length - 1 ? lastPostElementRef : undefined}
            className="group bg-surface text-gray-100 rounded-lg sm:rounded-xl overflow-hidden border border-soft shadow-sm card-hover animate-in-up"
            style={{ animationDelay: `${idx * 60}ms` }}
            aria-posinset={idx + 1}
            aria-setsize={posts.length}
            aria-roledescription="Post"
          >
            <div className="p-3 sm:p-4">
              <div className="flex items-center">
                <img
                  src={post.creator_avatar || 'https://via.placeholder.com/40'}
                  alt={post.creator_name}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover mr-2 sm:mr-3 cursor-pointer"
                  onClick={() => handleCreatorClick(post.creator_name, post.creator_avatar)}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3
                        className="font-medium text-sm sm:text-base leading-tight cursor-pointer hover:underline text-gray-100"
                        onClick={() => handleCreatorClick(post.creator_name, post.creator_avatar)}
                        title={`View ${post.creator_name}'s profile`}
                      >
                        {post.creator_name || 'Unknown'}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {formatTimeAgo(post.created_at)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${badgeClassForTier(post.category)}`}>
                      {post.category ?? 'Public'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-3 sm:px-4 pb-2 sm:pb-3">
              {post.content && <p className="mb-2 text-sm sm:text-base leading-relaxed text-gray-200">{post.content}</p>}
            </div>

            {/* Media + lock overlay */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className="relative w-full overflow-hidden rounded-xl border border-soft mx-3 sm:mx-4 mb-2 sm:mb-3">
                {renderMedia(post.media_urls, post.is_locked)}
                {post.is_locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="text-center px-4">
                      <Lock className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-1 sm:mb-2 text-white" />
                      <h4 className="text-base sm:text-lg font-medium text-white mb-1">Content Locked</h4>
                      <p className="text-xs sm:text-sm text-gray-200 mb-3 sm:mb-4">Support this creator to unlock</p>
                      <button className="bg-primary hover:bg-primary-dark text-gray-900 font-medium px-4 sm:px-6 py-1.5 sm:py-2 text-sm rounded-full transition-all hover:shadow-[0_8px_26px_rgba(255,90,136,0.35)]">Support</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="px-3 sm:px-4 pt-2 sm:pt-3 pb-3 flex items-center justify-between bg-surface">
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
              <div className="flex items-center">{/* reserved */}</div>
            </div>
          </article>
        ))
      )}

      {loading && (
        <div className="flex justify-center items-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
};

export default Feed;
