"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, ShareIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getInstallPrompt,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/pwa-install";

const STORAGE_KEY = "stockly-install-tip-dismissed";
/** How long to wait for beforeinstallprompt before showing menu instructions. */
const PROMPT_WAIT_MS = 4000;

/**
 * Dismissible “Add to Home Screen” tip for mobile signed-in users.
 * Android/Chrome: Install runs deferred.prompt() from the early-captured event.
 * iOS: Share → Add to Home Screen (no programmatic install API).
 */
export function PwaInstallTip({ elevated = false }) {
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [iosHint, setIosHint] = useState(false);
  const [manualHint, setManualHint] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isMobile || isStandalone()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    if (isIos()) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    // Prefer any prompt already captured by PwaRegister; otherwise show
    // “Preparing install…” until the event arrives or we time out to menu steps.
    setDeferred(getInstallPrompt());
    setVisible(true);

    const unsubscribe = subscribeInstallPrompt((event) => {
      setDeferred(event);
      if (event) {
        setManualHint(false);
        setVisible(true);
      }
    });

    // If Chrome hasn't offered install yet, fall back to browser-menu steps —
    // never a fake Install that only toasts.
    const timer = window.setTimeout(() => {
      if (!getInstallPrompt()) {
        setManualHint(true);
        setVisible(true);
      }
    }, PROMPT_WAIT_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [isMobile]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    setInstalling(true);
    try {
      const result = await promptInstall();
      setDeferred(null);
      if (result.ok && result.outcome === "accepted") {
        dismiss();
        return;
      }
      if (!result.ok && result.reason === "unavailable") {
        setManualHint(true);
        toast.message("Use your browser menu", {
          description: "Choose “Install app” or “Add to Home Screen”.",
        });
      }
    } finally {
      setInstalling(false);
    }
  }

  if (!visible) return null;

  const canInstall = Boolean(deferred) && !iosHint;
  const showPreparing = !iosHint && !canInstall && !manualHint;

  let description;
  if (iosHint) {
    description = "Tap Share, then “Add to Home Screen” for a full-screen app.";
  } else if (canInstall) {
    description = "Add Stockly to your home screen for faster sales on the floor.";
  } else if (showPreparing) {
    description = "Preparing install…";
  } else {
    description =
      "Open your browser menu and choose “Install app” or “Add to Home Screen”.";
  }

  return (
    <div
      className="fixed inset-x-3 z-50 rounded-xl border border-border bg-card p-3 shadow-lg md:hidden"
      style={{
        bottom: elevated
          ? "calc(3.75rem + env(safe-area-inset-bottom, 0px))"
          : "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
      }}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {iosHint ? <ShareIcon className="size-4" /> : <DownloadIcon className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Install Stockly</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {canInstall ? (
              <Button type="button" size="sm" onClick={install} disabled={installing}>
                {installing ? "Installing…" : "Install"}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
