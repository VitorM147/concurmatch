import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Profile } from './api';
import { supabase } from './supabase';

interface SessionState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  hasPhoto: boolean;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<SessionState>({ ready: false, session: null, profile: null, hasPhoto: false, refreshProfile: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.myProfile();
      setHasPhoto(p ? (await api.myPhotos()).length > 0 : false);
      setProfile(p);
    } catch { setProfile(null); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshProfile();
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) await refreshProfile(); else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshProfile]);

  return <Ctx.Provider value={{ ready, session, profile, hasPhoto, refreshProfile }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
