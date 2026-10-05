import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { Body, Button, FormScreen, Title } from '../../src/components/ui';

export default function CameraPermissionScreen() {
  const router = useRouter();
  const [permission, request] = useCameraPermissions();

  useEffect(() => {
    if (permission?.granted) router.replace('/(tabs)/escanear');
  }, [permission?.granted, router]);

  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <FormScreen>
      <Title>Necesitamos la cámara</Title>
      <Body>
        Usamos la cámara para sacarle una foto a cada comprobante firmado. Las fotos solo las ve tu
        empresa.
      </Body>
      {denied ? (
        <>
          <Body>
            Dijiste que no a la cámara. Para activarla, abrí Ajustes, entrá a Permisos y prendé
            Cámara.
          </Body>
          <Button title="Abrir Ajustes" onPress={() => void Linking.openSettings()} />
        </>
      ) : (
        <Button title="Permitir cámara" onPress={() => void request()} />
      )}
      <Button title="Ahora no" onPress={() => router.replace('/(tabs)/escanear')} variant="link" />
    </FormScreen>
  );
}
