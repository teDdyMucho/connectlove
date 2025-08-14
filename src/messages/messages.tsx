import React, { useEffect, useRef, useState } from 'react';
import { User, Send, Paperclip, Smile, MoreVertical } from 'lucide-react';
// import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabaseClient';
import MessageList from './messageList';
import './messages.css';

declare global {
  interface Window {
    handleSelectConversation?: (id: string) => void;
  }
}

interface MessagesProps {
  navigateTo: (page: string) => void;
}

interface MessageUI {
  id: string;
  text: string;
  time: string;
  sender: 'user' | 'other';
}

interface MessageData {
  id: string;
  message_text?: string;
  content?: string;
  message?: string;
  created_at: string;
  sender_id: string;
  conversation_id: string;
}

interface ActiveConvUI {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  otherUserId?: string;
}

// WebhookPayload interface removed: payload now sent as top-level fields

const Messages: React.FC<MessagesProps> = ({ navigateTo }) => {
  // Auth context is available if needed
  // const auth = useAuth();

  const [currentUserId, setCurrentUserId] = useState(
    localStorage.getItem('current_user_id') ||
      localStorage.getItem('public_id') ||
      localStorage.getItem('logged_in_email') ||
      localStorage.getItem('user_id') ||
      ''
  );

  const [messages, setMessages] = useState<MessageUI[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [activeConv, setActiveConv] = useState<ActiveConvUI | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('Current User');
  const [newMessage, setNewMessage] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  // Anchor for auto-scroll to latest message
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Keep a reference to current Supabase channel to clean up on conversation change
  const messagesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // File input ref for image uploads
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Basic check if a text looks like an image URL
  const isImageUrl = (txt: string) => {
    if (!txt) return false;
    try {
      const u = new URL(txt);
      return /\.(apng|avif|bmp|gif|heic|heif|ico|jpeg|jpg|png|svg|tif|tiff|webp)(\?.*)?$/i.test(u.pathname);
    } catch {
      return false;
    }
  };

  // Supabase Storage bucket for chat image uploads
  const STORAGE_BUCKET = 'chat-uploads';

  useEffect(() => {
    const handleStorageChange = () => {
      const newId =
        localStorage.getItem('current_user_id') ||
        localStorage.getItem('public_id') ||
        localStorage.getItem('logged_in_email') ||
        localStorage.getItem('user_id') ||
        '';
      if (newId !== currentUserId) {
        setCurrentUserId(newId);
        setMessages([]);
        setActiveConv(null);
        setActiveConversationId('');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentUserId]);
  
  // Resolve identifier to UUID (same logic as messageList)
  const resolveUserId = async (identifier: string): Promise<string | null> => {
    if (!identifier) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(identifier)) return identifier;

    const { data, error } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .maybeSingle();
    if (error || !data) return null;
    return data.id as string;
  };

  useEffect(() => {
    const resolveName = async () => {
      const uuid = await resolveUserId(currentUserId);
      if (!uuid) return;
      const { data } = await supabase
        .from('users')
        .select('full_name, username')
        .eq('id', uuid)
        .maybeSingle();
      if (data) setCurrentUserName(data.full_name || data.username || 'Current User');
    };
    resolveName();
  }, [currentUserId]);
  

  useEffect(() => {
    window.handleSelectConversation = handleSelectConversation;
    return () => {
      window.handleSelectConversation = undefined;
    };
  }, []);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // Realtime subscription to new messages for the active conversation
  useEffect(() => {
    // Cleanup previous channel
    if (messagesChannelRef.current) {
      messagesChannelRef.current.unsubscribe();
      messagesChannelRef.current = null;
    }

    if (!activeConversationId) return;

    const channel = supabase
      .channel(`messages:${activeConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        async (payload) => {
          try {
            const row = payload.new as unknown as MessageData;
            const currentUserUuid = await resolveUserId(currentUserId);
            const ui: MessageUI = {
              id: row.id,
              text: row.message_text ?? row.message ?? row.content ?? '',
              time: new Date(row.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              sender: row.sender_id === currentUserUuid ? 'user' : 'other',
            };

            setMessages((prev) => {
              // If already present by id, do nothing
              if (prev.some((m) => m.id === ui.id)) return prev;

              // Try to replace the most recent optimistic temp message that matches
              // our own sent text to avoid flicker and duplication
              const candidateIndex = (() => {
                for (let i = prev.length - 1; i >= 0; i--) {
                  const m = prev[i];
                  if (
                    m.id.startsWith('temp-') &&
                    m.sender === 'user' &&
                    m.text === ui.text
                  ) {
                    return i;
                  }
                }
                return -1;
              })();

              if (candidateIndex !== -1) {
                const next = prev.slice();
                next[candidateIndex] = ui;
                return next;
              }

              // Otherwise, append
              return [...prev, ui];
            });
          } catch (err) {
            console.error('[realtime messages] insert handler error', err);
          }
        }
      );

    messagesChannelRef.current = channel;
    channel.subscribe((status) => {
      console.debug('[realtime messages] channel status', status);
    });

    return () => {
      channel.unsubscribe();
      if (messagesChannelRef.current === channel) {
        messagesChannelRef.current = null;
      }
    };
  }, [activeConversationId, currentUserId]);

  const fetchUserBasic = async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('full_name, username')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return { name: data?.full_name || data?.username || 'Unknown User' };
  };

  const fetchLatestMessages = async (conversationId: string) => {
    try {
      const currentUserUuid = await resolveUserId(currentUserId);
      const { data, error } = await supabase
        .from('messages')
        .select('id, message_text, created_at, sender_id, conversation_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Debug: Log raw message data
      console.log('Raw message data:', data);

      // Map database messages to UI format
      const formatted: MessageUI[] = (data ?? []).map((m: MessageData) => ({
        id: m.id,
        text: m.message_text ?? '',
        time: new Date(m.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        sender: m.sender_id === currentUserUuid ? 'user' : 'other',
      }));
      setMessages(formatted);

      if (activeConv && formatted.length) {
        const last = formatted[formatted.length - 1];
        const base = isImageUrl(last.text) ? 'Sent a photo' : last.text;
        const preview = last.sender === 'user' ? `You, ${base}` : base;
        setActiveConv({ ...activeConv, lastMessage: preview, time: last.time });
      }
    } catch (e) {
      console.error('fetchLatestMessages error:', e);
    }
  };

  const ensureConversationWith = async (otherUserId: string) => {
    const currentUserUuid = await resolveUserId(currentUserId);
    if (!currentUserUuid) throw new Error('Current user not resolved');
    const { data: existing, error: findErr } = await supabase
      .from('conversations')
      .select('conversation_id, participant1_id, participant2_id')
      .or(
        `and(participant1_id.eq.${currentUserUuid},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${currentUserUuid})`
      )
      .maybeSingle();

    if (findErr && findErr.code !== 'PGRST116') {
      throw findErr;
    }

    if (existing?.conversation_id) {
      return { conversationId: existing.conversation_id, created: false };
    }

    const { data: inserted, error: insErr } = await supabase
      .from('conversations')
      .insert({ participant1_id: currentUserUuid, participant2_id: otherUserId })
      .select('conversation_id')
      .single();

    if (insErr) throw insErr;
    return { conversationId: inserted.conversation_id, created: true };
  };

  const handleSelectConversation = async (id: string) => {
    try {
      let conversationId: string | null = null;
      let otherUserId: string | null = null;

      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) return;

      const { data: convById } = await supabase
        .from('conversations')
        .select('conversation_id, participant1_id, participant2_id')
        .eq('conversation_id', id)
        .maybeSingle();

      if (convById?.conversation_id) {
        conversationId = convById.conversation_id;
        otherUserId =
          convById.participant1_id === currentUserUuid
            ? convById.participant2_id
            : convById.participant1_id;
      } else {
        otherUserId = id;
        const ensured = await ensureConversationWith(otherUserId);
        conversationId = ensured.conversationId;
      }

      if (!conversationId || !otherUserId) return;

      const { name } = await fetchUserBasic(otherUserId);

      setActiveConversationId(conversationId);
      setActiveConv({
        id: conversationId,
        otherUserId,
        name,
        avatar: '',
        lastMessage: 'Loading messages...',
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        unread: 0,
      });

      await fetchLatestMessages(conversationId);
    } catch (err) {
      console.error('Error in handleSelectConversation:', err);
    }
  };

  const sendWebhookMessage = async (messageText: string) => {
    try {
      if (!activeConv || !activeConv.otherUserId) return;

      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) return;

      // Match expected schema: top-level fields
      const payload = {
        message: messageText,
        sender_id: currentUserUuid,
        sender_name: currentUserName,
        receiver_id: activeConv.otherUserId,
        receiver_name: activeConv.name,
        conversation_id: activeConversationId,
        image_url: messageText,
      };

      console.debug('[sendWebhookMessage] URL and payload', {
        url: 'https://primary-production-6722.up.railway.app/webhook/dd88723f-330f-48e7-9818-4f578f952def',
        payload,
      });
      const response = await fetch(
        'https://primary-production-6722.up.railway.app/webhook/dd88723f-330f-48e7-9818-4f578f952def',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[sendWebhookMessage] non-OK response', response.status, text);
        throw new Error(`Failed: ${response.status}`);
      }
      const data = await response.json().catch(() => ({}));
      console.debug('[sendWebhookMessage] success', data);

      const cid = data.conversation_id || activeConversationId;
      if (cid && cid !== activeConversationId) {
        setActiveConversationId(cid);
      }
      // Do not fetch here to avoid flicker; rely on realtime INSERT to update the list
    } catch (e) {
      console.error('sendWebhookMessage error:', e);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;

    const nowStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const temp: MessageUI = {
      id: `temp-${Date.now()}`,
      text: trimmed,
      time: nowStr,
      sender: 'user',
    };

    console.debug('[sendMessage] start', {
      hasActiveConv: !!activeConv,
      activeConversationId,
      otherUserId: activeConv?.otherUserId,
    });
    setMessages((prev) => [...prev, temp]);
    if (activeConv)
      setActiveConv({ ...activeConv, lastMessage: `You, ${trimmed}`, time: 'Just now' });

    setNewMessage('');

    if (activeConv?.otherUserId && !activeConversationId) {
      const ensured = await ensureConversationWith(activeConv.otherUserId);
      if (ensured.conversationId !== activeConversationId) {
        setActiveConversationId(ensured.conversationId);
      }
    }

    console.debug('[sendMessage] calling webhook');
    await sendWebhookMessage(trimmed);
  };

  // Open file picker when clicking the attach button
  const handleAttachClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // Image upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be selected again next time
    e.target.value = '';

    try {
      if (!activeConv || !activeConv.otherUserId) return;
      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) return;

      // Ensure conversation exists before upload (so preview updates go to correct thread)
      if (!activeConversationId) {
        const ensured = await ensureConversationWith(activeConv.otherUserId);
        if (ensured.conversationId !== activeConversationId) {
          setActiveConversationId(ensured.conversationId);
        }
      }

      setUploadingImage(true);
      const bucket = STORAGE_BUCKET;
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${currentUserUuid}/${timestamp}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // Optimistic UI with image
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tempImg: MessageUI = {
        id: `temp-${Date.now()}`,
        text: publicUrl,
        time: nowStr,
        sender: 'user',
      };
      setMessages((prev) => [...prev, tempImg]);
      if (activeConv)
        setActiveConv({ ...activeConv, lastMessage: 'You, Sent a photo', time: 'Just now' });

      // Send webhook with the image URL as the message text so receiver gets it
      await sendWebhookMessage(publicUrl);
    } catch (err: unknown) {
      console.error('[upload image] error', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')) {
        alert(
          `Image upload bucket not found.\n\n` +
          `Please create a public Supabase Storage bucket named "${STORAGE_BUCKET}" and try again.\n` +
          `Supabase Dashboard -> Storage -> Create bucket -> Name: ${STORAGE_BUCKET} -> Public.`
        );
      }
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => navigateTo('main')}
            >
              <span className="text-xl font-bold text-gray-900">Messages</span>
            </div>
            <button
              onClick={() => navigateTo('main')}
              className="text-gray-600 hover:text-primary transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div
          className="flex bg-white rounded-lg shadow-lg overflow-hidden"
          style={{ height: 'calc(100vh - 120px)' }}
        >
          {/* Sidebar */}
          <div className="w-1/3 border-r border-gray-200">
            <MessageList
              onSelectConversation={handleSelectConversation}
              selectedConversationId={activeConv?.id}
            />
          </div>

          {/* Chat Window */}
          <div className="w-2/3 flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center">
                {activeConv?.avatar ? (
                  <img
                    src={activeConv.avatar}
                    alt={activeConv?.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-500" />
                  </div>
                )}
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {activeConv?.name || 'Select a chat'}
                  </h3>
                </div>
              </div>
              <button className="text-gray-500 hover:text-gray-700">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>

            {/* Chat Messages */}
            <div
              className="flex-1 p-4 overflow-y-auto no-anim"
              style={{ height: 'calc(100vh - 264px)' }}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-4 flex ${
                    message.sender === 'user'
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >
                  {message.sender === 'other' && (
                    <div className="mr-2">
                      {activeConv?.avatar ? (
                        <img
                          src={activeConv.avatar}
                          alt={activeConv?.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      message.sender === 'user'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {isImageUrl(message.text) ? (
                      <a href={message.text} target="_blank" rel="noreferrer">
                        <img
                          src={message.text}
                          alt="sent image"
                          className="max-h-64 max-w-full rounded-md mb-1"
                        />
                      </a>
                    ) : (
                      <p className="text-sm break-words whitespace-pre-wrap">{message.text}</p>
                    )}
                    <p
                      className={`text-xs mt-1 ${
                        message.sender === 'user'
                          ? 'text-primary-light'
                          : 'text-gray-500'
                      }`}
                    >
                      {message.time}
                    </p>
                  </div>
                </div>
              ))}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />

              {!messages.length && (
                <div className="h-full w-full flex items-center justify-center text-sm text-gray-400">
                  {activeConv
                    ? 'No messages yet. Say hi!'
                    : 'Select a conversation'}
                </div>
              )}
            </div>

            {/* Input Box */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center">
                <button
                  className="text-gray-500 hover:text-gray-700 mr-2 disabled:opacity-50"
                  onClick={handleAttachClick}
                  disabled={!activeConv || uploadingImage}
                  title={uploadingImage ? 'Uploading…' : 'Attach image'}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    rows={1}
                  />
                  <button className="absolute right-3 top-2 text-gray-500 hover:text-gray-700">
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  onClick={sendMessage}
                  className="ml-2 bg-primary text-white p-2 rounded-full hover:bg-primary-dark transition-colors disabled:opacity-50"
                  disabled={!newMessage.trim() || !activeConv || uploadingImage}
                >
                  <Send className="h-5 w-5" />
                </button>
                {/* Hidden file input for image uploads */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messages;
