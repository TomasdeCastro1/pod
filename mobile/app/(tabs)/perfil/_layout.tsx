import { Stack } from 'expo-router';
import { CompanyHeader } from '../../../src/components/CompanyHeader';

export default function PerfilLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Atrás' }}>
      <Stack.Screen name="index" options={{ header: () => <CompanyHeader /> }} />
      <Stack.Screen name="agregar" options={{ title: 'Agregar empresa' }} />
      <Stack.Screen name="empresa/[id]/index" options={{ title: 'Empresa' }} />
      <Stack.Screen name="empresa/[id]/campos" options={{ title: 'Campos a leer' }} />
      <Stack.Screen name="empresa/[id]/uso" options={{ title: 'Uso y precio' }} />
    </Stack>
  );
}
