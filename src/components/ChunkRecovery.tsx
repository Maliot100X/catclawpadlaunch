"use client";

import { useEffect } from "react";

/**
 * Deployment-chunk recovery.
 * After a new deploy, an open tab's JS chunks 404 → "Application error: a client-side exception".
 * This listens for that class of failure and reloads once so the tab picks up the new build.
 * A session guard prevents reload loops.
 */
export function ChunkRecovery() {
  useEffect(() => {
    const KEY = "clawpad-chunk-reload-at";

    function recover(reason: string) {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 15000) return; // one reload per 15s max
      sessionStorage.setItem(KEY, String(Date.now()));
      console.warn("[clawpad] recovering from stale build chunks:", reason);
      window.location.reload();
    }

    function onError(e: ErrorEvent) {
      const msg = String(e?.message || "");
      const src = String((e as any)?.filename || "");
      if (/ChunkLoadError|Loading chunk|Loading CSS chunk|Importing a module script failed/i.test(msg) ||
          /_next\/static\/chunks/.test(src)) {
        recover(msg || src);
      }
    }

    function onRejection(e: PromiseRejectionEvent) {
      const msg = String((e?.reason && (e.reason.message || e.reason)) || "");
      if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(msg)) {
        recover(msg);
      }
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
