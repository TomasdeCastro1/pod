import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiUser, MeCompany } from '@app/shared';
import { api, getToken, onUnauthorized, setToken } from '../api/client';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: ApiUser | null;
  companies: MeCompany[];
  /** Empresa activa (placeholder: la primera; el selector llega en T5.1). */
  activeCompany: MeCompany | null;
  signIn: (token: string, user: ApiUser, companies: MeCompany[]) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [companies, setCompanies] = useState<MeCompany[]>([]);

  const clear = useCallback(() => {
    setUser(null);
    setCompanies([]);
    setStatus('signedOut');
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    clear();
  }, [clear]);

  const signIn = useCallback(async (token: string, u: ApiUser, c: MeCompany[]) => {
    await setToken(token);
    setUser(u);
    setCompanies(c);
    setStatus('signedIn');
  }, []);

  // 401 con sesión: el cliente ya borró el token; acá se cierra la sesión en la UI.
  useEffect(() => onUnauthorized(clear), [clear]);

  // Al abrir: si hay token, se valida contra /me. Sin conexión se conserva la sesión.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return cancelled || clear();
      try {
        const me = await api.me.get();
        if (cancelled) return;
        setUser(me.user);
        setCompanies(me.companies);
        setStatus('signedIn');
      } catch {
        // 401 ya llamó a clear(); otro error (red): se entra igual y las pantallas reintentan.
        if (!cancelled && (await getToken())) setStatus('signedIn');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      companies,
      activeCompany: companies[0] ?? null,
      signIn,
      signOut,
    }),
    [status, user, companies, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
