import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiUser, MeCompany, MeResponse } from '@app/shared';
import * as SecureStore from 'expo-secure-store';
import { api, getToken, onUnauthorized, setToken } from '../api/client';
import { pickActiveCompany, upsertCompany, type SessionStatus } from '../state/session';

const ACTIVE_COMPANY_KEY = 'active_company_id';

async function readActiveId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACTIVE_COMPANY_KEY);
  } catch {
    return null;
  }
}

const ME_CACHE_KEY = 'me_cache';

async function readMeCache(): Promise<MeResponse | null> {
  try {
    const raw = await SecureStore.getItemAsync(ME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch {
    return null;
  }
}

async function writeMeCache(me: MeResponse | null): Promise<void> {
  try {
    if (me) await SecureStore.setItemAsync(ME_CACHE_KEY, JSON.stringify(me));
    else await SecureStore.deleteItemAsync(ME_CACHE_KEY);
  } catch {
    // Solo es un caché.
  }
}

async function writeActiveId(id: string | null): Promise<void> {
  try {
    if (id) await SecureStore.setItemAsync(ACTIVE_COMPANY_KEY, id);
    else await SecureStore.deleteItemAsync(ACTIVE_COMPANY_KEY);
  } catch {
    // Si no se puede guardar, se usa la primera empresa la próxima vez.
  }
}

interface AuthState {
  status: SessionStatus;
  user: ApiUser | null;
  companies: MeCompany[];
  /** Empresa activa (persistida por id; el selector llega en T5.1). */
  activeCompany: MeCompany | null;
  setActiveCompanyId: (id: string) => void;
  /** Suma (o actualiza) una empresa recién creada o unida y la deja activa. */
  addCompany: (company: MeCompany) => void;
  signIn: (token: string, user: ApiUser, companies: MeCompany[]) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [companies, setCompanies] = useState<MeCompany[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const clear = useCallback(() => {
    setUser(null);
    setCompanies([]);
    setStatus('signedOut');
    void writeMeCache(null);
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    await Promise.all([writeActiveId(null), writeMeCache(null)]);
    setActiveId(null);
    clear();
  }, [clear]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveId(id);
    void writeActiveId(id);
  }, []);

  const addCompany = useCallback(
    (company: MeCompany) => {
      setCompanies((prev) => upsertCompany(prev, company));
      setActiveCompanyId(company.id);
    },
    [setActiveCompanyId],
  );

  const signIn = useCallback(async (token: string, u: ApiUser, c: MeCompany[]) => {
    await setToken(token);
    setUser(u);
    setCompanies(c);
    setActiveId(await readActiveId());
    setStatus('signedIn');
  }, []);

  // 401 con sesión: el cliente ya borró el token; acá se cierra la sesión en la UI.
  useEffect(() => onUnauthorized(clear), [clear]);

  // Al abrir: se arranca con lo guardado (para ir directo al escáner, incluso sin red)
  // y se refresca /me en segundo plano.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return cancelled || clear();
      const [stored, cached] = await Promise.all([readActiveId(), readMeCache()]);
      if (cancelled) return;
      setActiveId(stored);
      if (cached) {
        setUser(cached.user);
        setCompanies(cached.companies);
        setStatus('signedIn');
      }
      try {
        const me = await api.me.get();
        if (cancelled) return;
        setUser(me.user);
        setCompanies(me.companies);
        setStatus('signedIn');
        void writeMeCache(me);
      } catch {
        // 401: el cliente ya llamó a clear(). Sin red y sin datos guardados: al login (el token se conserva).
        if (!cancelled && !cached && (await getToken())) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  // Mantiene el caché local al día con cada cambio de usuario o empresas.
  useEffect(() => {
    if (status === 'signedIn' && user) void writeMeCache({ user, companies });
  }, [status, user, companies]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      companies,
      activeCompany: pickActiveCompany(companies, activeId),
      setActiveCompanyId,
      addCompany,
      signIn,
      signOut,
    }),
    [status, user, companies, activeId, setActiveCompanyId, addCompany, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
