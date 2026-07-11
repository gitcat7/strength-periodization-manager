"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
        void registration.update();
      }).catch(() => {
        // The app should remain fully usable if browser caching is unavailable.
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
