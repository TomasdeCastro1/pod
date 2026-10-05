import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { decideStartRoute } from '../src/state/session';

/** Punto de entrada: sin sesión al login, sin empresa a «Tu empresa», con todo directo al escáner. */
export default function Index() {
  const { status, companies } = useAuth();
  const route = decideStartRoute(status, companies);
  if (!route) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Redirect href={route} />;
}
