import type { ExpoConfig } from 'expo/config';

// Identificador provisorio (CLAUDE.md): no se puede cambiar después del primer build.
const APP_ID = 'uy.puntosano.comprobantes';

const config: ExpoConfig = {
  name: 'Comprobantes',
  slug: 'comprobantes',
  scheme: 'comprobantes',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // Provisorios, generados con `node mobile/scripts/generate-icons.mjs` (ver docs/store/iconos.md).
  // Splash: falta instalar expo-splash-screen y registrar el plugin (instrucciones en ese documento).
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1F4E79',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    'expo-sharing',
    '@react-native-community/datetimepicker',
    [
      'react-native-document-scanner-plugin',
      { cameraPermission: 'Para fotografiar los comprobantes firmados en cada entrega' },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Para registrar dónde se fotografió cada comprobante',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
};

export default config;
