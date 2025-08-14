import React, { useEffect, useState } from 'react';
import '../userProfile/userProfile.css';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../AuthContext';

type ProfileInfo = {
  email: string | null;
  full_name: string | null;
  username: string | null;
  bio?: string | null;
  supporters?: string | null;
  posts?: number | null;
  rating?: number | null;
  phone_number?: string | null;
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

      if (!effectiveId) {
        setError('No public ID provided.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_public_profile', { p_public_id: effectiveId });

        if (!mounted) return;

        let resolvedProfile: ProfileInfo | null = null;

        if (error) {
          // keep error for now; we will attempt a fallback
          setError(error.message);
        } else if (data) {
          if (Array.isArray(data)) {
            if (data.length > 0) {
              resolvedProfile = data[0] as ProfileInfo;
            }
          } else {
            resolvedProfile = data as ProfileInfo;
          }
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
            const { data: userRow, error: userErr } = await supabase
              .from('users')
              .select('email, full_name, username, phone_number, user_type')
              .eq('email', emailFallback)
              .maybeSingle();

            if (!mounted) return;

            if (!userErr && userRow) {
              resolvedProfile = {
                email: userRow.email ?? null,
                full_name: userRow.full_name ?? null,
                username: userRow.username ?? null,
                phone_number: userRow.phone_number ?? null,
                user_type: userRow.user_type ?? null,
              };
              // Clear any previous RPC error since fallback succeeded
              setError(null);
            }
          }
        }

        if (resolvedProfile) {
          setProfile(resolvedProfile);
          // Prefill avatarUrl from profile or localStorage and persist key identifiers
          try {
            const stored = localStorage.getItem('avatar_url');
            setAvatarUrl(resolvedProfile?.avatar_url || stored || null);
            if (resolvedProfile?.username) {
              localStorage.setItem('username', resolvedProfile.username);
            }
            if (resolvedProfile?.full_name) {
              localStorage.setItem('full_name', resolvedProfile.full_name);
            }
          } catch {
            // ignore storage errors
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

  return (
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

        {loading && <div className="state info">Loading profile…</div>}
        {error && !loading && <div className="state error">{error}</div>}

        {!loading && !error && (
          <>
            <p className="bio-text">
              {profile?.bio || 'Share something about yourself to let your supporters know you better!'}
            </p>

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

            <button className="support-btn bg-primary">Join as a Creator</button>

            <div className="quick-links">
              <button className="link-btn">Settings</button>
              <button className="link-btn">Privacy</button>
            </div>
          </>
        )}
      </aside>

      {/* Right column: feed */}
      <main className="profile-feed">
        <button className="create-post-btn">+ Create New Post</button>
      </main>
    </div>
  );
};

export default UserProfile;
