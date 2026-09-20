"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import {
  captureInstallPrompt,
  clearInstallPrompt,
} from "@/lib/pwa-install";

/**
 * Registers the minimal Stockly service worker and captures
 * `beforeinstallprompt` early so the Install tip can one-click install.
 * In local `next dev` we still register so installability can be tested over
 * localhost; production HTTPS is required on real devices.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onBeforeInstall(event) {
      captureInstallPrompt(event);
    }

    function onAppInstalled() {
      clearInstallPrompt();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.removeEventListener("appinstalled", onAppInstalled);
      };
    }

    let refreshing = false;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state !== "installed") return;
            if (!navigator.serviceWorker.controller) return;
            toast.message("Update available", {
              description: "Reload to get the latest Stockly.",
              action: {
                label: "Reload",
                onClick: () => {
                  worker.postMessage("SKIP_WAITING");
                },
              },
              duration: 15000,
            });
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      } catch (err) {
        console.warn("Stockly SW registration failed", err);
      }
    }

    void register();

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  return null;
}
