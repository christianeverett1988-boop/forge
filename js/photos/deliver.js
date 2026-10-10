// Hands a finished file (video, photo strip or zip) to you: the share sheet where the browser can share files,
// otherwise a download. Sharing needs a fresh tap, so building and sharing are two steps: the file is made
// first, then a button the person taps does the sharing. Nothing is uploaded by Forge.
import { sheet, esc, toast } from '../ui.js';
import { icon } from '../ui/icons.js';
import { fmtBytes } from './core.js';
import { isNative } from '../native/bridge.js';
import { shareNative } from '../native/share.js';

export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Share if possible (must be called from a tap), else download. Returns 'shared' | 'saved' | 'cancelled'. */
export async function shareOrSave(blob, name, title) {
  if (isNative()) return shareNative(blob, name, title); // 'shared' | 'cancelled'; throws a friendly Error on failure
  const file = new File([blob], name, { type: blob.type });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // anything else: fall back to a download
    }
  }
  downloadBlob(blob, name);
  return 'saved';
}

/** A sheet that shows what was made with Share/Save and Save buttons. `preview` is HTML for the top. */
export function deliverSheet({ title, blob, name, preview = '', note = '', onClose }) {
  return sheet(title, (body) => {
    if (onClose) body.closest('dialog').addEventListener('close', onClose);
    const file = new File([blob], name, { type: blob.type });
    const native = isNative(); // the iOS share sheet has Save to Files, so no separate download button there
    const share = native || canShareFile(file);
    body.innerHTML = `<div class="stack tl-result">${preview}
      <p class="small muted">${esc(name)} · ${fmtBytes(blob.size)}</p>${note ? `<p class="small muted">${esc(note)}</p>` : ''}
      ${share ? `<button class="btn primary" data-share>${icon('share')}${native ? 'Share or save' : 'Share'}</button>` : ''}
      ${native ? '' : `<button class="btn ${share ? 'ghost' : 'primary'}" data-save>${icon('download')}Save to this phone</button>`}</div>`;
    const sh = body.querySelector('[data-share]');
    if (sh) {
      sh.onclick = async () => {
        const label = sh.innerHTML;
        sh.disabled = true;
        if (native) sh.textContent = 'Getting it ready…';
        try {
          if ((await shareOrSave(blob, name, title)) === 'saved') toast('Saved');
        } catch (e) {
          toast(e.message || 'Couldn’t open the share sheet. Try again.');
        } finally {
          sh.disabled = false;
          sh.innerHTML = label;
        }
      };
    }
    const save = body.querySelector('[data-save]');
    if (save) save.onclick = () => { downloadBlob(blob, name); toast('Saved', 2600, { icon: 'check' }); };
  });
}
