// Hands one exported text file to you: the iOS share sheet in the iPhone app, else the browser's share sheet or a download.
import { isNative } from './native/bridge.js';
import { shareNative } from './native/share.js';

export async function deliver(filename, text, type) {
  const blob = new Blob([text], { type });
  // In the iPhone app a download does nothing: write to the cache and open the iOS share sheet (Save to Files, AirDrop…).
  if (isNative()) { await shareNative(blob, filename, filename); return; }
  const file = new File([blob], filename, { type });
  // On iPhone, the share sheet is the reliable way to save a file ("Save to Files").
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
