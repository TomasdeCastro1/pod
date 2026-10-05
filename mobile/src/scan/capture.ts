import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';
import { api } from '../api/client';
import { createCaptureQueue } from '../queue/queue';
import { sqliteStore } from '../queue/sqliteStore';
import { resizeTarget, type CaptureItem } from './manager';

async function prepareImage(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const ref = await ctx.renderAsync();
  const target = resizeTarget(ref.width, ref.height);
  const final = target ? await ImageManipulator.manipulate(uri).resize(target).renderAsync() : ref;
  const out = await final.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return out.uri;
}

async function getLocation() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync();
    const pos =
      last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Mueve la imagen a documentDirectory (el caché lo puede borrar el sistema). */
async function persistFile(uri: string, clientId: string): Promise<string> {
  const dir = new Directory(Paths.document, 'captures');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${clientId}.jpg`);
  const src = new File(uri);
  try {
    src.move(dest);
  } catch {
    src.copy(dest);
  }
  return dest.uri;
}

async function deleteFile(uri: string): Promise<void> {
  const f = new File(uri);
  if (f.exists) f.delete();
}

/** Cola persistente de capturas (SQLite + archivos en documentDirectory). */
export const captures = createCaptureQueue({
  store: sqliteStore(() => SQLite.openDatabaseAsync('captures.db')),
  prepareImage,
  persistFile,
  deleteFile,
  newId: () => Crypto.randomUUID(),
  getLocation,
  upload: (companyId, p) => api.scans.upload(companyId, p),
  getScan: (id) => api.scans.get(id),
});

export const enqueueCapture = captures.enqueueCapture;
export const dismissAlert = captures.dismissAlert;

let started = false;
/**
 * Arranca la cola: procesa lo que quedó de la sesión anterior y engancha los disparadores
 * (vuelve la conexión, la app vuelve a primer plano). Se llama una vez, con sesión iniciada.
 */
export function startCaptureQueue(): void {
  if (started) return;
  started = true;
  void captures.start();
  NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) captures.kick(true);
  });
  AppState.addEventListener('change', (st) => {
    if (st === 'active') captures.kick(true);
  });
}

/** Cantidad de capturas que todavía no llegaron al servidor. */
export const pendingCaptureCount = captures.pendingCount;
export const discardPendingCaptures = captures.clearAll;

/** true cuando NetInfo sabe que no hay conexión. */
export function useIsOffline(): boolean {
  const s = useNetInfo();
  return s.isConnected === false || s.isInternetReachable === false;
}

export function useCaptures(): CaptureItem[] {
  return useSyncExternalStore(captures.subscribe, captures.getCaptures);
}

/** Abre el escáner nativo. Devuelve la URI de la imagen, null si cancela; lanza si falla al iniciar. */
export async function openScanner(): Promise<string | null> {
  const res = await DocumentScanner.scanDocument({
    maxNumDocuments: 1,
    croppedImageQuality: 100,
    responseType: ResponseType.ImageFilePath,
  });
  if (res.status === ScanDocumentResponseStatus.Success && res.scannedImages?.[0]) {
    return res.scannedImages[0];
  }
  return null;
}
