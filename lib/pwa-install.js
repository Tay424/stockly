/**
 * Module singleton for Chrome/Android `beforeinstallprompt`.
 * Capture early (from PwaRegister) so remounts of the tip don't miss the event.
 */

let deferredPrompt = null;
const listeners = new Set();

function notify() {
  for (const cb of listeners) {
    try {
      cb(deferredPrompt);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    window.navigator.standalone === true
  );
}

/** Store the deferred install event (call from beforeinstallprompt). */
export function captureInstallPrompt(event) {
  if (!event) return;
  try {
    event.preventDefault();
  } catch {
    /* some browsers may already have prevented default */
  }
  deferredPrompt = event;
  notify();
}

export function getInstallPrompt() {
  return deferredPrompt;
}

export function clearInstallPrompt() {
  deferredPrompt = null;
  notify();
}

/**
 * Subscribe to deferred-prompt changes. Returns unsubscribe.
 * Immediately invokes callback with the current value.
 */
export function subscribeInstallPrompt(callback) {
  if (typeof callback !== "function") return () => {};
  listeners.add(callback);
  callback(deferredPrompt);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Trigger the native Chromium install UI.
 * Returns { ok, outcome?, reason? }.
 */
export async function promptInstall() {
  const deferred = deferredPrompt;
  if (!deferred || typeof deferred.prompt !== "function") {
    return { ok: false, reason: "unavailable" };
  }
  try {
    deferred.prompt();
    const choice = await deferred.userChoice;
    clearInstallPrompt();
    return { ok: true, outcome: choice?.outcome ?? null };
  } catch (err) {
    clearInstallPrompt();
    return {
      ok: false,
      reason: err?.message || "prompt_failed",
    };
  }
}
