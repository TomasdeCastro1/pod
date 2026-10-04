function folder(companyId: string, capturedAt: Date): string {
  const yyyy = String(capturedAt.getUTCFullYear()).padStart(4, '0');
  const mm = String(capturedAt.getUTCMonth() + 1).padStart(2, '0');
  return `${companyId}/${yyyy}/${mm}`;
}

/** `{company_id}/{aaaa}/{mm}/{scan_id}.jpg` (año y mes en UTC). */
export function imageKey(companyId: string, capturedAt: Date, scanId: string): string {
  return `${folder(companyId, capturedAt)}/${scanId}.jpg`;
}

/** Misma carpeta que la imagen: `{scan_id}_thumb.jpg`. */
export function thumbKey(companyId: string, capturedAt: Date, scanId: string): string {
  return `${folder(companyId, capturedAt)}/${scanId}_thumb.jpg`;
}
