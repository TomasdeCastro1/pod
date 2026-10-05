import { Ionicons } from '@expo/vector-icons';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { alertMessage } from './alerts';

/** Alerta roja a pantalla completa (§9.3). La vibración la dispara quien la muestra. */
export function AlertModal({
  kind,
  onRescan,
  onKeep,
}: {
  kind: 'firma' | 'no_leido' | null;
  onRescan: () => void;
  onKeep: () => void;
}) {
  return (
    <Modal
      visible={kind !== null}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onKeep}
    >
      <View style={styles.screen}>
        <Ionicons name="warning" size={72} color="#fff" />
        <Text style={styles.message} accessibilityRole="alert">
          {kind ? alertMessage(kind) : ''}
        </Text>
        <View style={styles.buttons}>
          <Button title="Volver a escanear" onPress={onRescan} variant="secondary" />
          {kind === 'firma' ? (
            <Button title="Guardar igual" onPress={onKeep} variant="link" />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#C62828',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 24,
  },
  message: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 32 },
  buttons: { alignSelf: 'stretch', gap: 8, backgroundColor: '#fff', borderRadius: 14, padding: 8 },
});
