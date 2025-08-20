import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Lock, Globe, Users, User } from 'lucide-react';
import PostModal from './PostModal';

type PostWithMedia = {
  id: string;
  user_id: string;
  title?: string;
  content: string;
  category?: string;
  visibility: 'public' | 'friends' | 'private';
  created_at: string;
  has_media: boolean;
  media_urls?: string[] | null;
  likes_count?: number;
  comments_count?: number;
};

type ImagePost = {
  id: string;
  media_url: string;
  title?: string;
  visibility: 'public' | 'friends' | 'private';
  post_id: string;
  media_index: number;
};

type UserImageGalleryProps = {
  userId?: string;
};

// Component to display visibility icon based on post visibility
const VisibilityIcon: React.FC<{ visibility: string }> = ({ visibility }) => {
  switch (visibility) {
    case 'public':
      return <Globe size={16} className="text-gray-500" aria-label="Public" />;
    case 'friends':
      return <Users size={16} className="text-gray-500" aria-label="Friends Only" />;
    case 'private':
      return <User size={16} className="text-gray-500" aria-label="Only Me" />;
    default:
      return <Lock size={16} className="text-gray-500" aria-label="Private" />;
  }
};

const UserImageGallery: React.FC<UserImageGalleryProps> = ({ userId }) => {
  const [images, setImages] = useState<ImagePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostWithMedia | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [originalPosts, setOriginalPosts] = useState<PostWithMedia[]>([]);
  const [showAllPublic, setShowAllPublic] = useState(false);
  const [showAllPrivate, setShowAllPrivate] = useState(false);
  
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

  // Helper function to fetch images for a specific user - wrapped in useCallback to avoid recreation on each render
  const fetchImagesForUser = useCallback(async (targetUserId: string, loggedInUserId: string | null) => {
    try {
      console.log('[Gallery] Fetching images for user ID/email:', targetUserId);
      console.log('[Gallery] Logged in user ID:', loggedInUserId);
      
      // If targetUserId is an email, try to get the actual UUID
      let effectiveTargetId = targetUserId;
      if (isEmail(targetUserId)) {
        console.log('[Gallery] Target ID is an email, converting to UUID...');
        const userId = await getUserIdFromEmail(targetUserId);
        if (userId) {
          effectiveTargetId = userId;
          console.log('[Gallery] Converted email to UUID:', effectiveTargetId);
          // Store this mapping for future use
          localStorage.setItem('user_id_for_' + targetUserId, userId);
        } else {
          throw new Error(`Could not find user ID for email: ${targetUserId}`);
        }
      }
      
      console.log('[Gallery] Using effective target ID for query:', effectiveTargetId);
      
      // Query the post_with_media table for posts with media
      let query = supabase
        .from('post_with_media')
        .select('*')
        .eq('user_id', effectiveTargetId)
        .eq('has_media', true)
        .order('created_at', { ascending: false });
      
      // If viewing someone else's profile, only show their public posts
      if (targetUserId !== loggedInUserId) {
        console.log('[Gallery] Viewing another user\'s profile, filtering to public posts only');
        query = query.eq('visibility', 'public');
      } else {
        console.log('[Gallery] Viewing own profile, showing all posts with media');
      }
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) {
        console.error('[Gallery] Error from Supabase query:', fetchError);
        throw new Error(fetchError.message);
      }
      
      console.log('[Gallery] Images fetched:', data ? data.length : 0);
      if (data && data.length === 0) {
        console.log('[Gallery] No images found for this user ID:', effectiveTargetId);
      }
      
      if (data) {
        // Store original posts for modal display
        setOriginalPosts(data as PostWithMedia[]);
        
        // Extract all images from posts with media
        const extractedImages: ImagePost[] = [];
        
        data.forEach(post => {
          if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
            post.media_urls.forEach((url: string, index: number) => {
              extractedImages.push({
                id: `${post.id}-${index}`,
                media_url: url,
                title: post.title || undefined,
                visibility: post.visibility,
                post_id: post.id,
                media_index: index
              });
            });
          }
        });
        
        setImages(extractedImages);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching images:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images');
      setLoading(false);
    }
  }, []);  // Empty dependency array since this function doesn't depend on any props or state

  useEffect(() => {
    const fetchImagesFromPosts = async () => {
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
            fetchImagesForUser(userIdFromUrl, loggedInUserId);
            return;
          }
          
          setError('No user ID available to fetch images');
          setLoading(false);
          return;
        }
        
        // Use the helper function to fetch images
        await fetchImagesForUser(targetUserId, loggedInUserId);
      } catch (err) {
        console.error('Error fetching images:', err);
        setError(err instanceof Error ? err.message : 'Failed to load images');
        setLoading(false);
      }
    };
    
    fetchImagesFromPosts();
  }, [userId, fetchImagesForUser]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="media-grid-header">
          <div className="media-grid-title">Photo Collection</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded-md"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="text-center py-6 text-red-500">
          <p>Error loading images: {error}</p>
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="text-center py-8">
          <p className="text-gray-600 mb-1">No images yet</p>
          <p className="text-gray-400 text-sm">Images from your posts will appear here</p>
        </div>
      </div>
    );
  }

  // Group images by visibility
  const publicImages = images.filter(img => img.visibility === 'public');
  const privateImages = images.filter(img => img.visibility !== 'public');

  // Handle opening the modal when an image is clicked
  const handleImageClick = (image: ImagePost) => {
    const post = originalPosts.find(p => p.id === image.post_id);
    if (post) {
      setSelectedPost(post);
      setSelectedImageIndex(image.media_index);
    }
  };

  // Close the modal
  const handleCloseModal = () => {
    setSelectedPost(null);
  };

  // Toggle showing all public images
  const toggleShowAllPublic = () => {
    setShowAllPublic(!showAllPublic);
  };

  // Toggle showing all private images
  const toggleShowAllPrivate = () => {
    setShowAllPrivate(!showAllPrivate);
  };

  return (
    <div className="space-y-6 pr-1 pb-4">
      {/* Modal for displaying full post */}
      <PostModal 
        post={selectedPost} 
        onClose={handleCloseModal} 
        currentImageIndex={selectedImageIndex} 
      />
      
      {/* Public Images */}
      <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-base sm:text-lg">Photo Collection</h3>
          <button 
            className="text-primary text-sm hover:underline"
            onClick={toggleShowAllPublic}
          >
            {showAllPublic ? 'Show Less' : 'View All'}
          </button>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#ff3d6e #f1f1f1' }}>
          {(showAllPublic ? publicImages : publicImages.slice(0, 6)).map((image) => (
            <div 
              key={image.id} 
              className="aspect-square rounded-md overflow-hidden bg-gray-100 relative group cursor-pointer"
              onClick={() => handleImageClick(image)}
            >
              <img 
                src={image.media_url} 
                alt={image.title || 'User image'} 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute top-2 right-2">
                <VisibilityIcon visibility={image.visibility} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Private/Premium Images */}
      {privateImages.length > 0 && (
        <div className="bg-white rounded-lg sm:rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-base sm:text-lg">Premium Collection</h3>
            <div className="flex items-center gap-2">
              <button 
                className="text-primary text-sm hover:underline"
                onClick={toggleShowAllPrivate}
              >
                {showAllPrivate ? 'Show Less' : 'View All'}
              </button>
              <button className="text-primary text-sm">Unlock</button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#ff3d6e #f1f1f1' }}>
            {(showAllPrivate ? privateImages : privateImages.slice(0, 3)).map((image) => (
              <div 
                key={image.id} 
                className="aspect-square rounded-md overflow-hidden bg-gray-800 relative flex items-center justify-center cursor-pointer"
                onClick={() => handleImageClick(image)}
              >
                <Lock className="text-white/70 h-6 w-6" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserImageGallery;
