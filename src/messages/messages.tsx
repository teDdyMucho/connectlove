import React, { useEffect, useRef, useState, useCallback } from 'react';
import { User, Send, Paperclip, Smile, MoreVertical } from 'lucide-react';
// import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabaseClient';
import MessageList from './messageList';
import './messages.css';

declare global {
  interface Window {
    handleSelectConversation?: (id: string, name?: string, otherUserId?: string) => void;
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
  const [isOtherCreator, setIsOtherCreator] = useState<boolean>(false);

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

  // Check if message text contains interactive JSON structure
  const isInteractiveMessage = (txt: string): boolean => {
    if (!txt) return false;
    try {
      const parsed = JSON.parse(txt);
      return !!(parsed.mainQuestion && parsed.followUp && parsed.questions && Array.isArray(parsed.questions));
    } catch {
      return false;
    }
  };

  // Parse interactive message JSON
  const parseInteractiveMessage = (txt: string) => {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  };

  // Interactive message question type
  interface InteractiveQuestion {
    question: string;
    points: number;
    value: string;
    replies?: string[];
  }

  // Interactive reply state
  const [activeReply, setActiveReply] = useState<{question: InteractiveQuestion; messageId: string} | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [sendingReplyMessageId, setSendingReplyMessageId] = useState<string | null>(null);
  const [sentReplies, setSentReplies] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('sentReplies');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Action button inline questions state
  const [showInlineQuestions, setShowInlineQuestions] = useState<string | null>(null);

  // Question type definition
  interface ActionQuestion {
    id: string;
    question: string;
    points?: number;
  }

  // Questions for each action type
  const actionQuestions: { [key: string]: ActionQuestion[] } = {
      gift: [
      { id: 'gift_1', question: 'Want quick points? Send a small gift to claim them.', points: 40 },
      { id: 'gift_2', question: 'You can earn more points—send a surprise gift.', points: 80 },
      { id: 'gift_3', question: 'Earn big points by sending a romantic gift.', points: 120 }
    ],
    love: [
      { id: 'love_1', question: 'Want points? Show a little love to get them.', points: 30 },
      { id: 'love_2', question: 'Send a heart and earn some easy points.', points: 60 },
      { id: 'love_3', question: 'Make me feel special and earn big points while doing it.', points: 90 }
    ],
    tip: [
      { id: 'tip_1', question: 'Earn points instantly—send a small tip.', points: 25 },
      { id: 'tip_2', question: 'Want more points? Drop a generous tip.', points: 75 },
      { id: 'tip_3', question: 'Big points available—send a big tip to claim them.', points: 150 }
    ],
    boost: [
      { id: 'boost_1', question: 'Earn points by boosting my profile.', points: 60 },
      { id: 'boost_2', question: 'Want higher points? Help push me trending.', points: 100 },
      { id: 'boost_3', question: 'Get mega points—send me a mega boost.', points: 200 }
    ],
    drink: [
      { id: 'drink_1', question: 'Grab quick points—buy me a coffee.', points: 50 },
      { id: 'drink_2', question: 'Earn more points by getting me an energy drink.', points: 75 },
      { id: 'drink_3', question: 'Want extra points? Treat me to a special drink.', points: 100 }
    ]
  };

  // Handle interactive question click - show reply box
  const handleInteractiveQuestion = useCallback((question: InteractiveQuestion, messageId: string, messageSender: string) => {
    // Don't show reply box if already sent a reply for this message
    if (sentReplies.has(messageId)) return;
    
    // Don't show reply box if sender is trying to reply to their own message
    if (messageSender === 'user') return;
    
    setActiveReply({ question, messageId });
    setReplyText('');
  }, [sentReplies]);

  // Handle sending the reply with webhook
  const handleSendReply = useCallback(async () => {
    try {
      if (!activeReply || !activeConv?.otherUserId) {
        console.warn('No active reply or conversation');
        return;
      }

      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) {
        console.warn('Could not resolve current user ID');
        return;
      }

      const payload = {
        conversation_id: activeConversationId,
        message_id: activeReply.messageId,
        wallet_balance_user_id: activeConv.otherUserId,
        sender_id: currentUserUuid,
        receiver_id: activeConv.otherUserId,
        question_value: activeReply.question.value,
        question_points: activeReply.question.points,
        question_text: replyText || activeReply.question.question
      };

      console.log('[Interactive Reply -> webhook] payload:', payload);
      
      const resp = await fetch('https://primary-production-6722.up.railway.app/webhook/reply-drink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        keepalive: true,
      });
      
      const text = await resp.text().catch(() => '');
      console.log('[Interactive Reply -> webhook] status:', resp.status, 'body:', text);
      
      // Mark this message as having a sent reply
      setSentReplies(prev => {
        const newSet = new Set([...prev, activeReply.messageId]);
        // Persist to localStorage
        try {
          localStorage.setItem('sentReplies', JSON.stringify([...newSet]));
        } catch (e) {
          console.warn('Failed to save sentReplies to localStorage:', e);
        }
        return newSet;
      });
      
      // Close reply box after sending
      setActiveReply(null);
      setReplyText('');
      
    } catch (e) {
      console.error('Interactive reply webhook error:', e);
    }
  }, [activeReply, activeConv?.otherUserId, activeConversationId, currentUserId, replyText]);

  // Handle cancel reply
  const handleCancelReply = useCallback(() => {
    setActiveReply(null);
    setReplyText('');
  }, []);

  // Handle reply button click - directly send webhook with selected reply
  const handleReplyClick = useCallback(async (reply: string, question: InteractiveQuestion, messageId: string) => {
    try {
      if (sentReplies.has(messageId)) return;
      if (sendingReplyMessageId === messageId) return;
      if (!activeConv?.otherUserId) return;

      setSendingReplyMessageId(messageId);
      
      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) return;
      
      const payload = {
        conversation_id: activeConversationId,
        message_id: messageId,
        wallet_balance_user_id: activeConv.otherUserId,
        sender_id: currentUserUuid,
        receiver_id: activeConv.otherUserId,
        question_value: question.value,
        question_points: question.points,
        question_text: question.question,
        reply_text: reply
      };
      
      console.log('[Reply Click -> webhook] payload:', payload);
      
      const resp = await fetch('https://primary-production-6722.up.railway.app/webhook/reply-drink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        keepalive: true,
      });
      
      const text = await resp.text().catch(() => '');
      console.log('[Reply Click -> webhook] status:', resp.status, 'body:', text);
      
      // Mark this message as having a sent reply
      setSentReplies(prev => {
        const newSet = new Set([...prev, messageId]);
        try {
          localStorage.setItem('sentReplies', JSON.stringify([...newSet]));
        } catch (e) {
          console.warn('Failed to save sentReplies to localStorage:', e);
        }
        return newSet;
      });
      
    } catch (e) {
      console.error('Reply click webhook error:', e);
    } finally {
      setSendingReplyMessageId(prev => (prev === messageId ? null : prev));
    }
  }, [activeConv?.otherUserId, activeConversationId, currentUserId, sendingReplyMessageId, sentReplies]);

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
  }, );


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

  const fetchLatestMessages = useCallback(async (conversationId: string) => {
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

      if (formatted.length) {
        const last = formatted[formatted.length - 1];
        const base = isImageUrl(last.text) ? 'Sent a photo' : last.text;
        const preview = last.sender === 'user' ? `You, ${base}` : base;
        // Preserve the currently selected conversation header (name/avatar), only update preview/time
        setActiveConv((prev) => (prev ? { ...prev, lastMessage: preview, time: last.time } : prev));
      }
    } catch (e) {
      console.error('fetchLatestMessages error:', e);
    }
  }, [currentUserId]);

  const ensureConversationWith = useCallback(async (otherUserId: string) => {
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
  }, [currentUserId]);

  const handleSelectConversation = useCallback(async (id: string, passedName?: string, passedOtherUserId?: string) => {
    try {
      let conversationId: string | null = id || null;
      let otherUserId: string | null = passedOtherUserId || null;

      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) return;

      // If we don't have otherUserId yet, fetch minimal conversation info
      if (!otherUserId) {
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
        }
      }

      if (!conversationId || !otherUserId) return;

      // Use passed name immediately for instant header; if it's missing or placeholder, fetch now
      let resolvedName = passedName;
      if (!resolvedName || resolvedName === 'Loading...' || resolvedName === 'Unknown User') {
        const { name } = await fetchUserBasic(otherUserId);
        resolvedName = name;
      }

      setActiveConversationId(conversationId);
      setActiveConv({
        id: conversationId,
        otherUserId,
        name: resolvedName || 'Unknown User',
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
  }, [currentUserId, fetchLatestMessages]);

  // Fetch other user's user_type to determine if creator
  useEffect(() => {
    const run = async () => {
      try {
        if (!activeConv?.otherUserId) { setIsOtherCreator(false); return; }
        const { data } = await supabase
          .from('users')
          .select('user_type')
          .eq('id', activeConv.otherUserId)
          .maybeSingle();
        setIsOtherCreator((data?.user_type as string | undefined) === 'creator');
      } catch { setIsOtherCreator(false); }
    };
    run();
  }, [activeConv?.otherUserId]);

  // Handle inline questions close
  const handleCloseInlineQuestions = () => {
    setShowInlineQuestions(null);
  };

  // Handle question click - directly send webhook
  const handleQuestionClick = async (questionId: string, question: string, actionType: string, points?: number) => {
    try {
      if (!activeConv?.otherUserId) return;
      
      const latestMsgId: string | null = messages.length ? messages[messages.length - 1].id : null;
      const currentUserUuid = await resolveUserId(currentUserId);
      if (!currentUserUuid) return;
      
      const payload = {
        conversation_id: activeConversationId,
        message_id: latestMsgId,
        wallet_balance_user_id: activeConv.otherUserId,
        sender_id: currentUserUuid,
        receiver_id: activeConv.otherUserId,
        type: actionType,
        question_id: questionId,
        question_text: question,
        points: points
      };
      
      console.log(`[Direct webhook -> ${actionType}] payload:`, payload);
      
      const resp = await fetch('https://primary-production-6722.up.railway.app/webhook/drink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        keepalive: true,
      });
      
      const text = await resp.text().catch(() => '');
      console.log(`[Direct webhook -> ${actionType}] status:`, resp.status, 'body:', text);
      
      // Close the questions after successful send
      handleCloseInlineQuestions();
    } catch (e) {
      console.error(`${actionType} webhook error:`, e);
    }
  };


  // Handle send tip button click
  const handleSendTip = useCallback(() => {
    setShowInlineQuestions('tip');
  }, []);

  // Handle send gift button click
  const handleSendGift = useCallback(() => {
    setShowInlineQuestions('gift');
  }, []);

  // Handle show love button click
  const handleShowLove = useCallback(() => {
    setShowInlineQuestions('love');
  }, []);

  // Handle boost creator button click
  const handleBoostCreator = useCallback(() => {
    setShowInlineQuestions('boost');
  }, []);

  const handleBuyDrink = useCallback(() => {
    setShowInlineQuestions('drink');
  }, []);

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
    if (file) {
      try {
        const currentUserUuid = await resolveUserId(currentUserId);
        if (!currentUserUuid) return;

        // Ensure conversation exists before upload (so preview updates go to correct thread)
        if (!activeConversationId && activeConv?.otherUserId) {
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
    }
  };

  // Auto-select creator conversation if coming from creator profile
  useEffect(() => {
    const checkAutoSelectCreator = async () => {
      try {
        const storedCreatorInfo = localStorage.getItem('autoSelectCreator');
        if (storedCreatorInfo) {
          console.log('Found stored creator info for auto-selection');
          const creatorInfo = JSON.parse(storedCreatorInfo);
          
          // Clear the stored info so it only happens once
          localStorage.removeItem('autoSelectCreator');
          
          // Wait a bit for MessageList to load
          setTimeout(async () => {
            if (creatorInfo.identifier) {
              console.log('Auto-selecting conversation for creator:', creatorInfo.name);
              
              // Try to find existing conversation or create new one
              const currentUserUuid = await resolveUserId(currentUserId);
              const creatorUserId = await resolveUserId(creatorInfo.identifier);
              
              if (currentUserUuid && creatorUserId) {
                // Check if conversation exists, if not create it
                const result = await ensureConversationWith(creatorUserId);
                if (result?.conversationId) {
                  console.log('Auto-selecting conversation ID:', result.conversationId);
                  await handleSelectConversation(result.conversationId, creatorInfo.name, creatorUserId);
                }
              }
            }
          }, 300); // Wait 300ms for everything to load - faster response
        }
      } catch (error) {
        console.error('Error in auto-select creator:', error);
      }
    };

    checkAutoSelectCreator();
  }, [currentUserId, ensureConversationWith, handleSelectConversation]); // Include all dependencies

  return (
    <div className="messages-page min-h-screen bg-[#141825] scroll-smooth overflow-x-hidden">
      {/* Header */}
      <header className="bg-[#141825] shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => navigateTo('main')}
            >
              <span className="text-lg sm:text-xl font-bold text-white">Messages</span>
            </div>
            <button
              onClick={() => navigateTo('main')}
              className="text-sm sm:text-base text-gray-300 hover:text-primary transition-colors duration-150"
            >
              Back to Home
            </button>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-0 sm:px-0 md:px-0 lg:px-0 py-0">
        <div
          className="messenger-pane flex flex-col md:flex-row overflow-hidden transition-shadow duration-200"
          style={{ height: 'calc(100vh - 64px)', maxHeight: 'calc(100vh - 64px)' }}
        >
          {/* Sidebar */}
          <aside className="w-full md:w-1/3 lg:w-1/4 border-b md:border-b-0 md:border-r border-[#2a2a34] flex-shrink-0 md:max-h-full overflow-hidden bg-[#141825]">
            <div className="p-3 border-b border-[#2a2a34]">
              <h2 className="text-sm font-semibold text-white tracking-wide">Conversations</h2>
            </div>
            <MessageList
              onSelectConversation={handleSelectConversation}
              selectedConversationId={activeConversationId}
            />
          </aside>

          {/* Chat Area */}
          <section className="flex-1 flex flex-col bg-[#141825] overflow-hidden">
            {/* Chat Header */}
            <div className="chat-header p-3 border-b border-[#2a2a34] flex items-center justify-between">
              <div className="flex items-center">
                <div className="mr-3">
                  {activeConv?.avatar ? (
                    <img
                      src={activeConv.avatar}
                      alt={activeConv?.name}
                      className="h-9 w-9 rounded-full object-cover transition-transform duration-200 motion-safe:hover:scale-105 avatar-frame"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gray-700 flex items-center justify-center avatar-frame">
                      <User className="h-5 w-5 text-gray-300" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-medium text-white">
                    {activeConv?.name || 'Select a chat'}
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOtherCreator && (
                  <div className="flex items-center gap-1.5 bg-gray-800/30 backdrop-blur-sm rounded-full p-1 border border-gray-700/50">
                    <button
                      onClick={handleSendGift}
                      className="p-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg hover:from-purple-600 hover:to-pink-700 hover:scale-105 transition-all duration-200 hover:shadow-purple-500/25"
                      title="Send Gift"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/>
                      </svg>
                    </button>
                    <button
                      onClick={handleShowLove}
                      className="p-2.5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg hover:from-red-600 hover:to-pink-600 hover:scale-105 transition-all duration-200 hover:shadow-red-500/25"
                      title="Show Love"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </button>
                    <button
                      onClick={handleSendTip}
                      className="p-2.5 rounded-full bg-gradient-to-r from-yellow-500 to-orange-600 text-white shadow-lg hover:from-yellow-600 hover:to-orange-700 hover:scale-105 transition-all duration-200 hover:shadow-yellow-500/25"
                      title="Send Tip"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </button>
                    <button
                      onClick={handleBoostCreator}
                      className="p-2.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg hover:from-blue-600 hover:to-cyan-700 hover:scale-105 transition-all duration-200 hover:shadow-blue-500/25"
                      title="Boost Creator"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                      </svg>
                    </button>
                    <button
                      onClick={handleBuyDrink}
                      className="p-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg hover:from-pink-600 hover:to-purple-700 hover:scale-105 transition-all duration-200 hover:shadow-pink-500/25"
                      title="Buy a drink"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7 2v2h8V2c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1z"/>
                        <path d="M5 5v12c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4V5H5zm12 12c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2V7h10v10z"/>
                        <path d="M18 6h2c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-2V6z"/>
                        <circle cx="12" cy="12" r="2" fill="white" opacity="0.8"/>
                        <path d="M8 9h8v1H8V9z" fill="white" opacity="0.6"/>
                      </svg>
                    </button>
                  </div>
                )}
                <button className="text-gray-300 hover:text-white transition-colors duration-150">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div
              className="chat-surface flex-1 p-2 sm:p-4 overflow-y-auto no-anim scroll-smooth"
              style={{ height: 'calc(100vh - 180px)', maxHeight: 'calc(100vh - 180px)' }}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-4 flex ${
                    message.sender === 'user' ? 'justify-end' : 'justify-start'
                  } animate-slide-fade`}
                >
                  {message.sender === 'other' && (
                    <div className="mr-2">
                      {activeConv?.avatar ? (
                        <img
                          src={activeConv.avatar}
                          alt={activeConv?.name}
                          className="h-8 w-8 rounded-full object-cover transition-transform duration-200 motion-safe:hover:scale-105 avatar-frame"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center avatar-frame">
                          <User className="h-4 w-4 text-gray-300" />
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className={[
                      "bubble max-w-[85%] xs:max-w-[90%] sm:max-w-[75%] md:max-w-[58ch] px-2 xs:px-3 sm:px-4 py-1 xs:py-2 transition-all duration-200 will-change-transform",
                      message.sender === 'user'
                        ? "bubble--me bg-primary text-white"
                        : "bubble--other bg-gray-700 text-gray-100"
                    ].join(" ")}
                  >
                    {isImageUrl(message.text) ? (
                      <a href={message.text} target="_blank" rel="noreferrer">
                        <img
                          src={message.text}
                          alt="sent image"
                          className="max-h-32 xs:max-h-40 sm:max-h-56 md:max-h-64 max-w-full rounded-md mb-1 transition-transform duration-200 motion-safe:hover:scale-[1.01]"
                        />
                      </a>
                    ) : isInteractiveMessage(message.text) ? (
                      (() => {
                        const interactive = parseInteractiveMessage(message.text);
                        if (!interactive) return <p className="text-xs xs:text-sm break-words whitespace-pre-wrap">{message.text}</p>;
                        
                        return (
                          <div className="interactive-message w-full max-w-4xl">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-pink-500/10 to-purple-600/10 border border-pink-500/20 rounded-t-xl p-4">
                              <h3 className="text-sm font-semibold text-white mb-2">{interactive.mainQuestion}</h3>
                              <p className="text-xs text-gray-300 opacity-80">{interactive.followUp}</p>
                            </div>
                            
                            {/* Questions - Horizontal Row */}
                            <div className="bg-gray-800/50 border-x border-pink-500/20 p-4">
                              <div className="flex flex-wrap gap-2">
                                {interactive.questions.map((question: InteractiveQuestion, idx: number) => {
                                  const canReply = message.sender === 'other';
                                  return (
                                    <button
                                      key={idx}
                                      onClick={canReply ? () => handleInteractiveQuestion(question, message.id, message.sender) : undefined}
                                      className={[
                                        "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 group",
                                        canReply
                                          ? "bg-gray-700/50 hover:bg-gray-600/50 border-gray-600/30 hover:border-pink-500/40"
                                          : "bg-gray-700/30 border-gray-600/20 cursor-default opacity-75"
                                      ].join(' ')}
                                    >
                                    <div className="flex items-center gap-3">
                                      <div className="text-sm font-medium text-white group-hover:text-pink-300 transition-colors">
                                        {question.question}
                                      </div>
                                      <span className="text-xs font-semibold text-pink-400 bg-pink-500/20 px-2 py-1 rounded-full whitespace-nowrap">
                                        {question.points} pts
                                      </span>
                                    </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            
                            {/* Replies Section - only receivers should see reply buttons */}
                            {message.sender === 'other' && interactive.questions.some((q: InteractiveQuestion) => q.replies && q.replies.length > 0) && (
                              <div className="bg-gray-700/30 border-x border-pink-500/20 p-4">
                                {interactive.questions.map((question: InteractiveQuestion, qIdx: number) => {
                                  if (!question.replies || question.replies.length === 0) return null;

                                  const replyLocked = sentReplies.has(message.id);
                                  const isSending = sendingReplyMessageId === message.id;
                                  
                                  return (
                                    <div key={qIdx} className="mb-4 last:mb-0">
                                      <div className="text-xs text-gray-400 mb-2">Reply options:</div>
                                      <div className="flex flex-wrap gap-2">
                                        {question.replies.map((reply: string, rIdx: number) => (
                                          <button
                                            key={rIdx}
                                            disabled={replyLocked || isSending}
                                            onClick={!replyLocked && !isSending ? () => handleReplyClick(reply, question, message.id) : undefined}
                                            className={[
                                              "px-3 py-2 text-sm rounded-lg border transition-all duration-200",
                                              replyLocked || isSending
                                                ? "bg-gray-600/20 text-gray-400 border-gray-600/20 cursor-not-allowed opacity-70"
                                                : "bg-gray-600/50 text-gray-200 hover:bg-pink-500/20 hover:text-pink-300 border-gray-600/30 hover:border-pink-500/40"
                                            ].join(' ')}
                                          >
                                            {reply}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            
                            {/* Reply Box */}
                            {activeReply && activeReply.messageId === message.id && (
                              <div className="bg-gray-700/50 border-x border-pink-500/20 p-4">
                                <div className="mb-3">
                                  <p className="text-sm text-white mb-2">
                                    Replying to: <span className="text-pink-300">{activeReply.question.question}</span>
                                  </p>
                                  <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Write your message..."
                                    className="w-full p-3 rounded-lg bg-gray-800/50 border border-gray-600/30 text-white text-sm resize-none focus:outline-none focus:border-pink-500/40"
                                    rows={3}
                                    autoFocus
                                  />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={handleCancelReply}
                                    className="px-4 py-2 text-sm rounded-lg bg-gray-600/50 text-gray-300 hover:bg-gray-500/50 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={handleSendReply}
                                    className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700 transition-all"
                                  >
                                    Send
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {/* Footer */}
                            <div className="bg-gray-800/30 border border-pink-500/20 rounded-b-xl p-3">
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-xs xs:text-sm break-words whitespace-pre-wrap">{message.text}</p>
                    )}
                    <span className="time-chip">{message.time}</span>
                  </div>
                </div>
              ))}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />

              {/* Inline Action Questions */}
              {showInlineQuestions && (
                <div className="mb-4 flex justify-center animate-slide-fade">
                  <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 max-w-4xl w-full border border-gray-700/50 shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-white capitalize flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                          {showInlineQuestions === 'gift' ? '🎁' : showInlineQuestions === 'love' ? '❤️' : showInlineQuestions === 'tip' ? '⭐' : showInlineQuestions === 'boost' ? '🚀' : '☕'}
                        </span>
                        {showInlineQuestions} Action Questions
                      </h3>
                      <button
                        onClick={handleCloseInlineQuestions}
                        className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700/50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 justify-center">
                      {actionQuestions[showInlineQuestions as keyof typeof actionQuestions]?.map((q, index) => (
                        <button
                          key={q.id}
                          onClick={() => handleQuestionClick(q.id, q.question, showInlineQuestions, q.points)}
                          className="px-6 py-4 rounded-lg transition-all text-sm font-medium flex items-center gap-3 bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 border border-gray-600/30 hover:border-pink-500/30 hover:scale-105"
                        >
                          <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 text-xs flex items-center justify-center font-bold">
                            {index + 1}
                          </span>
                          {q.question}
                          {q.points && (
                            <span className="ml-2 px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-semibold">
                              {q.points} pts
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    
                  </div>
                </div>
              )}

              {!messages.length && (
                <div className="h-full w-full flex items-center justify-center text-sm text-gray-400">
                  {activeConv ? 'No messages yet. Say hi!' : 'Select a conversation'}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="composer p-2 sm:p-3 md:p-4 border-t border-[#2a2a34]">
              <div className="flex items-center">
                <button
                  className="icon-btn mr-2 text-gray-300 hover:text-white bg-[#1e2235] ring-1 ring-[rgba(255,61,110,.25)]"
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
                    placeholder="Type a message…"
                    className="input-glass w-full pl-4 pr-10 py-2 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition-shadow duration-150 shadow-sm focus:shadow bg-[#1e2235] text-white"
                    rows={1}
                  />
                  <button
                    className="absolute right-2 xs:right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors duration-150"
                    aria-label="Emoji"
                  >
                    <Smile className="h-4 w-4 xs:h-5 xs:w-5" />
                  </button>
                </div>

                <button
                  onClick={sendMessage}
                  className="icon-btn ml-2 bg-primary text-white hover:bg-primary-dark"
                  disabled={!newMessage.trim() || !activeConv || uploadingImage}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4 xs:h-5 xs:w-5" />
                </button>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

    </div>
  );
};

export default Messages;
