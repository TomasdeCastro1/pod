import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { CompanyHeader } from '../../src/components/CompanyHeader';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="escanear"
      screenOptions={{
        header: () => <CompanyHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="escanear"
        options={{
          title: 'Escanear',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="archivo"
        options={{
          title: 'Archivo',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-open" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
