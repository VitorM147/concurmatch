import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Profile } from './api';
import { clearPhotoCache } from './photos';
import { supabase } from './supabase';

interface SessionState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  hasPhoto: boolean;
  profileError: boolean;
  recovery: boolean;
  setRecovery: (value: boolean) => void;
  refreshProfile: () => Promise<void>;
}
const Ctx = createContext<SessionState>({ ready: false, session: null, profile: null,
  hasPhoto: false, profileError: false, recovery: false, setRecovery: () => {}, refreshProfile: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const [recovery, updateRecovery] = useState(false);
  const setRecovery = useCallback((value: boolean) => updateRecovery(value), []);
  const userId = session?.user.id ?? null;
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const generation = useRef(0);

  const refreshProfile = useCallback(async () => {
    const uid = currentUser.current;
    const version = ++generation.current;
    if (!uid) {
      setProfileError(false);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(data.session);
      } catch { setProfileError(true); }
      return;
    }
    setProfileError(false);
    try {
      const p = await api.myProfile(uid);
      const photos = p ? await api.myPhotos() : [];
      if (version !== generation.current || uid !== currentUser.current) return;
      setProfile(p); setHasPhoto(photos.length > 0);
    } catch {
      if (version === generation.current && uid === currentUser.current) setProfileError(true);
    } finally {
      if (version === generation.current && uid === currentUser.current) setLoadedUser(uid);
    }
  }, []);

  useEffect(() => {
    let alive = true, observedEvent = false;
    // Keep auth callbacks synchronous: profile requests run in a separate effect.
    const { data: sub } = supabase.auth.onAuthStateChange((event, value) => {
      if (!alive) return;
      observedEvent = true;
      setSession(value); setInitialized(true);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (!value) setRecovery(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (alive && !observedEvent) { setSession(data.session); setProfileError(!!error); }
    }).catch(() => { if (alive) setProfileError(true); })
      .finally(() => { if (alive) setInitialized(true); });
    return () => { alive = false; generation.current++; sub.subscription.unsubscribe(); };
  }, [setRecovery]);

  useEffect(() => {
    generation.current++;
    setProfile(null); setHasPhoto(false); setLoadedUser(null);
    clearPhotoCache();
    if (userId) void refreshProfile();
    else setProfileError(false);
  }, [userId, refreshProfile]);

  const ready = initialized && (!userId || loadedUser === userId);
  return <Ctx.Provider value={{ ready, session, profile, hasPhoto, profileError, recovery,
    setRecovery, refreshProfile }}>{children}</Ctx.Provider>;
}
export const useSession = () => useContext(Ctx);
