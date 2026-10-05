import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';

/** Punto de entrada: sin sesión va al login; con sesión, directo al escáner. */
export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Redirect href={status === 'signedIn' ? '/(tabs)/escanear' : '/(auth)/login'} />;
}
