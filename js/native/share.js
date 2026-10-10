// Files leave the iPhone app through the iOS share sheet (Save to Files, AirDrop, Mail, Print…). WKWebView ignores
// <a download>, so in the app a file is written to the cache folder with @capacitor/filesystem, handed to
// @capacitor/share, and deleted again. Callers use this only when isNative(); the web paths stay as they were.
import { isNative, plugin } from './bridge.js';

export const SHARE_ERROR = 'Couldn’t open the share sheet. Try again.';
export const WRITE_ERROR = 'Couldn’t get that file ready. Try again.';
const CHUNK = 3 * 1024 * 1024; // bytes per write; a multiple of 3 so each piece is clean base64. Keeps a 100+ MB zip from freezing the screen

/** True when the share sheet route is available (inside the app with both plugins). */
export const canShareNative = () => isNative() && !!plugin('Filesystem') && !!plugin('Share');

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const safeName = (name) => String(name).replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'forge-file';
const isCancel = (e) => /cancel/i.test(String((e && (e.message || e.errorMessage)) || e || ''));
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Write `blob` to the cache folder and open the share sheet. Resolves 'shared' or 'cancelled' (closing the sheet is
 * not an error). Throws an Error with a friendly message if writing or sharing fails. The cache file is always removed.
 */
export async function shareNative(blob, name, title) {
  const FS = plugin('Filesystem');
  const Share = plugin('Share');
  if (!FS || !Share) throw new Error(SHARE_ERROR);
  const path = `forge-share/${safeName(name)}`;
  let written = false;
  try {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let at = 0; at < Math.max(bytes.length, 1); at += CHUNK) {
        const data = toBase64(bytes.subarray(at, at + CHUNK));
        if (at === 0) await FS.writeFile({ path, data, directory: 'CACHE', recursive: true });
        else await FS.appendFile({ path, data, directory: 'CACHE' });
        written = true;
        await tick(); // let the screen draw between pieces
      }
    } catch {
      throw new Error(WRITE_ERROR);
    }
    let uri;
    try {
      uri = (await FS.getUri({ path, directory: 'CACHE' })).uri;
    } catch {
      throw new Error(WRITE_ERROR);
    }
    try {
      await Share.share({ title, files: [uri] });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      throw new Error(SHARE_ERROR);
    }
  } finally {
    if (written) { try { await FS.deleteFile({ path, directory: 'CACHE' }); } catch { /* the OS clears the cache anyway */ } }
  }
}
