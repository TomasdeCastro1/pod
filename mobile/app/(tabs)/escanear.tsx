import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button } from '../../src/components/ui';
import { AlertModal } from '../../src/scan/AlertModal';
import { isBlockingAlert, pickAlert } from '../../src/scan/alerts';
import {
  captures,
  dismissAlert,
  enqueueCapture,
  openScanner,
  useCaptures,
} from '../../src/scan/capture';
import { rescan } from '../../src/scan/manager';
import { ScanStrip } from '../../src/scan/ScanStrip';
import { colors } from '../../src/theme';

export default function EscanearScreen() {
  const { activeCompany } = useAuth();
  const focused = useIsFocused();
  const items = useCaptures();
  const [scanning, setScanning] = useState(false);
  const [paused, setPaused] = useState(false); // el repartidor cerró el escáner
  const [scannerError, setScannerError] = useState<string | null>(null);
  const busy = useRef(false);

  // Primera alerta bloqueante sin atender.
  const alertItem = items.find((it) => {
    if (!it.scan || it.alertDismissed) return false;
    return isBlockingAlert(pickAlert(it.scan));
  });
  const alertKind = alertItem?.scan ? pickAlert(alertItem.scan) : null;
  const blocking = isBlockingAlert(alertKind) ? alertKind : null;

  useEffect(() => {
    if (blocking) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [blocking, alertItem?.clientId]);

  const companyId = activeCompany?.id;

  const scanOnce = useCallback(
    async (replacesScanId?: string): Promise<boolean> => {
      if (!companyId || busy.current) return false;
      busy.current = true;
      setScanning(true);
      setScannerError(null);
      try {
        const uri = await openScanner();
        if (!uri) {
          setPaused(true); // cerró el escáner: no se reabre solo hasta que toque el botón
          return false;
        }
        enqueueCapture({ companyId, imageUri: uri, replacesScanId });
        return true;
      } catch {
        setScannerError(
          'No se pudo abrir la cámara. Revisá que la app tenga permiso de cámara en los ajustes del celular.',
        );
        return false;
      } finally {
        busy.current = false;
        setScanning(false);
      }
    },
    [companyId],
  );

  // Escaneo continuo: al entrar a la pestaña se abre el escáner y se reabre tras cada captura.
  useEffect(() => {
    if (!focused || paused || blocking || scanning || scannerError || !companyId) return;
    void scanOnce();
  }, [focused, paused, blocking, scanning, scannerError, companyId, scanOnce]);

  const onRescan = async () => {
    if (!alertItem?.scanId || !companyId) return;
    const target = { companyId, scanId: alertItem.scanId };
    dismissAlert(alertItem.clientId);
    // Mientras el escáner está abierto no se reabre solo (busy).
    busy.current = true;
    setScanning(true);
    try {
      await rescan({ enqueueCapture }, openScanner, target);
    } catch {
      setScannerError('No se pudo abrir la cámara.');
    } finally {
      busy.current = false;
      setScanning(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        {scannerError ? (
          <>
            <Text style={styles.error}>{scannerError}</Text>
            <Button title="Reintentar" onPress={() => setScannerError(null)} />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {scanning ? 'Escaneando…' : 'Tocá para escanear un comprobante'}
            </Text>
            <Button
              title="Escanear"
              loading={scanning}
              onPress={() => {
                setPaused(false);
                void scanOnce();
              }}
            />
          </>
        )}
      </View>
      <ScanStrip items={items} />
      <AlertModal
        kind={blocking}
        onRescan={() => void onRescan()}
        onKeep={() => alertItem && captures.dismissAlert(alertItem.clientId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  hint: { fontSize: 17, color: colors.textMuted, textAlign: 'center' },
  error: { fontSize: 16, color: '#C62828', textAlign: 'center' },
});
