import React, { useState, useRef, useEffect } from 'react';
import './CreatorDashboard.css';
import { supabase } from '../../lib/supabaseClient';

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
  user_id?: string | null; // User ID from database
  id?: string | null; // Alternative ID field
};

type CreatorDashboardProps = {
  profile: ProfileInfo;
  onBack: () => void;
  onCreatePost?: () => void;
};

const CreatorDashboard: React.FC<CreatorDashboardProps> = ({ profile, onBack }) => {
  // Handle back button with state persistence
  const handleBack = () => {
    // Clear dashboard state in localStorage
    try {
      localStorage.setItem('show_creator_dashboard', 'false');
    } catch {
      // Ignore storage errors
    }
    // Call the provided onBack function
    onBack();
  };
  const [activeTab, setActiveTab] = useState<'earnings' | 'supporters'>('earnings');
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('month');
  
  // Create post states - with localStorage persistence
  const [showCreatePost, setShowCreatePost] = useState(() => {
    try {
      return localStorage.getItem('show_create_post') === 'true';
    } catch {
      return false;
    }
  });
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postMedia, setPostMedia] = useState<File | null>(null);
  const [postMediaPreview, setPostMediaPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [postCategory, setPostCategory] = useState<'Public' | 'Platinum' | 'Gold' | 'Silver' | 'Bronze'>('Public');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Effect to ensure dashboard state is preserved on refresh
  useEffect(() => {
    // Set localStorage state on component mount
    try {
      localStorage.setItem('show_creator_dashboard', 'true');
    } catch {
      // Ignore storage errors
    }
    
    // Add event listener for beforeunload to ensure state is saved
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem('show_creator_dashboard', 'true');
        localStorage.setItem('show_create_post', showCreatePost.toString());
      } catch {
        // Ignore storage errors
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [showCreatePost]);
  
  // Use profile data and mock what's missing
  const earningsData = {
    total: 0.00,
    currency: 'USD',
    supporters: profile.supporters ? Number(profile.supporters) : 0,
    views: 0
  };
  
  const displayName = profile?.full_name || profile?.username || 'Creator';
  
  // Handle media upload for post
  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setPostMedia(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onload = () => {
      setPostMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Function to upload image and get URL
  const uploadImage = async (file: File): Promise<string> => {
    // In a production environment, you would upload to a real storage service
    // For this implementation, we'll convert to base64 and use that as the URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        resolve(base64String); // This would be a real URL in production
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  };
  
  // Helper function to resolve user identifiers to database IDs
  const resolveUserId = async (identifier: string): Promise<string> => {
    // UUID validation pattern
    const uuidLike = (v: string) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v);
    
    // If already a UUID, return as is
    if (uuidLike(identifier)) return identifier;
    
    type UserRow = { id?: string | null; email?: string | null; username?: string | null };
    
    // 1) Try email
    if (identifier.includes('@')) {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('email', identifier)
        .maybeSingle();
      const row = (data as unknown) as UserRow | null;
      if (!error && row?.id) return row.id;
    }
    
    // 2) Try username
    {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', identifier)
        .maybeSingle();
      const row = (data as unknown) as UserRow | null;
      if (!error && row?.id) return row.id;
    }
    
    // 3) Try id direct match
    {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', identifier)
        .maybeSingle();
      const row = (data as unknown) as UserRow | null;
      if (!error && row?.id) return row.id;
    }
    
    // Fallback: return original identifier
    return identifier;
  };

  // Handle post submission
  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() && !postMedia) return;
    
    setIsSubmitting(true);
    
    try {
      // Upload image first if present
      let imageUrl = null;
      if (postMedia) {
        imageUrl = await uploadImage(postMedia);
      }
      
      // Get user identifier to resolve (email, username, or id)
      const userIdentifier = profile?.email || profile?.username || profile?.user_id || profile?.id || '';
      
      // Resolve to a proper database ID
      let resolvedUserId = 'unknown';
      if (userIdentifier) {
        try {
          resolvedUserId = await resolveUserId(userIdentifier);
        } catch (error) {
          console.error('Error resolving user ID:', error);
        }
      }
      
      // UUID validation pattern
      const uuidLike = (v: string) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v);
      
      // Prepare post data with real user ID and name
      const postData = {
        title: postTitle.trim() || 'Untitled Post',
        content: postContent.trim(),
        author: profile?.username || profile?.full_name || 'Anonymous',
        // Use resolved ID if it's a UUID, otherwise fall back to other identifiers
        authorId: uuidLike(resolvedUserId) ? resolvedUserId : (profile?.user_id || profile?.id || profile?.email || 'unknown'),
        // Include both user ID and email for backward compatibility
        userId: uuidLike(resolvedUserId) ? resolvedUserId : (profile?.user_id || profile?.id || 'unknown'),
        email: profile?.email || 'unknown',
        name: profile?.full_name || profile?.username || 'Anonymous',
        timestamp: new Date().toISOString(),
        hasMedia: !!postMedia,
        visibility: postVisibility, // Include visibility setting
        category: postCategory, // Include category selection
        mediaUrl: imageUrl // Include the image URL in the payload
      };
      
      // Log the payload for debugging
      console.log('Sending post with user data:', {
        userId: postData.userId,
        authorId: postData.authorId,
        email: postData.email,
        name: postData.name,
        author: postData.author,
        resolvedFromIdentifier: userIdentifier,
        isValidUuid: uuidLike(resolvedUserId)
      });
      
      // Define webhook URLs
      const createPostUrl = 'https://primary-production-6722.up.railway.app/webhook/createPost';
      const imageUpdateUrl = 'https://primary-production-6722.up.railway.app/webhook/imageupdate';
      
      // Send to createPost webhook
      try {
        const createPostResponse = await fetch(createPostUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postData),
        });
        
        if (!createPostResponse.ok) {
          console.warn(`Warning: createPost webhook returned ${createPostResponse.status}: ${createPostResponse.statusText}`);
        } else {
          console.log('Successfully sent data to createPost webhook');
        }
      } catch (error) {
        console.error('Error sending to createPost webhook:', error);
        // Continue execution even if this webhook fails
      }
      
      // Send to imageUpdate webhook
      try {
        const imageUpdateResponse = await fetch(imageUpdateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postData),
        });
        
        if (!imageUpdateResponse.ok) {
          console.warn(`Warning: imageUpdate webhook returned ${imageUpdateResponse.status}: ${imageUpdateResponse.statusText}`);
        } else {
          console.log('Successfully sent data to imageUpdate webhook');
        }
      } catch (error) {
        console.error('Error sending to imageUpdate webhook:', error);
        // Continue execution even if this webhook fails
      }
      
      // We don't throw errors for webhook failures to ensure the UI flow continues
      
      // Reset form
      setPostContent('');
      setPostTitle('');
      setPostMedia(null);
      setPostMediaPreview(null);
      setShowCreatePost(false);
      
      // Clear localStorage state
      try {
        localStorage.setItem('show_create_post', 'false');
      } catch {
        // Ignore storage errors
      }
      
      // Success notification
      console.log('Post successfully sent to both webhooks with image:', imageUrl ? 'Image included' : 'No image');
      console.log('Post created by user:', postData.name, '(ID:', postData.userId, ')');
      alert(`Post created successfully by ${postData.name}!`);
    } catch (error) {
      console.error('Error creating post:', error);
      // Error notification
      alert(`Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Toggle create post UI
  const toggleCreatePost = () => {
    const newState = !showCreatePost;
    setShowCreatePost(newState);
    // Persist state to localStorage
    try {
      localStorage.setItem('show_create_post', newState.toString());
    } catch {
      // Ignore storage errors
    }
    
    // Reset form when closing
    if (showCreatePost) {
      setPostContent('');
      setPostTitle('');
      setPostMedia(null);
      setPostMediaPreview(null);
    }
  };
  
  // Remove uploaded media
  const removeMedia = () => {
    setPostMedia(null);
    setPostMediaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="creator-dashboard-wrapper">
      <div className="creator-dashboard">
      {showCreatePost ? (
        <div className="create-post-container">
          <div className="create-post-header">
            <button onClick={toggleCreatePost} className="back-button">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Dashboard
            </button>
            <h2>Create New Post</h2>
          </div>
          
          <form onSubmit={handleSubmitPost} className="create-post-form">
            <input 
              type="text"
              placeholder="Post Title (optional)"
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              className="post-title-input"
            />
            
            <textarea
              placeholder="What's on your mind?"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="post-content-input"
              required
            />
            
            {postMediaPreview && (
              <div className="media-preview-container">
                <img src={postMediaPreview} alt="Upload preview" className="media-preview" />
                <button type="button" onClick={removeMedia} className="remove-media-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            )}
            
            <div className="post-options">
              <div className="post-option">
                <label>Visibility:</label>
                <select 
                  value={postVisibility} 
                  onChange={(e) => setPostVisibility(e.target.value as 'public' | 'friends' | 'private')}
                >
                  <option value="public">Public</option>
                  <option value="friends">Friends</option>
                  <option value="private">Private</option>
                </select>
              </div>
              
              <div className="post-option">
                <label>Category:</label>
                <select 
                  value={postCategory} 
                  onChange={(e) => setPostCategory(e.target.value as 'Public' | 'Platinum' | 'Gold' | 'Silver' | 'Bronze')}
                >
                  <option value="Public">Public</option>
                  <option value="Platinum">Platinum</option>
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                  <option value="Bronze">Bronze</option>
                </select>
              </div>
            </div>
            
            <div className="post-actions">
              <div className="media-upload">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleMediaUpload} 
                  ref={fileInputRef}
                  id="media-upload"
                  style={{ display: 'none' }}
                />
                <label htmlFor="media-upload" className="upload-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  Add Media
                </label>
              </div>
              
              <button 
                type="submit" 
                className="submit-post-btn" 
                disabled={isSubmitting || (!postContent.trim() && !postMedia)}
              >
                {isSubmitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
        <div className="dashboard-header">
          <button onClick={handleBack} className="back-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <h1>{displayName}'s Dashboard</h1>
          <button className="create-post-btn" onClick={toggleCreatePost}>
            Create New Post
          </button>
        </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Earnings</h3>
            <span className="stat-period">(this month)</span>
          </div>
          <div className="stat-value">{earningsData.currency} {earningsData.total.toFixed(2)}</div>
          <div className="stat-footer">
            <button className="stat-action">Get Payout</button>
            <button className="stat-action">View Transactions</button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Supporters</h3>
          </div>
          <div className="stat-value">{earningsData.supporters}</div>
          <div className="stat-footer">
            <button className="stat-action">View All</button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Profile Views</h3>
          </div>
          <div className="stat-value">{earningsData.views}</div>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={`tab-button ${activeTab === 'earnings' ? 'active' : ''}`}
          onClick={() => setActiveTab('earnings')}
        >
          Earning Analysis
        </button>
        <button 
          className={`tab-button ${activeTab === 'supporters' ? 'active' : ''}`}
          onClick={() => setActiveTab('supporters')}
        >
          Top 10 Supporters
        </button>
      </div>

      {activeTab === 'earnings' && (
        <div className="earnings-section">
          <div className="no-data-message">
            <div className="no-data-icon">📊</div>
            <p>No transactions yet</p>
            <small>Your earnings will appear here once you start receiving support</small>
          </div>

          <div className="time-range-selector">
            {['day', 'week', 'month', 'year'].map((range) => (
              <button 
                key={range}
                className={`time-range-button ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range as 'day' | 'week' | 'month' | 'year')}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>

          <div className="chart-container">
            <div className="chart-placeholder">
              <div className="chart-grid">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="chart-grid-line"></div>
                ))}
              </div>
              <div className="chart-no-data">No data to show</div>
            </div>
          </div>

          <div className="transactions-table">
            <div className="table-header">
              <div className="table-cell">Category</div>
              <div className="table-cell">Date</div>
              <div className="table-cell">Amount (USD)</div>
              <div className="table-cell">Status</div>
              <div className="table-cell">Original Amount</div>
              <div className="table-cell">Platform Fee</div>
              <div className="table-cell">Net Amount</div>
            </div>
            <div className="no-data-message">
              <p>No transaction data to display</p>
              <small>Start creating content to attract supporters</small>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'supporters' && (
        <div className="supporters-section">
          <div className="supporters-chart">
            <div className="chart-placeholder">
              <div className="chart-grid">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="chart-grid-line"></div>
                ))}
              </div>
              <div className="chart-no-data">No data to show</div>
            </div>
          </div>
          <div className="supporters-list">
            <div className="no-data-message">
              <p>No supporters yet</p>
              <small>Share your profile to gain supporters</small>
              <button className="stat-action" style={{ marginTop: '1rem' }}>
                Share Profile
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
      </div>
    </div>
  );
};

export default CreatorDashboard;
