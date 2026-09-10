"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, ShareIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

const STORAGE_KEY = "stockly-install-tip-dismissed";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    window.navigator.standalone === true
  );
}

/**
 * Dismissible “Add to Home Screen” tip for mobile signed-in users.
 * Android/Chrome: uses beforeinstallprompt. iOS: Share → Add to Home Screen.
 */
export function PwaInstallTip({ elevated = false }) {
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [iosHint, setIosHint] = useState(false);

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

    function onBeforeInstall(event) {
      event.preventDefault();
      setDeferred(event);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    // Show a soft tip even before the event (Chrome may fire later).
    const timer = window.setTimeout(() => setVisible(true), 2500);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
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
    if (!deferred) {
      toast.message("Use your browser menu", {
        description: "Choose “Install app” or “Add to Home Screen”.",
      });
      return;
    }
    deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice?.outcome === "accepted") dismiss();
  }

  if (!visible) return null;

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
          <p className="mt-0.5 text-xs text-muted-foreground">
            {iosHint
              ? "Tap Share, then “Add to Home Screen” for a full-screen app."
              : "Add Stockly to your home screen for faster sales on the floor."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!iosHint ? (
              <Button type="button" size="sm" onClick={install}>
                Install
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
