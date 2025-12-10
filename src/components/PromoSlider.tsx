import React, { useState, useEffect, useRef } from 'react';

export interface PromoSlide {
  id: number;
  type: 'giveaway' | 'challenge' | 'featured' | 'news' | 'banner' | 'fullimage';
  image?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  badgeColor?: string;
  buttonText?: string;
  buttonLink?: string;
  profiles?: {
    username: string;
    avatar: string;
    rating?: number;
    category?: string;
  }[];
  mechanics?: string[];
  prizes?: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
}

interface PromoSliderProps {
  slides: PromoSlide[];
  autoplaySpeed?: number;
  onAction?: (action: string, slideId: number) => void;
}

const PromoSlider: React.FC<PromoSliderProps> = ({ 
  slides, 
  autoplaySpeed = 5000,
  onAction
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle automatic slide transition
  useEffect(() => {
    if (slideTimerRef.current) {
      clearTimeout(slideTimerRef.current);
    }
    
    slideTimerRef.current = setTimeout(() => {
      goToNextSlide();
    }, autoplaySpeed);
    
    return () => {
      if (slideTimerRef.current) {
        clearTimeout(slideTimerRef.current);
      }
    };
  }, [currentSlide, autoplaySpeed]);

  const goToSlide = (index: number) => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setCurrentSlide(index);
    
    // Reset animation flag after transition completes
    setTimeout(() => {
      setIsAnimating(false);
    }, 500); // Match this with CSS transition duration
  };

  const goToNextSlide = () => {
    const nextSlide = (currentSlide + 1) % slides.length;
    goToSlide(nextSlide);
  };

  const goToPrevSlide = () => {
    const prevSlide = (currentSlide - 1 + slides.length) % slides.length;
    goToSlide(prevSlide);
  };
  
  const handleAction = (action: string, slideId: number) => {
    if (onAction) {
      onAction(action, slideId);
    }
  };

  // Render different slide types
  const renderSlide = (slide: PromoSlide) => {
    switch (slide.type) {
      case 'fullimage':
        return renderFullImageSlide(slide);
      case 'giveaway':
        return renderGiveawaySlide(slide);
      case 'challenge':
        return renderChallengeSlide(slide);
      case 'featured':
        return renderFeaturedCreatorsSlide(slide);
      case 'news':
        return renderNewsSlide(slide);
      case 'banner':
        return renderBannerSlide(slide);
      default:
        return renderDefaultSlide(slide);
    }
  };

  // Giveaway slide (like the pink OnlyFans giveaway)
  const renderGiveawaySlide = (slide: PromoSlide) => {
    const bgColor = slide.backgroundColor || 'bg-pink-500';
    
    return (
      <div className={`${bgColor} w-full h-full relative overflow-hidden p-4`}>
        {/* Decorative elements */}
        <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-white opacity-30"></div>
        <div className="absolute top-6 right-8 w-3 h-3 rounded-full bg-white opacity-20"></div>
        <div className="absolute bottom-8 left-10 w-5 h-5 rounded-full bg-white opacity-20"></div>
        <div className="absolute top-1/4 right-1/4 w-6 h-6 rounded-full bg-white opacity-10"></div>
        
        {/* Main content */}
        <div className="flex flex-col h-full">
          <div className="text-right mb-2">
            <h2 className="text-white text-3xl font-bold tracking-tight leading-none">
              {slide.title.split(' ').map((word, i) => (
                <div key={i} className={`inline-block ${i > 0 ? 'ml-2' : ''}`}>
                  {word}
                </div>
              ))}
            </h2>
          </div>
          
          <div className="flex-1 flex">
            <div className="w-1/2 pr-2">
              <h3 className="text-white text-lg font-medium mb-2">{slide.subtitle}</h3>
              <div className="bg-white/20 rounded-lg p-3">
                <h4 className="text-white font-medium mb-1 uppercase text-sm">Mechanics:</h4>
                <ul className="text-white text-xs space-y-1">
                  {slide.mechanics?.map((item, i) => (
                    <li key={i} className="flex items-start">
                      <span className="mr-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                
                <h4 className="text-white font-medium mt-3 mb-1 uppercase text-sm">Prize:</h4>
                <ul className="text-white text-xs space-y-1">
                  {slide.prizes?.map((item, i) => (
                    <li key={i} className="flex items-start">
                      <span className="mr-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="w-1/2 relative">
              {slide.image && (
                <img 
                  src={slide.image} 
                  alt="Creator" 
                  className="absolute bottom-0 right-0 h-48 object-contain"
                />
              )}
              <div className="absolute top-4 left-0">
                <div className="bg-red-500 text-white rounded-full px-3 py-1 text-sm font-bold animate-pulse">
                  ❤️ 1M
                </div>
              </div>
              <div className="absolute top-16 left-4">
                <div className="bg-white text-gray-800 rounded-full px-3 py-1 text-sm font-bold">
                  👍 36k
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-2">
            <button 
              onClick={() => handleAction('join_giveaway', slide.id)}
              className="bg-white hover:bg-gray-100 text-pink-600 font-bold py-2 px-4 rounded-lg w-full transition-colors"
            >
              {slide.buttonText || 'Join Giveaway'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Challenge slide (like the Ultimate Giveaway Challenge)
  const renderChallengeSlide = (slide: PromoSlide) => {
    const bgColor = slide.backgroundColor || 'bg-purple-500';
    
    return (
      <div 
        className={`${bgColor} w-full h-full relative overflow-hidden p-4`}
        style={slide.backgroundImage ? {
          backgroundImage: `url(${slide.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/90 to-pink-500/90"></div>
        
        <div className="relative z-10">
          <h2 className="text-white text-3xl font-bold italic mb-3 text-center">
            {slide.title}
          </h2>
          
          {slide.table && (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg overflow-hidden mb-3">
              <table className="w-full text-white text-sm">
                <thead>
                  <tr className="bg-white/30">
                    {slide.table.headers.map((header, i) => (
                      <th key={i} className="py-2 px-3 text-left font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slide.table.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white/10' : ''}>
                      {row.map((cell, j) => (
                        <td key={j} className="py-2 px-3">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="flex justify-between items-end">
            <button 
              onClick={() => handleAction('join_challenge', slide.id)}
              className="bg-white hover:bg-gray-100 text-purple-600 font-bold py-2 px-4 rounded-lg transition-colors"
            >
              {slide.buttonText || 'Join Challenge'}
            </button>
            
            {slide.image && (
              <img 
                src={slide.image} 
                alt="Challenge Prize" 
                className="h-24 object-contain"
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  // Featured creators slide (like the gold/black creators showcase)
  const renderFeaturedCreatorsSlide = (slide: PromoSlide) => {
    const bgColor = slide.backgroundColor || 'bg-gradient-to-b from-amber-700 to-gray-900';
    
    return (
      <div 
        className={`${bgColor} w-full h-full relative overflow-hidden p-4`}
        style={slide.backgroundImage ? {
          backgroundImage: `url(${slide.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        <div className="flex flex-col h-full">
          <div className="text-center mb-4">
            <h3 className="text-white text-lg font-medium">{slide.subtitle}</h3>
            <h2 className="text-white text-2xl font-bold">{slide.title}</h2>
          </div>
          
          {slide.profiles && slide.profiles.length > 0 && (
            <div className="flex-1 flex flex-col items-center">
              {/* Main featured profile */}
              <div className="mb-4">
                <div className="relative inline-block">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 p-1 transform scale-110 animate-pulse-slow"></div>
                  <img 
                    src={slide.profiles[0].avatar} 
                    alt={slide.profiles[0].username} 
                    className="w-20 h-20 rounded-full object-cover border-2 border-white relative z-10"
                  />
                </div>
                <div className="text-center mt-1">
                  <p className="text-white font-medium text-sm">@{slide.profiles[0].username}</p>
                  <div className="flex justify-center">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className="text-yellow-400 text-xs">★</span>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Other profiles */}
              <div className="flex justify-center space-x-4">
                {slide.profiles.slice(1, 5).map((profile, i) => (
                  <div key={i} className="text-center">
                    <div className="relative inline-block">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 p-0.5 transform scale-110"></div>
                      <img 
                        src={profile.avatar} 
                        alt={profile.username} 
                        className="w-14 h-14 rounded-full object-cover border-2 border-white relative z-10"
                      />
                    </div>
                    <p className="text-white text-xs mt-1">@{profile.username}</p>
                    <div className="flex justify-center">
                      {[...Array(5)].map((_, j) => (
                        <span key={j} className="text-yellow-400 text-xs">★</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-3">
            <button 
              onClick={() => handleAction('view_featured', slide.id)}
              className="bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-gray-900 font-bold py-2 px-4 rounded-lg w-full transition-colors"
            >
              {slide.buttonText || 'View Top Creators'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // News style slide (like Microsoft News)
  const renderNewsSlide = (slide: PromoSlide) => {
    return (
      <div className="bg-gray-900 w-full h-full relative overflow-hidden">
        {slide.image && (
          <div className="h-1/2 overflow-hidden">
            <img 
              src={slide.image} 
              alt={slide.title} 
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className="p-4">
          <div className="flex items-center mb-2">
            <div className="bg-yellow-500 rounded-full w-4 h-4 mr-2"></div>
            <span className="text-yellow-500 text-sm font-medium">Trending</span>
          </div>
          
          <h2 className="text-white text-xl font-bold mb-2">{slide.title}</h2>
          {slide.description && (
            <p className="text-gray-300 text-sm mb-3">{slide.description}</p>
          )}
          
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <button className="text-gray-400 mr-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
              </button>
              <span className="text-gray-400 text-sm">32</span>
            </div>
            
            <button 
              onClick={() => handleAction('read_news', slide.id)}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              Read More →
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Banner style slide (like Shopee)
  const renderBannerSlide = (slide: PromoSlide) => {
    const bgColor = slide.backgroundColor || 'bg-red-600';
    
    return (
      <div 
        className={`${bgColor} w-full h-full relative overflow-hidden`}
        style={slide.backgroundImage ? {
          backgroundImage: `url(${slide.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        <div className="absolute inset-0 flex items-center p-4">
          <div className="w-2/3">
            <div className="mb-2">
              <span className="bg-white text-red-600 text-xs font-bold px-2 py-0.5 rounded-sm">HOT DEAL</span>
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">{slide.title}</h2>
            {slide.description && (
              <p className="text-white text-sm mb-3">{slide.description}</p>
            )}
            
            <button 
              onClick={() => handleAction('get_offer', slide.id)}
              className="bg-white hover:bg-gray-100 text-red-600 font-bold py-1.5 px-4 rounded-full text-sm transition-colors"
            >
              {slide.buttonText || 'Get Offer'}
            </button>
          </div>
          
          {slide.image && (
            <div className="w-1/3 flex justify-center items-center">
              <img 
                src={slide.image} 
                alt="Promotion" 
                className="max-h-32 object-contain animate-bounce-slow"
              />
            </div>
          )}
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-2 right-2">
          <div className="bg-yellow-300 text-red-600 rounded-full px-3 py-1 text-xs font-bold transform rotate-12">
            GET A SURPRISE!
          </div>
        </div>
      </div>
    );
  };

  // Full image slide (for pre-designed promotional images)
  const renderFullImageSlide = (slide: PromoSlide) => {
    return (
      <div className="relative w-full h-full">
        {slide.image && (
          <img 
            src={slide.image} 
            alt={slide.title} 
            className="w-full h-full object-cover"
          />
        )}
        
        {/* Optional button at the bottom */}
        {slide.buttonText && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <button 
              onClick={() => handleAction('join_fullimage', slide.id)}
              className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-6 rounded-full text-lg transition-all hover:shadow-[0_8px_26px_rgba(255,90,136,0.35)]">
              {slide.buttonText}
            </button>
          </div>
        )}
      </div>
    );
  };
  
  // Default slide (fallback)
  const renderDefaultSlide = (slide: PromoSlide) => {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
        {slide.image && (
          <img 
            src={slide.image} 
            alt={slide.title} 
            className="w-full h-48 object-cover"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
          {slide.badge && (
            <div className={`${slide.badgeColor || 'bg-primary/20'} text-xs inline-block px-2 py-1 rounded-full mb-1`}>
              {slide.badge}
            </div>
          )}
          <h3 className="text-white text-lg font-bold">{slide.title}</h3>
          {slide.description && (
            <p className="text-gray-200 text-sm">{slide.description}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="promo-slider relative">
      <div className="relative overflow-hidden rounded-lg">
        <div 
          className="promo-slides flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {slides.map((slide) => (
            <div key={slide.id} className="promo-slide w-full flex-shrink-0 h-[620px]">
              {renderSlide(slide)}
            </div>
          ))}
        </div>
        
        {/* Navigation arrows */}
        <button 
          onClick={goToPrevSlide}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white z-30 hover:bg-black/50 transition-colors"
          aria-label="Previous slide"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <button 
          onClick={goToNextSlide}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white z-30 hover:bg-black/50 transition-colors"
          aria-label="Next slide"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        {/* Slider Navigation Dots */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center space-x-2 z-30">
          {slides.map((_, index) => (
            <button 
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-opacity ${
                index === currentSlide ? 'bg-white opacity-100' : 'bg-white opacity-50'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            ></button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromoSlider;
