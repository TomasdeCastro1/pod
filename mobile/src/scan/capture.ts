import { useSyncExternalStore } from 'react';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';
import { api } from '../api/client';
import { createCaptureManager, resizeTarget, type CaptureItem } from './manager';

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

/** Instancia de la app. T6.1 la reemplaza por la cola persistente con la misma interfaz. */
export const captures = createCaptureManager({
  prepareImage,
  newId: () => Crypto.randomUUID(),
  getLocation,
  upload: (companyId, p) => api.scans.upload(companyId, p),
  getScan: (id) => api.scans.get(id),
});

export const enqueueCapture = captures.enqueueCapture;
export const dismissAlert = captures.dismissAlert;

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
