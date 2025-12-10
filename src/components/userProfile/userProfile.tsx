import React, { useEffect, useState } from 'react';
import '../userProfile/userProfile.css';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../AuthContext';
import CreatorDashboard from '../creatorDashboard/CreatorDashboard';
import UserPost from './userPost';
import UserImageGallery from './userImageGallery';
import { FileText, Image, Video, Radio } from 'lucide-react';

type ProfileInfo = {
  email: string | null;
  full_name: string | null;
  username: string | null;
  bio?: string | null;
  supporters?: string | null;
  posts?: number | null;
  rating?: number | null;
  phone_number?: string | null;
  user_id?: string | null;
  id?: string | null;
  user_type?: string | null;
  avatar_url?: string | null;
};

type UserProfileProps = {
  publicId?: string; // The identifier to fetch profile for (optional)
};

const UserProfile: React.FC<UserProfileProps> = ({ publicId }) => {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { navigateTo } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Post' | 'Picture' | 'Videos' | 'Streaming'>('Post');
  
  // Dashboard state - check localStorage for persistence
  const [showCreatorDashboard, setShowCreatorDashboard] = useState(() => {
    try {
      return localStorage.getItem('show_creator_dashboard') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      setProfile(null);

      // Determine effective identifier: prefer prop, then localStorage fallbacks
      const effectiveId =
        publicId ||
        (() => {
          try {
            return (
              localStorage.getItem('public_id') ||
              localStorage.getItem('logged_in_email') ||
              ''
            );
          } catch {
            return '';
          }
        })();

      console.log('Effective ID for profile fetch:', effectiveId);
      console.log('localStorage values:', {
        public_id: localStorage.getItem('public_id'),
        logged_in_email: localStorage.getItem('logged_in_email'),
        current_user_id: localStorage.getItem('current_user_id'),
        viewing_user_id: localStorage.getItem('viewing_user_id')
      });

      if (!effectiveId) {
        setError('No public ID provided.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_public_profile', { p_public_id: effectiveId });
        console.log('RPC get_public_profile response:', { data, error });

        if (!mounted) return;

        let resolvedProfile: ProfileInfo | null = null;

        if (error) {
          // keep error for now; we will attempt a fallback
          console.error('Error from get_public_profile:', error.message);
          setError(error.message);
        } else if (data) {
          console.log('Profile data returned:', data);
          if (Array.isArray(data)) {
            if (data.length > 0) {
              resolvedProfile = data[0] as ProfileInfo;
              console.log('Resolved profile from array:', resolvedProfile);
            } else {
              console.log('Data is an empty array');
            }
          } else {
            resolvedProfile = data as ProfileInfo;
            console.log('Resolved profile from object:', resolvedProfile);
          }
        } else {
          console.log('No data returned from get_public_profile');
        }

        if (!resolvedProfile) {
          // Fallback: try by email from localStorage if available or if the effectiveId looks like an email
          let emailFallback = '';
          if (typeof effectiveId === 'string' && effectiveId.includes('@')) {
            emailFallback = effectiveId;
          } else {
            try {
              emailFallback = localStorage.getItem('logged_in_email') || '';
            } catch {
              // ignore
            }
          }

          if (emailFallback) {
            console.log('Using email fallback:', emailFallback);
            const { data: userRow, error: userErr } = await supabase
              .from('users')
              .select('id, email, full_name, username, phone_number, user_type')
              .eq('email', emailFallback)
              .maybeSingle();

            console.log('User lookup by email result:', { userRow, userErr });

            if (!mounted) return;

            if (!userErr && userRow) {
              resolvedProfile = {
                id: userRow.id ?? null,
                user_id: userRow.id ?? null, // Explicitly set user_id from id
                email: userRow.email ?? null,
                full_name: userRow.full_name ?? null,
                username: userRow.username ?? null,
                phone_number: userRow.phone_number ?? null,
                user_type: userRow.user_type ?? null,
              };
              console.log('Created profile from user row:', resolvedProfile);
              // Clear any previous RPC error since fallback succeeded
              setError(null);
            } else {
              console.log('No user found with email:', emailFallback);
            }
          } else {
            console.log('No email fallback available');
          }
        }

        if (resolvedProfile) {
          setProfile(resolvedProfile);
          // Prefill avatarUrl from profile or localStorage and persist key identifiers
          try {
            const stored = localStorage.getItem('avatar_url');
            setAvatarUrl(resolvedProfile?.avatar_url || stored || null);
            
            // Store critical user identifiers in localStorage
            if (resolvedProfile?.username) {
              localStorage.setItem('username', resolvedProfile.username);
            }
            if (resolvedProfile?.full_name) {
              localStorage.setItem('full_name', resolvedProfile.full_name);
            }
            
            // Store user_id in localStorage for post fetching
            if (resolvedProfile?.user_id) {
              console.log('Storing user_id in localStorage:', resolvedProfile.user_id);
              localStorage.setItem('current_user_id', resolvedProfile.user_id);
              localStorage.setItem('public_id', resolvedProfile.user_id);
            } else if (resolvedProfile?.id) {
              console.log('Storing id as user_id in localStorage:', resolvedProfile.id);
              localStorage.setItem('current_user_id', resolvedProfile.id);
              localStorage.setItem('public_id', resolvedProfile.id);
            }
            
            // If we have an email, store the mapping
            if (resolvedProfile?.email && (resolvedProfile?.user_id || resolvedProfile?.id)) {
              const userId = resolvedProfile.user_id || resolvedProfile.id;
              if (userId) {
                console.log(`Storing user_id mapping for email ${resolvedProfile.email}:`, userId);
                localStorage.setItem(`user_id_for_${resolvedProfile.email}`, userId);
              }
            }
          } catch (err) {
            // ignore storage errors
            console.error('Error storing profile data in localStorage:', err);
          }
        } else if (!error) {
          // Only set a generic error if one hasn't already been set above
          setError('No profile data returned.');
        }
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load profile.';
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [publicId]);

  // Handle avatar upload
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      // Preview locally and persist to localStorage for now
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string; // FileReader result as DataURL
        setAvatarUrl(dataUrl);
        try {
          localStorage.setItem('avatar_url', dataUrl);
        } catch {
          // ignore storage errors
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  
  // Toggle creator dashboard
  const handleToggleCreatorDashboard = () => {
    const newState = !showCreatorDashboard;
    setShowCreatorDashboard(newState);
    try {
      localStorage.setItem('show_creator_dashboard', newState.toString());
    } catch {
      // Ignore storage errors
    }
  };
  
  // simple helpers for display
  const formatNumber = (n?: number | null) => {
    if (n === null || n === undefined) return '—';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const displayName = profile?.full_name || profile?.username || '—';
  const handle = profile?.username ? `@${profile.username}` : profile?.email || '';
  const supporters = profile?.supporters ? Number(profile.supporters) : undefined;
  const posts = profile?.posts ?? undefined;
  const rating = profile?.rating ?? undefined;

  // Show loading or error states
  if (loading) {
    return (
      <div className="profile-layout">
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="profile-layout">
        <div className="error-message">
          <p>Error loading profile: {error}</p>
          <button 
            className="back-btn"
            onClick={() => navigateTo('main')}
          >
            ← Back to Main Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showCreatorDashboard && profile ? (
        <CreatorDashboard 
          profile={profile} 
          onBack={handleToggleCreatorDashboard}
        />
      ) : (
        <div className="profile-layout">
          {/* Left sidebar: profile card */}
          <aside className="profile-sidebar">
            <button
              type="button"
              className="back-btn"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('main');
              }}
            >
              ← Back
            </button>

            <div className="avatar-container">
              {avatarUrl ? (
                <img className="avatar" src={avatarUrl} alt="avatar" />
              ) : (
                <div className="avatar default-avatar" aria-label="default avatar" />
              )}
              {!avatarUrl && (
                <label className={`avatar-plus ${isUploading ? 'disabled' : ''}`} title="Upload avatar">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden-file-input"
                    onChange={onAvatarChange}
                    disabled={isUploading}
                  />
                  +
                </label>
              )}
            </div>
            <div className="title-block">
              <h2 className="title">{displayName}</h2>
              {handle && <p className="subtitle">{handle}</p>}
            </div>
            <div className="stats-row">
              <div className="stat">
                <div className="stat-value">{formatNumber(supporters)}</div>
                <div className="stat-label">Supporters</div>
              </div>
              <div className="stat">
                <div className="stat-value">{formatNumber(posts)}</div>
                <div className="stat-label">Posts</div>
              </div>
              <div className="stat">
                <div className="stat-value">{rating ?? '—'}</div>
                <div className="stat-label">Rating</div>
              </div>
            </div>

            <div className="badges-row">
              <span className="badge">P</span>
              <span className="badge">G</span>
              <span className="badge">S</span>
              <span className="badge">B</span>
            </div>

            <button 
              className="support-btn bg-primary"
              onClick={() => {
                if (profile?.user_type === 'creator') {
                  setShowCreatorDashboard(true);
                } else if (profile?.user_type === 'subscriber') {
                  // Handle subscriber action if needed
                } else {
                  // Handle join as creator action
                }
              }}
            >
              {profile?.user_type === 'creator' ? 'Creator Dashboard' : 
               profile?.user_type === 'subscriber' ? 'Manage Subscription' : 
               'Join as a Creator'}
            </button>

            <div className="quick-links">
              <button className="link-btn">Settings</button>
              <button className="link-btn">Privacy</button>
            </div>
          </aside>

          {/* Right column: feed */}
          <main className="profile-feed">
            {/* Icon Navigation Bar (copied style from creator page) */}
            <div className="mb-4 sm:mb-6 flex justify-center">
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
            
            {/* Content area */}
            <div className="profile-content overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              {activeTab === 'Post' && (
                <>
                  {console.log('Profile data:', profile)}
                  {console.log('User ID being passed to UserPost:', profile?.user_id || profile?.id || 'undefined')}
                  
                  <UserPost 
                    userId={profile?.user_id || profile?.id || undefined} 
                  />
                </>
              )}
              
              {activeTab === 'Picture' && (
                <>
                  {console.log('User ID being passed to UserImageGallery:', profile?.user_id || profile?.id || 'undefined')}
                  <UserImageGallery userId={profile?.user_id || profile?.id || undefined} />
                </>
              )}
              
              {activeTab === 'Videos' && (
                <div className="post-card pr-1 pb-4">
                  <div className="media-grid-header">
                    <div className="media-grid-title">Recent Videos</div>
                    <div className="media-grid-action">View All</div>
                  </div>
                  
                  <div className="media-grid max-h-[300px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#ff3d6e #f1f1f1' }}>
                    <div className="media-item video">
                      <img src="https://images.unsplash.com/photo-1536240478700-b869070f9279?w=500&auto=format&fit=crop&q=60" alt="Video 1" />
                    </div>
                    <div className="media-item video">
                      <img src="https://images.unsplash.com/photo-1682687982360-3bbc6b668d3b?w=500&auto=format&fit=crop&q=60" alt="Video 2" />
                    </div>
                    <div className="media-item video locked">
                      {/* Locked video content */}
                    </div>
                  </div>
                  
                  <div className="media-grid-header">
                    <div className="media-grid-title">Popular Videos</div>
                    <div className="media-grid-action">Sort By</div>
                  </div>
                  
                  <div className="media-grid max-h-[300px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#ff3d6e #f1f1f1' }}>
                    <div className="media-item video">
                      <img src="https://images.unsplash.com/photo-1682695796954-bad0d0f59ff1?w=500&auto=format&fit=crop&q=60" alt="Popular Video 1" />
                    </div>
                    <div className="media-item video">
                      <img src="https://images.unsplash.com/photo-1682687218147-9806132dc697?w=500&auto=format&fit=crop&q=60" alt="Popular Video 2" />
                    </div>
                    <div className="media-item video">
                      <img src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&auto=format&fit=crop&q=60" alt="Popular Video 3" />
                    </div>
                    <div className="media-item video locked">
                      {/* Locked premium video */}
                    </div>
                    <div className="media-item video locked">
                      {/* Locked premium video */}
                    </div>
                    <div className="media-item video">
                      <img src="https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=500&auto=format&fit=crop&q=60" alt="Popular Video 4" />
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'Streaming' && (
                <div className="post-card pr-1 pb-4">
                  <div className="post-body">
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ background: '#2a2d36', padding: '60px 20px', borderRadius: '8px', marginBottom: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                        <div style={{ color: '#ff3d6e', fontSize: '24px' }}>📺 LIVE</div>
                        <div style={{ color: '#6b7280' }}>Streaming coming soon!</div>
                      </div>
                      <button className="bg-primary" style={{ margin: '10px auto', display: 'block' }}>
                        Get Notified
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </>
  );
};

export default UserProfile;
