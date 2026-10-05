import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { decideStartRoute } from '../src/state/session';

/** Si la sesión se cae (cerrar sesión, 401) estando en las pestañas, vuelve al flujo que corresponda. */
function SessionGuard() {
  const { status, companies } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const inTabs = segments[0] === '(tabs)';

  useEffect(() => {
    const route = decideStartRoute(status, companies);
    if (inTabs && route && route !== '/(tabs)/escanear') router.replace(route);
  }, [status, companies, inTabs, router]);

  return null;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <SessionGuard />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
