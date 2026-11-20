import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'teacher' | 'parent' | 'office_assistant' | 'accountant' | 'student';
export type UserStatus = 'active' | 'suspended';

export type UserProfile = {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  bootstrapAdmin: (username: string, password: string, fullName: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@schooldesk.local`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, full_name, role, status, created_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) return null;
      return data as UserProfile | null;
    } catch {
      return null;
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      const p = await loadProfile(session.user.id);
      setProfile(p);
    }
  };

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        if (s?.user?.id) {
          loadProfile(s.user.id).then((p) => {
            setProfile(p);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user?.id) {
        (async () => {
          const p = await loadProfile(s.user.id);
          setProfile(p);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const signIn = async (username: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error) return { error: 'Invalid username or password.' };
      return { error: null };
    } catch {
      return { error: 'Could not reach the school server. Check your connection and try again.' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Session is cleared locally even when the server is unreachable.
    }
    setProfile(null);
    setSession(null);
  };

  const bootstrapAdmin = async (
    username: string,
    password: string,
    fullName: string,
  ): Promise<{ error: string | null }> => {
    const pseudoEmail = usernameToEmail(username);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: pseudoEmail,
        password,
      });

      if (signUpError) return { error: signUpError.message };
      if (!signUpData.user) return { error: 'Account creation failed.' };

      const { error: rpcError } = await supabase.rpc('set_initial_admin', {
        p_user_id: signUpData.user.id,
        p_username: username,
        p_full_name: fullName,
      });

      if (rpcError) {
        return { error: rpcError.message };
      }

      return { error: null };
    } catch {
      return { error: 'Could not reach the school server. Check your connection and try again.' };
    }
  };

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, profile, loading,
      signIn, signOut, refreshProfile, bootstrapAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
