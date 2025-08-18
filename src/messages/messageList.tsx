  import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, User } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './messages.css';

// Basic check if a text looks like an image URL
const isImageUrl = (txt: string) => {
  if (!txt) return false;
  try {
    const u = new URL(txt);
    return /(\.apng|\.avif|\.bmp|\.gif|\.heic|\.heif|\.ico|\.jpe?g|\.png|\.svg|\.tiff?|\.webp)(\?.*)?$/i.test(
      u.pathname
    );
  } catch {
    return false;
  }
};

interface CustomWindow extends Window {
  addOrUpdateConversation?: (conversationId: string, otherUserId: string) => Promise<void>;
  fetchConversations?: () => Promise<void>;
}

interface MessageListProps {
  onSelectConversation: (id: string, name?: string, otherUserId?: string) => void;
  selectedConversationId?: string;
}

interface Conversation {
  id: string; 
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  sender_id?: string;
  receiver_id?: string;
  otherUserId?: string;
  isTemporary?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ onSelectConversation, selectedConversationId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for realtime channels so we can clean them up on user change
  const msgsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const convsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Ensure unique conversations by id to avoid duplicate key warnings
  const uniqueConversations = useMemo(() => {
    const seen = new Set<string>();
    const result: Conversation[] = [];
    for (const c of conversations) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    return result;
  }, [conversations]);

// --- Current user state ---
const [currentUserId, setCurrentUserId] = useState(
  localStorage.getItem('current_user_id') ||
  localStorage.getItem('public_id') ||
  localStorage.getItem('logged_in_email') ||
  ''
);

// --- Handle user changes robustly ---
const updateCurrentUser = useCallback((newId?: string) => {
  const resolvedId =
    newId ||
    localStorage.getItem('current_user_id') ||
    localStorage.getItem('public_id') ||
    localStorage.getItem('logged_in_email') ||
    '';
  if (resolvedId !== currentUserId) {
    setCurrentUserId(resolvedId);
  }
}, [currentUserId]);

// Listen for localStorage changes in other tabs
useEffect(() => {
  const handleStorageChange = () => {
    updateCurrentUser();
  };
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, [currentUserId, updateCurrentUser]);

// Optional: call this whenever user switches accounts in the same tab
// Example: onUserSwitch(newId) { updateCurrentUser(newId); }


  // Resolve identifier to UUID
  const resolveUserId = useCallback(async (identifier: string): Promise<string | null> => {
    if (!identifier) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(identifier)) return identifier;

    const { data: userData, error } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .single();

    if (error || !userData) {
      console.error('Failed to resolve userId for:', identifier, error);
      return null;
    }

    return userData.id;
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }, []);

  // Get or create conversation between two UUIDs
  const getOrCreateConversationId = useCallback(
    async (userA: string, userB: string): Promise<string | null> => {
      const { data: existing, error: existingErr } = await supabase
        .from('conversations')
        .select('conversation_id')
        .or(
          `and(participant1_id.eq.${userA},participant2_id.eq.${userB}),and(participant1_id.eq.${userB},participant2_id.eq.${userA})`
        )
        .limit(1);

      if (existingErr) {
        console.error('Error checking existing conversation:', existingErr);
        return null;
      }

      if (existing && existing.length > 0) {
        return existing[0].conversation_id as string;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('conversations')
        .insert({
          participant1_id: userA,
          participant2_id: userB,
        })
        .select('conversation_id')
        .single();

      if (insertErr) {
        console.error('Error creating conversation:', insertErr);
        return null;
      }

      return inserted?.conversation_id ?? null;
    },
    []
  );

  // Add or update a conversation in state
  const addOrUpdateConversation = useCallback(
    async (conversationId: string, otherUserIdentifier: string) => {
      const currentUserUuid = await resolveUserId(currentUserId);
      const otherUserUuid = await resolveUserId(otherUserIdentifier);
      if (!currentUserUuid || !otherUserUuid) return;

      try {
        setLoading(true);
        const existingConvIndex = conversations.findIndex((conv) => conv.id === conversationId);

        const { data: latestMsgData, error: latestMsgError } = await supabase
          .from('messages')
          .select('message_text, created_at, sender_id')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (latestMsgError) console.error(latestMsgError);
        const latestMsg = latestMsgData?.[0] ?? null;

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('username, full_name, avatar_url')
          .eq('id', otherUserUuid)
          .single();

        if (userError) console.error(userError);

        const rawText = latestMsg?.message_text || '';
        const base = rawText ? (isImageUrl(rawText) ? 'Sent a photo' : rawText) : 'No messages yet';
        const lastMessageText = latestMsg && latestMsg.sender_id === currentUserUuid ? `You, ${base}` : base;

        const newConversation: Conversation = {
          id: conversationId,
          name: userData?.full_name || userData?.username || 'Unknown User',
          avatar: userData?.avatar_url || '',
          lastMessage: lastMessageText,
          time: latestMsg ? formatDate(latestMsg.created_at) : formatDate(new Date().toISOString()),
          unread: 0,
          sender_id: currentUserUuid,
          receiver_id: otherUserUuid,
          otherUserId: otherUserUuid,
        };

        if (existingConvIndex >= 0) {
          const updatedConvs = [...conversations];
          updatedConvs[existingConvIndex] = newConversation;
          setConversations(updatedConvs);
        } else {
          setConversations((prev) => [newConversation, ...prev]);
        }
      } catch (err) {
        console.error('Error adding/updating conversation:', err);
      } finally {
        setLoading(false);
      }
    },
    [conversations, currentUserId, formatDate, resolveUserId]
  );

  // Expose global window functions
  // Expose only addOrUpdateConversation here (fetchConversations effect is added later after declaration)
  useEffect(() => {
    const customWindow = window as CustomWindow;
    customWindow.addOrUpdateConversation = addOrUpdateConversation;
    return () => {
      delete customWindow.addOrUpdateConversation;
    };
  }, [addOrUpdateConversation]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    const currentUserUuid = await resolveUserId(currentUserId);
    if (!currentUserUuid) {
      setError('User not found.');
      setConversations([]);
      return;
    }

    try {
      setLoading(true);
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('conversation_id, participant1_id, participant2_id, created_at')
        .or(`participant1_id.eq.${currentUserUuid},participant2_id.eq.${currentUserUuid}`)
        .order('created_at', { ascending: false });

      if (convError) throw convError;

      if (!convData || convData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const updatedConvs: Conversation[] = [];

      for (const conv of convData) {
        const otherUserId = conv.participant1_id === currentUserUuid ? conv.participant2_id : conv.participant1_id;
        const { data: latestMsgData } = await supabase
          .from('messages')
          .select('message_text, created_at, sender_id')
          .eq('conversation_id', conv.conversation_id)
          .order('created_at', { ascending: false })
          .limit(1);

        const latestMsg = latestMsgData?.[0] ?? null;

        const rawText = latestMsg?.message_text || '';
        const base = rawText ? (isImageUrl(rawText) ? 'Sent a photo' : rawText) : 'No messages yet';
        const lastMessageText = latestMsg && latestMsg.sender_id === currentUserUuid ? `You, ${base}` : base;

        updatedConvs.push({
          id: conv.conversation_id,
          name: 'Loading...',
          avatar: '',
          lastMessage: lastMessageText,
          time: latestMsg ? formatDate(latestMsg.created_at) : formatDate(conv.created_at),
          unread: 0,
          sender_id: currentUserUuid,
          receiver_id: otherUserId,
          otherUserId,
        });
      }

      // Fetch user details
      for (let i = 0; i < updatedConvs.length; i++) {
        const conv = updatedConvs[i];
        const { data: userData } = await supabase
          .from('users')
          .select('username, full_name, avatar_url')
          .eq('id', conv.otherUserId)
          .single();

        if (userData) {
          updatedConvs[i] = {
            ...conv,
            name: userData.full_name || userData.username || 'Unknown User',
            avatar: userData.avatar_url || '',
          };
        }
      }

      setConversations(updatedConvs);
    } catch (err) {
      console.error(err);
      setError('Failed to load conversations.');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, formatDate, resolveUserId]);

  // Now that fetchConversations is declared, expose it on window
  useEffect(() => {
    const customWindow = window as CustomWindow;
    customWindow.fetchConversations = fetchConversations;
    return () => {
      delete customWindow.fetchConversations;
    };
  }, [fetchConversations]);

  // Realtime subscriptions: update conversation list on new messages and conv changes
  useEffect(() => {
    // Cleanup old channels
    if (msgsChannelRef.current) {
      msgsChannelRef.current.unsubscribe();
      msgsChannelRef.current = null;
    }
    if (convsChannelRef.current) {
      convsChannelRef.current.unsubscribe();
      convsChannelRef.current = null;
    }

    let isMounted = true;

    const setup = async () => {
      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid || !isMounted) return;

      // Messages inserts: update last message/time and move conversation to top
      // Types for realtime payload rows
      type MessageRow = {
        id: string;
        sender_id: string;
        receiver_id: string;
        conversation_id: string;
        created_at: string;
        message_text?: string;
        message?: string;
        content?: string;
      };

      const msgsChannel = supabase
        .channel(`ml:messages:${currentUserUuid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          async (payload) => {
            const row = payload.new as MessageRow;
            if (
              row.sender_id !== currentUserUuid &&
              row.receiver_id !== currentUserUuid
            )
              return;

            const otherUserId =
              row.sender_id === currentUserUuid ? row.receiver_id : row.sender_id;

            const raw = row.message_text ?? row.message ?? row.content ?? '';
            const base = raw ? (isImageUrl(raw) ? 'Sent a photo' : raw) : '';
            const lastMessage = row.sender_id === currentUserUuid ? `You, ${base}` : base;
            const time = (() => {
              try {
                return formatDate(row.created_at);
              } catch {
                return 'Just now';
              }
            })();

            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.id === row.conversation_id);
              if (idx !== -1) {
                const updated = [...prev];
                const updatedItem = { ...updated[idx], lastMessage, time };
                updated.splice(idx, 1);
                return [updatedItem, ...updated];
              }
              // New conversation not in list yet; add placeholder and enrich later
              const newConv = {
                id: row.conversation_id as string,
                name: 'Loading...',
                avatar: '',
                lastMessage,
                time,
                unread: 0,
                sender_id: row.sender_id as string,
                receiver_id: row.receiver_id as string,
                otherUserId: otherUserId as string,
              } as Conversation;
              return [newConv, ...prev];
            });

            // Enrich name/avatar if needed
            try {
              const { data: userData } = await supabase
                .from('users')
                .select('username, full_name, avatar_url')
                .eq('id', otherUserId)
                .single();
              if (userData) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === row.conversation_id
                      ? {
                          ...c,
                          name: userData.full_name || userData.username || 'Unknown User',
                          avatar: userData.avatar_url || '',
                        }
                      : c
                  )
                );
              }
            } catch (e) {
              console.error('[messageList] enrich user error', e);
            }
          }
        );

      msgsChannel.subscribe();
      msgsChannelRef.current = msgsChannel;

      // Conversations inserts/updates: ensure they exist in the list
      type ConversationRow = {
        conversation_id: string;
        participant1_id: string;
        participant2_id: string;
      };

      const convsChannel = supabase
        .channel(`ml:conversations:${currentUserUuid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'conversations' },
          async (p) => {
            const row = p.new as ConversationRow & { participant1_id: string; participant2_id: string };
            if (
              row.participant1_id !== currentUserUuid &&
              row.participant2_id !== currentUserUuid
            )
              return;
            const other =
              row.participant1_id === currentUserUuid
                ? row.participant2_id
                : row.participant1_id;
            // Use existing helper to add or update with fresh data
            await addOrUpdateConversation(row.conversation_id, other);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversations' },
          async (p) => {
            const row = p.new as ConversationRow & { participant1_id: string; participant2_id: string };
            if (
              row.participant1_id !== currentUserUuid &&
              row.participant2_id !== currentUserUuid
            )
              return;
            const other =
              row.participant1_id === currentUserUuid
                ? row.participant2_id
                : row.participant1_id;
            await addOrUpdateConversation(row.conversation_id, other);
          }
        );

      convsChannel.subscribe();
      convsChannelRef.current = convsChannel;
    };

    setup();

    return () => {
      isMounted = false;
      if (msgsChannelRef.current) {
        msgsChannelRef.current.unsubscribe();
        msgsChannelRef.current = null;
      }
      if (convsChannelRef.current) {
        convsChannelRef.current.unsubscribe();
        convsChannelRef.current = null;
      }
    };
  }, [currentUserId, resolveUserId, formatDate, addOrUpdateConversation]);

  // Auto-fetch whenever currentUserId changes
  useEffect(() => {
    // Do not clear to avoid flicker; just fetch and let realtime update
    fetchConversations();
  }, [currentUserId, fetchConversations]);

  // Handle search input
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value === '') setShowSearchResults(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setError('Please enter a search term');
      return;
    }

    setIsSearching(true);
    setError(null);
    setShowSearchResults(true);

    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);

      if (userError) throw userError;

      const results: Conversation[] = userData?.map((user) => ({
        id: user.id,
        name: user.full_name || user.username || 'Unknown User',
        avatar: user.avatar_url || '',
        lastMessage: 'Start a conversation',
        time: 'Now',
        unread: 0,
      })) || [];

      setSearchResults(results);
    } catch (err) {
      console.error(err);
      setError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchResultClick = async (userIdentifier: string) => {
    if (!userIdentifier) return;
    try {
      const currentUserUuid = await resolveUserId(currentUserId);
      const otherUserUuid = await resolveUserId(userIdentifier);

      if (!currentUserUuid || !otherUserUuid) return;

      const conversationId = await getOrCreateConversationId(currentUserUuid, otherUserUuid);
      if (!conversationId) return;

      // Fetch name to pass immediately for instant header update
      let displayName: string | undefined = undefined;
      try {
        const { data: userInfo } = await supabase
          .from('users')
          .select('full_name, username')
          .eq('id', otherUserUuid)
          .maybeSingle();
        displayName = userInfo?.full_name || userInfo?.username || undefined;
      } catch {
        // ignore; Messages will fallback fetch
      }

      await addOrUpdateConversation(conversationId, otherUserUuid);
      onSelectConversation(conversationId, displayName, otherUserUuid);
      setShowSearchResults(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Title */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <form onSubmit={handleSearch} className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchInputChange}
              placeholder="Search users…"
              className="w-full pl-10 pr-10 py-2 rounded-lg bg-gray-100 border border-gray-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-primary transition-colors"
              disabled={isSearching}
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && uniqueConversations.length === 0 ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="text-center p-4 text-red-500">{error}</div>
        ) : (
          <>
            {showSearchResults ? (
              isSearching ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleSearchResultClick(result.id)}
                    className="group p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-50 animate-[slideFade_.24s_cubic-bezier(.4,0,.2,1)_both]"
                  >
                    <div className="flex items-center">
                      {result.avatar ? (
                        <img
                          src={result.avatar}
                          alt={result.name}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-6 w-6 text-gray-500" />
                        </div>
                      )}
                      <div className="ml-3 flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{result.name}</h3>
                          <p className="text-xs text-gray-500">{result.time}</p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{result.lastMessage}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center p-4 text-gray-500">No results found</div>
              )
            ) : uniqueConversations.length === 0 ? (
              <div className="text-center p-4 text-gray-500">
                <p>Search for users to start chatting</p>
                <p className="text-xs mt-1">Your conversations will appear here</p>
              </div>
            ) : (
              uniqueConversations.map((conv, idx) => (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id, conv.name, conv.otherUserId)}
                  className={[
                    "group p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-50 animate-[slideFade_.24s_cubic-bezier(.4,0,.2,1)_both]",
                    selectedConversationId === conv.id ? "bg-gray-100/70 ring-1 ring-primary/30" : ""
                  ].join(" ")}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex items-center">
                    {conv.avatar ? (
                      <img
                        src={conv.avatar}
                        alt={conv.name}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="h-6 w-6 text-gray-500" />
                      </div>
                    )}
                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{conv.name}</h3>
                        <p className="text-xs text-gray-500">{conv.time}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
                        {conv.unread > 0 && (
                          <span className="ml-2 bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-[wiggle_.6s_ease]">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MessageList;
