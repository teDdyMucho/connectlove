import { supabase } from '../lib/supabaseClient';
// Generic helper for supporting a creator via webhook
// This module is UI-agnostic and can be reused anywhere.

export type SupportTags = Record<string, string>; // key: supporterId, value: tier/tag

export interface HandleSupportCreatorParams {
  supporterId: string;
  creatorId: string;
  selectedTier: string;
  supporterName: string;
  creatorName: string;
  // Accepts either a full map or an updater function
  setSupportTags: (next: SupportTags | ((prev: SupportTags) => SupportTags)) => void;
  setLoading?: (loading: boolean) => void;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  webhookUrl?: string; // optional override
  following?: boolean; // optional follow action
}

const DEFAULT_WEBHOOK = 'https://primary-production-6722.up.railway.app/webhook/b6898404-3957-48ad-b8a8-b3ba30e1a9ab';

export async function handleSupportCreator({
  supporterId,
  creatorId,
  selectedTier,
  supporterName,
  creatorName,
  setSupportTags,
  setLoading,
  onSuccess,
  onError,
  webhookUrl,
  following,
}: HandleSupportCreatorParams): Promise<void> {
  const url = webhookUrl || DEFAULT_WEBHOOK;
  try {
    setLoading?.(true);

    // Resolve database IDs strictly to the primary key `id`
    type UserRow = { id?: string | null; email?: string | null; username?: string | null };
    const resolveUserId = async (identifier: string): Promise<string> => {
      // 1) Try email
      if (identifier.includes('@')) {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('email', identifier)
          .maybeSingle();
        const row = (data as unknown) as UserRow | null;
        if (!error && row) return row.id || identifier;
      }
      // 2) Try username
      {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('username', identifier)
          .maybeSingle();
        const row = (data as unknown) as UserRow | null;
        if (!error && row) return row.id || identifier;
      }
      // 3) Try id direct match
      {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('id', identifier)
          .maybeSingle();
        const row = (data as unknown) as UserRow | null;
        if (!error && row) return row.id || identifier;
      }
      // Fallback: assume already an id
      return identifier;
    };

    const uuidLike = (v: string) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v);
    const supporterDbId = uuidLike(supporterId) ? supporterId : await resolveUserId(supporterId);
    // For creator, most likely a username; still resolve via users table
    const creatorDbId = uuidLike(creatorId) ? creatorId : await resolveUserId(creatorId);

    // Hard requirement: send IDs only. If we couldn't resolve to an id-format, abort.
    if (!uuidLike(supporterDbId)) {
      const msg = 'Could not resolve supporter to a valid ID. Please re-login or try again.';
      if (onError) onError(msg); else window.alert(msg);
      return;
    }
    if (!uuidLike(creatorDbId)) {
      const msg = 'Could not resolve creator to a valid ID.';
      if (onError) onError(msg); else window.alert(msg);
      return;
    }

    // Build request body while avoiding unintended DB mutations:
    // - Only include 'tier' when subscribing/upgrading (selectedTier truthy).
    // - For follow/unfollow (explicit boolean), DO NOT include 'tier'.
    // - Only include 'following' when it should change; otherwise omit it.
    const requestBody: Record<string, unknown> = {
      supporter_id: supporterDbId,
      creator_id: creatorDbId,
      supporter_name: supporterName || null,
      creator_name: creatorName || null,
    };

    if (selectedTier) {
      requestBody.tier = selectedTier; // subscribe/upgrade flow
      // On subscribe/upgrade, auto-follow unless explicitly overridden
      if (typeof following === 'boolean') {
        requestBody.following = following;
      } else {
        requestBody.following = true;
      }
    } else if (typeof following === 'boolean') {
      // Follow/unfollow only; do not send tier
      requestBody.following = following;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const msg = `Support request failed (${res.status}): ${text || 'Unknown error'}`;
      if (onError) {
        onError(msg);
      } else {
        window.alert(msg);
      }
      return;
    }

    // success -> update local tags map for this supporter (by resolved ID)
    setSupportTags((prev) => ({ ...(prev || {}), [supporterDbId]: selectedTier }));
    onSuccess?.();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    if (onError) {
      onError(msg);
    } else {
      window.alert(msg);
    }
  } finally {
    setLoading?.(false);
  }
}

export default handleSupportCreator;

