// Shared upload identifier rules; temporary IDs carry a server-generated creation timestamp.
export const clientImageIdPattern = /^(?:tmp_)?\d{8}T\d{9}Z_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg)$/;
export const TEMP_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
export function temporaryImageExpiry(id: string): number | null {
  if (!id.startsWith('tmp_')) return null;
  if (!clientImageIdPattern.test(id)) return 0;
  const stamp=id.slice(4,23);
  const created=Date.parse(`${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(9,11)}:${stamp.slice(11,13)}:${stamp.slice(13,15)}.${stamp.slice(15,18)}Z`);
  return Number.isFinite(created) ? created + TEMP_IMAGE_TTL_MS : 0;
}
