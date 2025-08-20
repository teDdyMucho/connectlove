import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { X, Heart, MessageSquare, Share2, Lock } from 'lucide-react';

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

type PostModalProps = {
  post: PostWithMedia | null;
  onClose: () => void;
  currentImageIndex?: number;
};

const PostModal: React.FC<PostModalProps> = ({ post, onClose, currentImageIndex = 0 }) => {
  const [activeImageIndex, setActiveImageIndex] = React.useState(currentImageIndex);
  
  // Format time ago (e.g., "2 hours ago", "5 minutes ago")
  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };
  
  // Handle keyboard events for navigation and closing
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && post?.media_urls && activeImageIndex < post.media_urls.length - 1) {
        setActiveImageIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft' && post?.media_urls && activeImageIndex > 0) {
        setActiveImageIndex(prev => prev - 1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, post, activeImageIndex]);
  
  // Prevent body scrolling when modal is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  if (!post) return null;
  
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      {/* Modal Content */}
      <div 
        className="bg-white rounded-lg sm:rounded-xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col md:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* Left side - Image */}
        <div className="relative bg-black flex-1 min-h-[300px] md:min-h-[500px] flex items-center justify-center">
          {post.media_urls && post.media_urls.length > 0 && (
            <img 
              src={post.media_urls[activeImageIndex]} 
              alt={post.title || 'Post image'} 
              className="max-h-[70vh] max-w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x400?text=Image+not+available';
              }}
            />
          )}
          
          {/* Image navigation arrows */}
          {post.media_urls && post.media_urls.length > 1 && (
            <>
              {activeImageIndex > 0 && (
                <button 
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 rounded-full p-1 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImageIndex(prev => prev - 1);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              
              {post.media_urls && activeImageIndex < post.media_urls.length - 1 && (
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 rounded-full p-1 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImageIndex(prev => prev + 1);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )}
              
              {/* Image counter */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {activeImageIndex + 1} / {post.media_urls.length}
              </div>
            </>
          )}
        </div>
        
        {/* Right side - Post content */}
        <div className="w-full md:w-[350px] flex flex-col">
          {/* Header */}
          <div className="p-3 sm:p-4 flex items-center border-b border-gray-200">
            <div className="w-8 h-8 rounded-full bg-gray-200 mr-2 overflow-hidden">
              <img 
                src={localStorage.getItem('avatar_url') || 'https://i.pravatar.cc/150'} 
                alt="User avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://i.pravatar.cc/150';
                }}
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm leading-tight truncate">
                {localStorage.getItem('full_name') || localStorage.getItem('username') || 'Anonymous'}
              </h3>
              <p className="text-xs text-gray-600">{formatTimeAgo(post.created_at)}</p>
            </div>
            {post.category && (
              <div className="ml-auto">
                <span className="bg-primary text-xs text-white px-2 py-1 rounded-full">
                  {post.category}
                </span>
              </div>
            )}
            <button 
              onClick={onClose}
              className="ml-2 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-3 sm:p-4 flex-1 overflow-y-auto">
            {post.title && (
              <h3 className="font-medium text-base sm:text-lg mb-2">{post.title}</h3>
            )}
            <p className="text-sm sm:text-base leading-relaxed">{post.content}</p>
          </div>
          
          {/* Actions */}
          <div className="px-3 sm:px-4 py-3 border-t border-gray-200 flex items-center">
            <button className="flex items-center text-gray-600 hover:text-primary mr-4 transition-colors">
              <Heart className="h-5 w-5 mr-1" />
              <span className="text-sm">{post.likes_count || 0}</span>
            </button>
            <button className="flex items-center text-gray-600 hover:text-primary mr-4 transition-colors">
              <MessageSquare className="h-5 w-5 mr-1" />
              <span className="text-sm">{post.comments_count || 0}</span>
            </button>
            <button className="flex items-center text-gray-600 hover:text-primary transition-colors">
              <Share2 className="h-5 w-5 mr-1" />
              <span className="text-sm">Share</span>
            </button>
            {post.visibility !== 'public' && (
              <span className="ml-auto text-xs text-primary font-medium flex items-center">
                <Lock className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostModal;
