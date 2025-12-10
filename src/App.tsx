import { Heart, ArrowLeft, MessageCircle, Shield, Users } from 'lucide-react';
import SignUpForm from './components/SignUpForm';
import SignInPage from './components/SignInPage';
import MainPage from './landingPage/mainPage';
import Creator from './creatorAccount/creator';
import Messages from './messages/messages';
import { AuthProvider, useAuth } from './components/AuthContext';
import { Page } from './components/types';
import UserProfile from './components/userProfile/userProfile';
import SearchProfile from './landingPage/serachProfile';

function AppContent() {
  const { currentPage, userType, navigateTo, setUserTypeValue } = useAuth();

  const Header = () => (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center cursor-pointer" onClick={() => navigateTo('landing')}>
            <img src="/images/Clove_logo2.png" alt="ConnectLove Logo" className="h-15 w-40" />
          </div>
          <nav className="hidden md:flex space-x-8">
            <a href="#" className="text-gray-600 hover:text-primary transition-colors">Features</a>
            <a href="#" className="text-gray-600 hover:text-primary transition-colors">How it Works</a>
            <a href="#" className="text-gray-600 hover:text-primary transition-colors">Pricing</a>
          </nav>
          <button 
            onClick={() => navigateTo('signin')}
            className="bg-primary text-white px-6 py-2 rounded-full hover:bg-primary-dark transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    </header>
  );

  const LandingPage = () => (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-background to-light-accent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6" style={{ fontFamily: '"COM4t Drify", sans-serif' }}>
            Connect <span className="text-primary">Creators</span> and{' '}
            <span className="text-primary">Supporters</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            A vibrant online platform where creative minds meet their biggest fans. 
            Build meaningful connections through shared passions and mutual support.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => {setUserTypeValue('supporter'); navigateTo('signup');}}
              className="bg-white text-primary border-2 border-primary px-8 py-4 rounded-full text-lg font-semibold hover:bg-primary hover:text-white transform hover:scale-105 transition-all"
            >
              Join as Supporter
            </button>
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Choose ConnectLove?</h2>
          <p className="text-xl text-gray-600 mb-16">Experience dating differently with our unique approach</p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-background p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <MessageCircle className="h-16 w-16 text-primary mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Real Time Messaging</h3>
              <p className="text-gray-600">Connect instantly with our seamless chat system. Share your thoughts, dreams, and create meaningful conversations.</p>
            </div>
            
            <div className="bg-background p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <Users className="h-16 w-16 text-primary mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Creator Supporter Matching</h3>
              <p className="text-gray-600">Our unique system connects talented creators with those who appreciate and want to support their journey.</p>
            </div>
            
            <div className="bg-background p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <Shield className="h-16 w-16 text-primary mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Safe & Secure</h3>
              <p className="text-gray-600">Your privacy and safety are our top priorities. Secure and verified profiles ensure a trustworthy experience.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-gray-900 text-center mb-4">How It Works</h2>
          <p className="text-xl text-gray-600 text-center mb-16">Simple steps to find your perfect match</p>
          
          <div className="grid md:grid-cols-2 gap-12">
            {/* For Creators */}
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <h3 className="text-2xl font-bold text-primary mb-8">For Creators</h3>
              <div className="space-y-6">
                <div className="flex items-start">
                  <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 mt-1">1</div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Create Your Profile</h4>
                    <p className="text-gray-600">Showcase your creative work, interests, and personality</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 mt-1">2</div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Share Messages</h4>
                    <p className="text-gray-600">Get messages from supporters who appreciate your work and interests</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 mt-1">3</div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Build Connections</h4>
                    <p className="text-gray-600">Connect and communicate with those who share your vision</p>
                  </div>
                </div>
              </div>
            </div>

            {/* For Supporters */}
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <h3 className="text-2xl font-bold text-primary mb-8">For Supporters</h3>
              <div className="space-y-6">
                <div className="flex items-start">
                  <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 mt-1">1</div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Browse Creators</h4>
                    <p className="text-gray-600">Discover amazing creative minds and their incredible work</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 mt-1">2</div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Send Messages</h4>
                    <p className="text-gray-600">Reach out and start conversations with creators you admire</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mr-4 mt-1">3</div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Get Live</h4>
                    <p className="text-gray-600">Engage with creators based on shared interests and mutual support</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Ready to Find Your Perfect Match?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of creators and supporters who have found meaningful connections on our platform
          </p>
          <button 
            onClick={() => navigateTo('signup')}
            className="bg-primary text-white px-12 py-4 rounded-full text-xl font-semibold hover:bg-primary-dark transform hover:scale-105 transition-all"
          >
            Start Your Journey
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center mb-8">
            <img src="/images/Clove_logo2.png" alt="ConnectLove Logo" className="h-15 w-40" />
          </div>
          <div className="flex justify-center space-x-8 mb-8">
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-center text-gray-400"> 2025 ConnectLove. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );

  const SignUpPage = () => (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <button 
            onClick={() => navigateTo('landing')}
            className="flex items-center text-primary hover:text-primary-dark transition-colors mb-8"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Home
          </button>
          
          <div className="flex items-center justify-center mb-8">
            <img src="/images/Clove_logo2.png" alt="ConnectLove Logo" className="h-40 w-60" />
          </div>
          
          {/* User Type Toggle */}
          <div className="flex bg-background rounded-lg p-1 mb-8">
            <button
              onClick={() => setUserTypeValue('supporter')}
              className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
                userType === 'supporter' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Heart className="h-4 w-4 inline mr-2" />
              Supporter
            </button>
          </div>
          
          <SignUpForm userType={userType} navigateTo={navigateTo} />
        </div>
      </div>
    </div>
  );

  const renderPage = () => {
    // Create a type-safe wrapper for navigation
    const safeNavigate = (page: string) => {
      // Only navigate to valid pages
      if (['landing', 'signin', 'signup', 'main', 'creator', 'profile', 'messages', 'search', ''].includes(page)) {
        // Type assertion to Page type
        navigateTo(page as Page);
      } else {
        console.warn(`Attempted to navigate to invalid page: ${page}`);
      }
    };
    
    switch (currentPage) {
      case 'landing':
        return <LandingPage />;
      case 'signin':
        return <SignInPage navigateTo={safeNavigate} />;
      case 'signup':
        return <SignUpPage />;
      case 'main':
        return <MainPage navigateTo={safeNavigate} />;
      case 'creator':
        return <Creator navigateTo={safeNavigate} />;
      case 'profile':
        return <UserProfile />;
      case 'messages':
        return <Messages navigateTo={safeNavigate} />;
      case 'search':
        return <SearchProfile navigateTo={safeNavigate} />;
      default:
        return <LandingPage />;
    }
  };

  return renderPage();
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;