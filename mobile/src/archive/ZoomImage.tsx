import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Image, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/** Visor a pantalla completa: pinch para zoom (PanResponder, sin dependencias nativas extra), arrastrar para desplazar, doble toque para restablecer. */
export function ZoomViewer({
  uri,
  visible,
  onClose,
}: {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const state = useRef({ scale: 1, x: 0, y: 0, baseScale: 1, baseX: 0, baseY: 0 });

  const apply = () => {
    const s = state.current;
    scale.setValue(s.scale);
    tx.setValue(s.x);
    ty.setValue(s.y);
  };

  const reset = () => {
    state.current = { scale: 1, x: 0, y: 0, baseScale: 1, baseX: 0, baseY: 0 };
    apply();
  };

  const gesture = useRef({
    pinching: false,
    startDist: 0,
    lastTap: 0,
  });

  const dist = (t: readonly { pageX: number; pageY: number }[]) =>
    Math.hypot((t[0]?.pageX ?? 0) - (t[1]?.pageX ?? 0), (t[0]?.pageY ?? 0) - (t[1]?.pageY ?? 0));

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const g = gesture.current;
        const s = state.current;
        s.baseX = s.x;
        s.baseY = s.y;
        s.baseScale = s.scale;
        g.pinching = false;
      },
      onPanResponderMove: (e, pan) => {
        const g = gesture.current;
        const s = state.current;
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const d = dist(touches);
          if (!g.pinching) {
            g.pinching = true;
            g.startDist = d || 1;
            s.baseScale = s.scale;
          }
          s.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s.baseScale * (d / g.startDist)));
          apply();
        } else if (!g.pinching && s.scale > MIN_SCALE) {
          s.x = s.baseX + pan.dx;
          s.y = s.baseY + pan.dy;
          apply();
        }
      },
      onPanResponderRelease: (_e, pan) => {
        const g = gesture.current;
        const s = state.current;
        const moved = Math.abs(pan.dx) + Math.abs(pan.dy) > 10;
        if (g.pinching) {
          if (s.scale <= MIN_SCALE) reset();
          return;
        }
        if (moved) return;
        // Doble toque: alterna entre zoom 2,5x y tamaño original.
        const now = Date.now();
        if (now - g.lastTap < 300) {
          g.lastTap = 0;
          if (s.scale > MIN_SCALE) reset();
          else {
            s.scale = 2.5;
            apply();
          }
        } else {
          g.lastTap = now;
        }
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={reset}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <View style={styles.stage} {...responder.panHandlers}>
          {uri ? (
            <Animated.Image
              source={{ uri }}
              resizeMode="contain"
              style={[
                styles.image,
                { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
              ]}
              accessibilityLabel="Imagen del comprobante"
            />
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar imagen"
          onPress={() => {
            reset();
            onClose();
          }}
          style={[styles.close, { top: insets.top + 12 }]}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

/** Vista previa en la pantalla de detalle; tocarla abre el visor con zoom. */
export function ImagePreview({ uri, onPress }: { uri: string | null; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel="Ver imagen del comprobante con zoom"
      onPress={onPress}
      style={styles.preview}
    >
      {uri ? <Image source={{ uri }} style={styles.previewImg} resizeMode="contain" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  close: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { height: 260, backgroundColor: '#111', borderRadius: 12, overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
});
