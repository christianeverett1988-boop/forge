// Haptics on iPhone.
// Safari has no navigator.vibrate. Since iOS 18, a real tap on a native switch control
// (<input type="checkbox" switch>) gives a system haptic tick. So big action buttons (Done set) are labels
// with an invisible switch laid over them: your finger taps the switch itself, iOS ticks, and we listen for
// its `change` event. Where switches aren't supported it's a plain invisible checkbox, so the button still
// works, just without the tick. Marked experimental; Settings → Haptic tick turns it off.
import { state } from '../state.js';

const supportsSwitch = (() => {
  try {
    return 'switch' in document.createElement('input');
  } catch {
    return false;
  }
})();

export const hapticsOn = () => !state.settings || state.settings.haptics !== false;
export const hapticSupport = () => (supportsSwitch ? 'switch' : navigator.vibrate ? 'vibrate' : 'none');

/** The invisible control to put inside a <label class="haptic-btn">. Listen for `change` on it. */
export function hapticInput(attrs = '') {
  return `<input type="checkbox" ${hapticsOn() && supportsSwitch ? 'switch' : ''} class="haptic-input" ${attrs}>`;
}

/** Wire a haptic button: fn runs once per real tap. */
export function onHapticTap(input, fn) {
  if (!input) return;
  input.addEventListener('change', (e) => {
    input.checked = false;
    if (navigator.vibrate && hapticsOn()) navigator.vibrate(12);
    fn(e);
  });
}
