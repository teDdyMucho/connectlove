import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Lock, Globe, Users, User, Upload, Folder } from 'lucide-react';
import PostModal from './PostModal';
import { useAuth } from '../../components/AuthContext';

// Collection types
type Collection = {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  price: number; // folder-level price
  itemCount: number;
  created_at: string;
};

type CollectionItem = {
  id: string;
  collection_id: string;
  media_url: string;
  title?: string;
  media_type: string;
};


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
  category?: string | null;
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
  const { navigateTo } = useAuth();
  const [images, setImages] = useState<ImagePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostWithMedia | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [originalPosts, setOriginalPosts] = useState<PostWithMedia[]>([]);
  const [showAllPublic, setShowAllPublic] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionPrice, setNewCollectionPrice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [userCollections, setUserCollections] = useState<Collection[]>([]);
  const [collectionItems, setCollectionItems] = useState<Record<string, CollectionItem[]>>({});
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editCollectionPrice, setEditCollectionPrice] = useState('');
  const [pointsModalMessage, setPointsModalMessage] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [viewingImage, setViewingImage] = useState<{ item: CollectionItem; items: CollectionItem[]; index: number } | null>(null);

  // Keyboard navigation for image viewer
  useEffect(() => {
    if (!viewingImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewingImage(prev => {
          if (!prev) return prev;
          const newIndex = Math.max(0, prev.index - 1);
          if (newIndex === prev.index) return prev;
          return { ...prev, item: prev.items[newIndex], index: newIndex };
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewingImage(prev => {
          if (!prev) return prev;
          const newIndex = Math.min(prev.items.length - 1, prev.index + 1);
          if (newIndex === prev.index) return prev;
          return { ...prev, item: prev.items[newIndex], index: newIndex };
        });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setViewingImage(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewingImage]);
  
  // Fetch collections from database
  const fetchCollections = useCallback(async (targetUserId: string) => {
    try {
      // First fetch collections
      const { data: collectionsData, error: collectionsError } = await supabase
        .from('collections')
        .select('id, name, description, cover_image_url, price, created_at, supporters')
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (collectionsError) {
        console.error('Error fetching collections:', collectionsError);
        return;
      }
      
      if (!collectionsData) {
        setUserCollections([]);
        return;
      }

      // Determine current viewer id for entitlement check
      let viewerId: string | null = null;
      try {
        viewerId = localStorage.getItem('current_user_id') ||
                   localStorage.getItem('public_id') ||
                   localStorage.getItem('user_id') ||
                   null;
      } catch { /* ignore */ }
      
      // Get item counts for each collection
      const collectionsWithCounts = await Promise.all(
        collectionsData.map(async (collection) => {
          const { count } = await supabase
            .from('collection_items')
            .select('*', { count: 'exact', head: true })
            .eq('collection_id', collection.id)
            .eq('is_active', true);
          
          return {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            coverImage: collection.cover_image_url,
            price: Number(collection.price ?? 0),
            itemCount: count || 0,
            created_at: collection.created_at,
          } as Collection;
        })
      );
      
      setUserCollections(collectionsWithCounts);

      // Mark unlocked based on supporters array from DB so it stays unlocked after refresh
      try {
        if (viewerId) {
          const entitled = new Set<string>();
          const typed = collectionsData as Array<{ id: string; supporters: string[] | null }>;
          for (const c of typed) {
            const supportersArr = c.supporters;
            if (Array.isArray(supportersArr) && supportersArr.includes(viewerId)) {
              entitled.add(c.id);
            }
          }
          if (entitled.size > 0) {
            setUnlocked((prev) => new Set<string>([...prev, ...entitled]));
          }
        }
      } catch { /* ignore */ }
    } catch (error) {
      console.error('Error fetching collections:', error);
    }
  }, []);
  
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
      
      // Check if viewing own profile
      const isOwn = targetUserId === loggedInUserId;
      
      // If viewing someone else's profile, only show their public posts
      if (!isOwn) {
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
        // Set own profile state
        setIsOwnProfile(targetUserId === loggedInUserId);
        
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
                media_index: index,
                category: post.category ?? null,
              });
            });
          }
        });
        
        setImages(extractedImages);
        
        // Fetch collections for this user
        await fetchCollections(effectiveTargetId);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching images:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images');
      setLoading(false);
    }
  }, [fetchCollections]);  // Add fetchCollections to dependency array

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

  // Group images by PUBLIC vs PREMIUM
  const publicImages = images.filter(img => img.visibility === 'public' && !img.category);

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

  
  
  // Handle collection click - open modal and load items
  const handleCollectionClick = (collection: Collection) => {
    setActiveCollection(collection);
    const collectionId = collection.id;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('collection_items')
          .select('id, collection_id, media_url, title, media_type')
          .eq('collection_id', collectionId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching collection items:', error);
          return;
        }

        const items: CollectionItem[] = (data || []).map((it) => ({
          id: it.id,
          collection_id: it.collection_id,
          media_url: it.media_url,
          title: it.title,
          media_type: it.media_type || 'image',
        }));
        setCollectionItems((prev) => ({ ...prev, [collectionId]: items }));
      } catch (err) {
        console.error('Error loading collection items:', err);
      }
    })();
  };
  
  // Handle create new collection
  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    const parsedPrice = newCollectionPrice.trim() ? Number(newCollectionPrice.trim()) : 0;
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      alert('Please enter a valid non-negative price.');
      return;
    }
    try {
      setUploading(true);

      // Get user ID - try Supabase auth first, then fallback to localStorage
      let authUserId: string | null = null;
      const userRes = await supabase.auth.getUser();
      if (userRes.data?.user?.id) {
        authUserId = userRes.data.user.id;
      } else {
        // Fallback: get/refresh session, then read user
        let { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          await supabase.auth.refreshSession();
          const retry = await supabase.auth.getSession();
          sessionData = retry.data;
        }
        authUserId = sessionData?.session?.user?.id ?? null;
      }
      
      // If no Supabase auth, use localStorage as fallback
      if (!authUserId) {
        authUserId = localStorage.getItem('current_user_id') || 
                    localStorage.getItem('public_id') || 
                    localStorage.getItem('user_id');
        console.log('[Gallery] Using localStorage user_id as fallback:', authUserId);
      }
      
      if (!authUserId) {
        alert('No user ID found. Please log in again.');
        return;
      }

      // Insert new collection. RLS policy expects auth.uid() = user_id
      const { data, error } = await supabase
        .from('collections')
        .insert([
          {
            user_id: authUserId,
            name: newCollectionName.trim(),
            description: null,
            cover_image_url: null,
            price: parsedPrice,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('Error creating collection:', error);
        alert(error.message || 'Failed to create collection');
        return;
      }

      const newCollection: Collection = {
        id: data.id,
        name: data.name,
        description: data.description,
        coverImage: data.cover_image_url,
        price: Number(data.price ?? 0),
        itemCount: 0,
        created_at: data.created_at,
      };
      setUserCollections((prev) => [...prev, newCollection]);
      setNewCollectionName('');
      setNewCollectionPrice('');
      setShowCreateCollection(false);
    } catch (error) {
      console.error('Error creating collection:', error);
      alert('Failed to create collection');
    } finally {
      setUploading(false);
    }
  };

  // Handle edit collection
  const handleEditCollection = (collection: Collection) => {
    setEditingCollection(collection);
    setEditCollectionName(collection.name);
    setEditCollectionPrice(collection.price.toString());
  };

  // Handle update collection
  const handleUpdateCollection = async () => {
    if (!editingCollection || !editCollectionName.trim()) return;
    
    const parsedPrice = editCollectionPrice.trim() ? Number(editCollectionPrice.trim()) : 0;
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      alert('Please enter a valid non-negative price.');
      return;
    }

    try {
      setUploading(true);

      const { error } = await supabase
        .from('collections')
        .update({
          name: editCollectionName.trim(),
          price: parsedPrice,
        })
        .eq('id', editingCollection.id);

      if (error) {
        console.error('Error updating collection:', error);
        alert(error.message || 'Failed to update collection');
        return;
      }

      // Update local state
      setUserCollections(prev => 
        prev.map(col => 
          col.id === editingCollection.id 
            ? { ...col, name: editCollectionName.trim(), price: parsedPrice }
            : col
        )
      );

      setEditingCollection(null);
      setEditCollectionName('');
      setEditCollectionPrice('');
      alert('Collection updated successfully!');
    } catch (error) {
      console.error('Error updating collection:', error);
      alert('Failed to update collection');
    } finally {
      setUploading(false);
    }
  };

  // Handle delete collection
  const handleDeleteCollection = async (collectionId: string) => {
    if (!confirm('Are you sure you want to delete this collection? This action cannot be undone.')) {
      return;
    }

    try {
      setUploading(true);

      // Delete collection (cascade will delete collection_items)
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', collectionId);

      if (error) {
        console.error('Error deleting collection:', error);
        alert(error.message || 'Failed to delete collection');
        return;
      }

      // Update local state
      setUserCollections(prev => prev.filter(col => col.id !== collectionId));
      setCollectionItems(prev => {
        const newItems = { ...prev };
        delete newItems[collectionId];
        return newItems;
      });

      alert('Collection deleted successfully!');
    } catch (error) {
      console.error('Error deleting collection:', error);
      alert('Failed to delete collection');
    } finally {
      setUploading(false);
    }
  };

  // Handle delete collection item
  const handleDeleteCollectionItem = async (itemId: string, collectionId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return;
    }

    try {
      setUploading(true);

      const { error } = await supabase
        .from('collection_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('Error deleting collection item:', error);
        alert(error.message || 'Failed to delete item');
        return;
      }

      // Update local state - remove item from collection
      setCollectionItems(prev => ({
        ...prev,
        [collectionId]: prev[collectionId]?.filter(item => item.id !== itemId) || []
      }));

      // Update collection count
      setUserCollections(prev => 
        prev.map(col => 
          col.id === collectionId 
            ? { ...col, itemCount: Math.max(0, col.itemCount - 1) }
            : col
        )
      );

      alert('Item deleted successfully!');
    } catch (error) {
      console.error('Error deleting collection item:', error);
      alert('Failed to delete item');
    } finally {
      setUploading(false);
    }
  };
  
  // Handle collection upload
  const handleCollectionUpload = async (collectionId: string, files: FileList) => {
    if (!files.length) return;
    
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // Upload file to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `collections/${collectionId}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, file);
        
        if (uploadError) {
          throw uploadError;
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(filePath);
        
        // Save to collection_items table
        const { error: dbError } = await supabase
          .from('collection_items')
          .insert({
            collection_id: collectionId,
            media_url: publicUrl,
            title: file.name,
            media_type: file.type.startsWith('image/') ? 'image' : 'video',
            file_size: file.size,
            file_name: fileName,
          });

        if (dbError) {
          throw dbError;
        }

        // If the collection has no cover yet, set this uploaded image as cover
        await supabase
          .from('collections')
          .update({ cover_image_url: publicUrl })
          .eq('id', collectionId)
          .is('cover_image_url', null);
        
        return publicUrl;
      });
      
      await Promise.all(uploadPromises);
      
      // Refresh collections to update item count
      const currentUserId = localStorage.getItem('current_user_id') || localStorage.getItem('public_id');
      if (currentUserId) {
        await fetchCollections(currentUserId);
      }
      
      alert(`Successfully uploaded ${files.length} file(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 pr-1 pb-4">
      {/* Modal for displaying full post */}
      <PostModal 
        post={selectedPost} 
        onClose={handleCloseModal} 
        currentImageIndex={selectedImageIndex} 
      />
      {pointsModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-black border border-gray-700/50 p-5 shadow-2xl">
            <h3 className="text-white text-lg font-bold mb-2">Insufficient Points</h3>
            <p className="text-gray-300 text-sm mb-4">{pointsModalMessage}</p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 text-sm"
                onClick={() => setPointsModalMessage(null)}
              >
                Close
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm hover:from-pink-600 hover:to-purple-700"
                onClick={() => {
                  setPointsModalMessage(null);
                  try {
                    if (navigateTo) {
                      navigateTo('wallet');
                    } else if (typeof window !== 'undefined') {
                      window.location.href = '/wallet';
                    }
                  } catch { /* ignore */ }
                }}
              >
                Go to Wallet
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Image Viewer Modal */}
      {viewingImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-8">
          <div className="relative w-full h-full max-w-6xl max-h-[85vh] flex items-center justify-center">
            {/* Close Button */}
            <button
              className="absolute top-4 right-4 z-10 text-white/80 hover:text-white p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
              onClick={() => setViewingImage(null)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Previous Button */}
            {viewingImage.index > 0 && (
              <button
                className="fixed left-4 top-1/2 -translate-y-1/2 z-[70] text-white/80 p-3 rounded-full bg-black/50"
                onClick={() => {
                  const newIndex = viewingImage.index - 1;
                  const newItem = viewingImage.items[newIndex];
                  setViewingImage({ ...viewingImage, item: newItem, index: newIndex });
                }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            
            {/* Next Button */}
            {viewingImage.index < viewingImage.items.length - 1 && (
              <button
                className="fixed right-4 top-1/2 -translate-y-1/2 z-[70] text-white/80 p-3 rounded-full bg-black/50"
                onClick={() => {
                  const newIndex = viewingImage.index + 1;
                  const newItem = viewingImage.items[newIndex];
                  setViewingImage({ ...viewingImage, item: newItem, index: newIndex });
                }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            
            {/* Main Image/Video */}
            <div className="w-full h-full flex items-center justify-center">
              {viewingImage.item.media_type === 'video' ? (
                <video
                  src={viewingImage.item.media_url}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={viewingImage.item.media_url}
                  alt={viewingImage.item.title || 'Collection item'}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>
            
            {/* Image Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
              {viewingImage.index + 1} / {viewingImage.items.length}
            </div>
          </div>
        </div>
      )}
      
      {/* Public Images (category Public) */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl p-6 shadow-2xl border border-gray-700/50 mb-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="font-bold text-2xl text-white mb-2">Photo Collection</h3>
            <p className="text-gray-400 text-sm">Public content available to everyone</p>
          </div>
          <button 
            className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-2.5 rounded-full font-medium text-sm transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
            onClick={toggleShowAllPublic}
          >
            {showAllPublic ? 'Show Less' : 'View All'}
          </button>
        </div>
        
        {publicImages.length === 0 ? (
          <div className="text-center py-16">
            <div className="bg-gray-800/30 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-300 text-lg font-medium mb-2">No photos yet</p>
            <p className="text-gray-500 text-sm">Share your first photo to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3b82f6 #374151' }}>
            {(showAllPublic ? publicImages : publicImages.slice(0, 8)).map((image) => (
              <div 
                key={image.id} 
                className="aspect-square rounded-xl overflow-hidden bg-gray-800 relative group cursor-pointer hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300"
                onClick={() => handleImageClick(image)}
              >
                <img 
                  src={image.media_url} 
                  alt={image.title || 'User image'} 
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-full p-1.5">
                  <VisibilityIcon visibility={image.visibility} />
                </div>
                <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
                    Public
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Premium Collection - Custom Collections Grid */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl p-6 shadow-2xl border border-gray-700/50">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="font-bold text-xl text-white mb-1">Premium Collection</h3>
            <p className="text-gray-400 text-sm">Exclusive content for subscribers</p>
          </div>
          {isOwnProfile && (
            <button 
              onClick={() => setShowCreateCollection(true)}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 shadow-lg hover:shadow-pink-500/25"
            >
              + New Collection
            </button>
          )}
        </div>
        
        {/* Create Collection Modal */}
        {showCreateCollection && (
          <div className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-600/50 backdrop-blur-sm">
            <div className="flex gap-3 flex-wrap">
              <input 
                type="text"
                placeholder="Enter collection name..."
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                className="flex-1 px-4 py-2.5 text-sm bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateCollection()}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Points"
                value={newCollectionPrice}
                onChange={(e) => setNewCollectionPrice(e.target.value)}
                className="w-32 px-3 py-2.5 text-sm bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <button 
                onClick={handleCreateCollection}
                className="px-4 py-2.5 text-sm bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:from-pink-600 hover:to-purple-700 font-medium transition-all duration-200"
              >
                Create
              </button>
              <button 
                onClick={() => { setShowCreateCollection(false); setNewCollectionName(''); }}
                className="px-4 py-2.5 text-sm bg-gray-600 text-gray-300 rounded-lg hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Edit Collection Modal */}
        {editingCollection && (
          <div className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-600/50 backdrop-blur-sm">
            <h4 className="text-white font-medium mb-3">Edit Collection</h4>
            <div className="flex gap-3 flex-wrap">
              <input 
                type="text"
                placeholder="Collection name..."
                value={editCollectionName}
                onChange={(e) => setEditCollectionName(e.target.value)}
                className="flex-1 px-4 py-2.5 text-sm bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Points"
                value={editCollectionPrice}
                onChange={(e) => setEditCollectionPrice(e.target.value)}
                className="w-32 px-3 py-2.5 text-sm bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <button 
                onClick={handleUpdateCollection}
                className="px-4 py-2.5 text-sm bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 font-medium transition-all duration-200"
                disabled={uploading}
              >
                {uploading ? 'Updating...' : 'Update'}
              </button>
              <button 
                onClick={() => {
                  setEditingCollection(null);
                  setEditCollectionName('');
                  setEditCollectionPrice('');
                }}
                className="px-4 py-2.5 text-sm bg-gray-600 text-gray-300 rounded-lg hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {userCollections.length === 0 ? (
            <div className="col-span-2 text-center py-16">
              <div className="bg-gray-800/30 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <Folder className="h-10 w-10 text-gray-500" />
              </div>
              <p className="text-gray-300 text-lg font-medium mb-2">No collections yet</p>
              <p className="text-gray-500 text-sm">Create your first collection to organize premium content</p>
            </div>
          ) : (
            userCollections.map((collection: Collection) => {
              const isLocked = !isOwnProfile && collection.price > 0 && !unlocked.has(collection.id);
              return (
                <div key={collection.id} className={`group relative bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl overflow-hidden border border-gray-700/30 transition-all duration-300 ${isLocked ? 'opacity-80' : 'hover:border-pink-500/30 hover:shadow-2xl hover:shadow-pink-500/10'}`}>
                {/* Collection Card */}
                <div 
                  className={isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}
                  onClick={() => !isLocked && handleCollectionClick(collection)}
                >
                  {/* Preview Section */}
                  <div className="relative">
                    {collection.coverImage ? (
                      <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800">
                        <img 
                          src={collection.coverImage} 
                          alt={`${collection.name} preview`}
                          className={`w-full h-full object-cover transition-transform duration-300 ${isLocked ? 'blur-sm opacity-40' : 'group-hover:scale-105'} ${(!isOwnProfile && isLocked) ? 'opacity-60' : ''}`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        {isLocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <div className="text-center">
                              <div className="bg-pink-500/20 rounded-full p-4 border border-pink-500/30 mb-3">
                                <Lock className="text-pink-400 h-8 w-8" />
                              </div>
                              <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs px-3 py-1.5 rounded-full font-medium">
                                {collection.price.toFixed(0)} pts
                              </div>
                            </div>
                          </div>
                        )}
                        {collection.itemCount > 1 && (
                          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-full font-medium border border-white/20">
                            +{collection.itemCount - 1}
                          </div>
                        )}
                        {isOwnProfile && (
                          <div className="absolute top-3 left-3 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCollection(collection);
                              }}
                              className="bg-blue-500/80 hover:bg-blue-500 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                              title="Edit Collection"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCollection(collection.id);
                              }}
                              className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                              title="Delete Collection"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full aspect-[4/5] rounded-xl bg-gradient-to-br from-gray-700/50 to-gray-800/50 flex items-center justify-center border border-gray-600/30">
                        <div className="text-center">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-600/50 flex items-center justify-center">
                            <span className="text-gray-400 text-2xl">📁</span>
                          </div>
                          <p className="text-sm text-gray-400 font-medium">Empty Collection</p>
                        </div>
                        {isOwnProfile && (
                          <div className="absolute top-3 left-3 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCollection(collection);
                              }}
                              className="bg-blue-500/80 hover:bg-blue-500 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                              title="Edit Collection"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCollection(collection.id);
                              }}
                              className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                              title="Delete Collection"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Collection Info */}
                  <div className="p-4">
                    <div className="mb-3">
                      <h4 className="font-bold text-lg text-white mb-1 truncate">{collection.name}</h4>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <p className="text-gray-400">
                          {collection.itemCount === 0
                            ? 'Empty collection'
                            : `${collection.itemCount} exclusive item${collection.itemCount !== 1 ? 's' : ''}`}
                        </p>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/40 whitespace-nowrap">
                          {collection.price > 0 ? `${collection.price.toFixed(0)} pts` : 'Free'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Action Button */}
                    <div className="w-full">
                      {isOwnProfile ? (
                        <label
                          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-pink-500/20 to-purple-600/20 border border-pink-500/30 text-pink-400 rounded-xl hover:from-pink-500/30 hover:to-purple-600/30 cursor-pointer transition-all duration-200 font-medium text-sm backdrop-blur-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Upload className="h-4 w-4" />
                          Upload Content
                          <input 
                            type="file" 
                            multiple 
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => e.target.files && handleCollectionUpload(collection.id, e.target.files)}
                            disabled={uploading}
                          />
                        </label>
                      ) : isLocked ? (
                        <button 
                          className="w-full px-4 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl font-medium text-sm transition-all duration-200 shadow-lg hover:shadow-pink-500/25"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const viewerId = localStorage.getItem('current_user_id') || localStorage.getItem('public_id') || localStorage.getItem('user_id');
                              const viewerUsername = localStorage.getItem('username') || localStorage.getItem('full_name') || '';
                              // creator identifier: prefer explicit userId prop; else viewing_user_id/public_id/logged_in_email (profile owner)
                              const creatorIdentifier = (userId || localStorage.getItem('viewing_user_id') || localStorage.getItem('public_id') || localStorage.getItem('logged_in_email') || '') as string;
                              const payload = {
                                viewer_id: viewerId || null,
                                viewer_username: viewerUsername || null,
                                creator_identifier: creatorIdentifier || null,
                                source_page: 'gallery',
                                action: 'collection_subscribe_spend_click',
                                collection_id: collection.id,
                                collection_name: collection.name,
                                price: Number(collection.price ?? 0),
                                spend: 'spend',
                                spend_type: 'subscribe_collection',
                                currency: 'points',
                                amount: Number(collection.price ?? 0),
                                description: `spend: subscribe collection "${collection.name}" for ${Number(collection.price ?? 0)} points`,
                                ts: new Date().toISOString(),
                              };
                              console.log('[webhook] POST /webhook/subscribe payload:', payload);
                              const resp = await fetch('https://primary-production-6722.up.railway.app/webhook/subscribe', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                cache: 'no-store',
                                keepalive: true,
                              });
                              const text = await resp.text().catch(() => '');
                              console.log('[webhook] response status:', resp.status, 'body:', text);
                              // Insufficient points
                              if (resp.ok && text.includes('Not enough points')) {
                                setPointsModalMessage('Not enough points to unlock this collection.');
                              }
                              // Success unlock
                              try {
                                const maybeJson = JSON.parse(text);
                                if (resp.ok && (maybeJson?.Status === 'Success Unlocked' || String(text).includes('Success Unlocked'))) {
                                  setUnlocked(prev => {
                                    const next = new Set(prev);
                                    next.add(collection.id);
                                    return next;
                                  });
                                }
                              } catch {
                                if (resp.ok && String(text).includes('Success Unlocked')) {
                                  setUnlocked(prev => {
                                    const next = new Set(prev);
                                    next.add(collection.id);
                                    return next;
                                  });
                                }
                              }
                            } catch (err) {
                              console.error('subscribe webhook error (gallery):', err);
                            }
                          }}
                        >
                          Unlock for {collection.price.toFixed(0)} pts
                        </button>
                      ) : (
                        <button className="w-full px-4 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl font-medium text-sm transition-all duration-200 shadow-lg hover:shadow-pink-500/25">
                          View Collection
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* Collection Modal */}
      {activeCollection && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden border border-gray-700/50 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-gray-800/50">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{activeCollection.name}</h3>
                <p className="text-sm text-gray-400">
                  {collectionItems[activeCollection.id]?.length || 0} exclusive item{(collectionItems[activeCollection.id]?.length || 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700/50 transition-colors"
                onClick={() => setActiveCollection(null)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 bg-gradient-to-br from-gray-900/50 to-black/50 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              {collectionItems[activeCollection.id] && collectionItems[activeCollection.id].length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {collectionItems[activeCollection.id].map((item) => (
                    <div
                      key={item.id}
                      className="aspect-[4/5] rounded-xl overflow-hidden bg-gray-800 relative group cursor-pointer hover:shadow-2xl hover:shadow-pink-500/20 transition-all duration-300"
                      onClick={() => {
                        const items = collectionItems[activeCollection.id] || [];
                        const index = items.findIndex(i => i.id === item.id);
                        setViewingImage({ item, items, index });
                      }}
                    >
                      {item.media_type === 'video' ? (
                        <video
                          src={item.media_url}
                          className="w-full h-full object-cover"
                          controls
                          poster=""
                        />
                      ) : (
                        <img
                          src={item.media_url}
                          alt={item.title || 'Collection item'}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      {isOwnProfile && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCollectionItem(item.id, activeCollection.id);
                          }}
                          className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full backdrop-blur-sm transition-all duration-200 opacity-0 group-hover:opacity-100"
                          title="Delete Item"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="bg-gray-800/30 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <Folder className="h-10 w-10 text-gray-500" />
                  </div>
                  <p className="text-lg font-medium text-gray-300 mb-2">No content yet</p>
                  {isOwnProfile && (
                    <p className="text-sm text-gray-500">Use the Upload button on the collection card to add exclusive content.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserImageGallery;
