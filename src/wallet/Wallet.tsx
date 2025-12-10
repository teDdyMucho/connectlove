import React, { useState } from 'react';
import { 
  Wallet as WalletIcon, 
  CreditCard, 
  Gift, 
  TrendingUp, 
  Star, 
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Award,
  ArrowLeft
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'earned' | 'spent' | 'purchased';
  amount: number;
  description: string;
  date: string;
  icon: 'tip' | 'subscription' | 'purchase' | 'reward' | 'bonus';
}

interface PointsPackage {
  id: string;
  points: number;
  price: number;
  bonus: number;
  popular?: boolean;
}

interface WalletProps {
  navigateTo?: (page: string) => void;
}

const Wallet: React.FC<WalletProps> = ({ navigateTo }) => {
  const [currentPoints] = useState(2450);
  const [totalEarned] = useState(15680);
  const [totalSpent] = useState(13230);
  const [activeTab, setActiveTab] = useState<'overview' | 'buy' | 'history'>('overview');

  const [transactions] = useState<Transaction[]>([
    {
      id: '1',
      type: 'earned',
      amount: 500,
      description: 'Tip from @user123',
      date: '2024-12-11T10:30:00Z',
      icon: 'tip'
    },
    {
      id: '2',
      type: 'spent',
      amount: -200,
      description: 'Premium content unlock',
      date: '2024-12-10T15:45:00Z',
      icon: 'purchase'
    },
    {
      id: '3',
      type: 'earned',
      amount: 1000,
      description: 'Monthly subscription',
      date: '2024-12-09T09:15:00Z',
      icon: 'subscription'
    },
    {
      id: '4',
      type: 'earned',
      amount: 250,
      description: 'Daily login bonus',
      date: '2024-12-08T08:00:00Z',
      icon: 'bonus'
    },
    {
      id: '5',
      type: 'purchased',
      amount: 2000,
      description: 'Points purchase',
      date: '2024-12-07T14:20:00Z',
      icon: 'purchase'
    }
  ]);

  const pointsPackages: PointsPackage[] = [
    { id: '1', points: 1000, price: 9.99, bonus: 0 },
    { id: '2', points: 2500, price: 24.99, bonus: 100, popular: true },
    { id: '3', points: 5000, price: 49.99, bonus: 300 },
    { id: '4', points: 10000, price: 99.99, bonus: 1000 },
  ];

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  const getTransactionIcon = (icon: string) => {
    const iconClass = "w-5 h-5";
    switch (icon) {
      case 'tip':
        return <Gift className={iconClass} />;
      case 'subscription':
        return <Star className={iconClass} />;
      case 'purchase':
        return <CreditCard className={iconClass} />;
      case 'reward':
        return <Award className={iconClass} />;
      case 'bonus':
        return <TrendingUp className={iconClass} />;
      default:
        return <WalletIcon className={iconClass} />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'earned':
        return 'text-green-400';
      case 'spent':
        return 'text-red-400';
      case 'purchased':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="wallet-page bg-gradient-to-br from-gray-900 via-black to-gray-900 min-h-screen text-gray-100">
      {/* Header Bar */}
      <div className="bg-black/20 backdrop-blur-xl border-b border-pink-500/20 shadow-lg shadow-pink-500/10 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {/* Back Button */}
              <button
                onClick={() => navigateTo?.('main')}
                className="flex items-center text-gray-300 hover:text-pink-400 transition-all mr-6 p-2 rounded-xl hover:bg-gray-800/50 hover:scale-105"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                <span className="text-sm font-medium">Back to Feed</span>
              </button>
              
              {/* ConnectLove Branding */}
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl flex items-center justify-center mr-3">
                  <WalletIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text">
                    ConnectLove Wallet
                  </h1>
                  <p className="text-xs text-gray-400">Points & Rewards System</p>
                </div>
              </div>
            </div>
            
            {/* User Balance Badge */}
            <div className="bg-gradient-to-r from-pink-500/20 to-purple-500/20 backdrop-blur-sm rounded-full px-4 py-2 border border-pink-500/30">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-pink-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-pink-300">{currentPoints.toLocaleString()} Points</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-6xl mx-auto p-4 sm:p-6">

        {/* Welcome Section */}
        <div className="mb-8 mt-6">
          <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-pink-500/10 backdrop-blur-xl rounded-3xl p-6 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-transparent bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-clip-text mb-2">
                Welcome to ConnectLove Rewards
              </h2>
              <p className="text-gray-300 mb-6">Earn points by supporting creators, unlock exclusive content, and enjoy premium features</p>
              
              {/* Main Balance Display */}
              <div className="bg-gradient-to-r from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-4">
                <div className="text-center">
                  <div className="text-sm text-pink-300 font-medium mb-2">Your Balance</div>
                  <div className="text-4xl sm:text-5xl font-bold text-white mb-2">
                    {currentPoints.toLocaleString()}
                  </div>
                  <div className="text-pink-400 font-medium">ConnectLove Points</div>
                </div>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-xl p-4 border border-green-500/30">
                  <div className="flex items-center justify-center mb-2">
                    <ArrowUpRight className="w-5 h-5 text-green-400 mr-2" />
                    <span className="text-sm text-green-300 font-medium">Total Earned</span>
                  </div>
                  <div className="text-xl font-bold text-white">{totalEarned.toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm rounded-xl p-4 border border-blue-500/30">
                  <div className="flex items-center justify-center mb-2">
                    <ArrowDownLeft className="w-5 h-5 text-blue-400 mr-2" />
                    <span className="text-sm text-blue-300 font-medium">Total Spent</span>
                  </div>
                  <div className="text-xl font-bold text-white">{totalSpent.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 flex justify-center">
          <div className="bg-gradient-to-r from-gray-900/90 to-gray-800/90 backdrop-blur-xl rounded-2xl p-2 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
            <div className="flex space-x-1">
              <button
                className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 ${
                  activeTab === 'overview'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/40 scale-105'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                }`}
                onClick={() => setActiveTab('overview')}
              >
                <div className="flex items-center space-x-2">
                  <WalletIcon className="w-4 h-4" />
                  <span>Overview</span>
                </div>
              </button>
              <button
                className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 ${
                  activeTab === 'buy'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/40 scale-105'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                }`}
                onClick={() => setActiveTab('buy')}
              >
                <div className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Buy Points</span>
                </div>
              </button>
              <button
                className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/40 scale-105'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                }`}
                onClick={() => setActiveTab('history')}
              >
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span>History</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* ConnectLove Features */}
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-3xl p-8 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-2">ConnectLove Features</h3>
                <p className="text-gray-400">Use your points to unlock amazing experiences</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button className="group flex flex-col items-center p-6 rounded-2xl bg-gradient-to-br from-pink-500/10 to-purple-500/10 hover:from-pink-500/20 hover:to-purple-500/20 border border-pink-500/30 transition-all hover:scale-110 hover:shadow-lg hover:shadow-pink-500/25">
                  <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <span className="font-bold text-white mb-1">Buy Points</span>
                  <span className="text-xs text-gray-400 text-center">Get more points to support creators</span>
                </button>
                
                <button className="group flex flex-col items-center p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 border border-green-500/30 transition-all hover:scale-110 hover:shadow-lg hover:shadow-green-500/25">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Gift className="w-6 h-6 text-white" />
                  </div>
                  <span className="font-bold text-white mb-1">Send Tips</span>
                  <span className="text-xs text-gray-400 text-center">Show appreciation to creators</span>
                </button>
                
                <button className="group flex flex-col items-center p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 hover:from-blue-500/20 hover:to-cyan-500/20 border border-blue-500/30 transition-all hover:scale-110 hover:shadow-lg hover:shadow-blue-500/25">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Star className="w-6 h-6 text-white" />
                  </div>
                  <span className="font-bold text-white mb-1">Subscribe</span>
                  <span className="text-xs text-gray-400 text-center">Access exclusive content</span>
                </button>
                
                <button className="group flex flex-col items-center p-6 rounded-2xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 hover:from-yellow-500/20 hover:to-orange-500/20 border border-yellow-500/30 transition-all hover:scale-110 hover:shadow-lg hover:shadow-yellow-500/25">
                  <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <span className="font-bold text-white mb-1">Rewards</span>
                  <span className="text-xs text-gray-400 text-center">Earn bonus points daily</span>
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-3xl p-8 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text">Recent Activity</h3>
                  <p className="text-gray-400 text-sm">Your latest ConnectLove transactions</p>
                </div>
                <button 
                  className="bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-pink-300 hover:text-white px-4 py-2 rounded-xl font-medium transition-all hover:scale-105 border border-pink-500/30"
                  onClick={() => setActiveTab('history')}
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        transaction.type === 'earned' ? 'bg-green-500/20 text-green-400' :
                        transaction.type === 'spent' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {getTransactionIcon(transaction.icon)}
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{transaction.description}</div>
                        <div className="text-gray-400 text-xs flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatTimeAgo(transaction.date)}
                        </div>
                      </div>
                    </div>
                    <div className={`font-bold ${getTransactionColor(transaction.type)}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'buy' && (
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-3xl p-8 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-2">ConnectLove Points Packages</h3>
                <p className="text-gray-400">Choose the perfect package to support your favorite creators</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {pointsPackages.map((pkg) => (
                  <div 
                    key={pkg.id} 
                    className={`relative p-6 rounded-2xl border transition-all hover:scale-105 cursor-pointer ${
                      pkg.popular 
                        ? 'bg-gradient-to-br from-pink-500/20 to-purple-500/20 border-pink-500/50 shadow-lg shadow-pink-500/20' 
                        : 'bg-gradient-to-br from-gray-800/50 to-gray-700/50 border-gray-600/30 hover:border-pink-500/30'
                    }`}
                  >
                    {pkg.popular && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                          POPULAR
                        </span>
                      </div>
                    )}
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white mb-1">
                        {(pkg.points + pkg.bonus).toLocaleString()}
                      </div>
                      <div className="text-pink-300 text-sm mb-2">Points</div>
                      {pkg.bonus > 0 && (
                        <div className="text-green-400 text-xs mb-3">
                          +{pkg.bonus} bonus points
                        </div>
                      )}
                      <div className="text-xl font-bold text-white mb-4">
                        ${pkg.price}
                      </div>
                      <button className={`w-full py-3 rounded-xl font-medium transition-all ${
                        pkg.popular
                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-lg shadow-pink-500/25'
                          : 'bg-gray-700 hover:bg-gray-600 text-white'
                      }`}>
                        Purchase
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-3xl p-8 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-transparent bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text mb-2">Transaction History</h3>
                <p className="text-gray-400">Complete record of your ConnectLove activity</p>
              </div>
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        transaction.type === 'earned' ? 'bg-green-500/20 text-green-400' :
                        transaction.type === 'spent' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {getTransactionIcon(transaction.icon)}
                      </div>
                      <div>
                        <div className="text-white font-medium">{transaction.description}</div>
                        <div className="text-gray-400 text-sm flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatTimeAgo(transaction.date)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-lg ${getTransactionColor(transaction.type)}`}>
                        {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                      </div>
                      <div className="text-gray-400 text-sm">Points</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
