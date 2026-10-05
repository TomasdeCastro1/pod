import type { ScanListQuery } from '@app/shared';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, getToken } from '../api/client';

async function shareFile(file: File, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite compartir archivos');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

function tempDir(): Directory {
  const dir = new Directory(Paths.cache, 'compartir');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Baja la imagen (URL firmada de /scans/:id/image) a un archivo temporal y abre la hoja de compartir. */
export async function shareScanImage(scanId: string): Promise<void> {
  const { url } = await api.scans.imageUrl(scanId);
  const file = new File(tempDir(), `comprobante-${scanId}.jpg`);
  const downloaded = await File.downloadFileAsync(url, file, { idempotent: true });
  await shareFile(downloaded, 'image/jpeg', 'Compartir comprobante');
}

/** Baja scans.csv con los filtros activos (header Authorization) y abre la hoja de compartir. */
export async function shareCsv(companyId: string, query: ScanListQuery): Promise<void> {
  const token = await getToken();
  const file = new File(tempDir(), `comprobantes-${Date.now()}.csv`);
  const downloaded = await File.downloadFileAsync(api.scans.csvUrl(companyId, query), file, {
    idempotent: true,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  await shareFile(downloaded, 'text/csv', 'Exportar comprobantes');
}
