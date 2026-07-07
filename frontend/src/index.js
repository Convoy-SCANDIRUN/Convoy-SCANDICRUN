import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "@/lib/i18n";
import App from "@/App";

// Register the service worker so the app is installable as a PWA on
// iOS / Android home screens and works while briefly offline.
//
// Update strategy:
//  1. The browser checks /sw.js on every navigation.
//  2. When a new SW reaches the "waiting" state we tell it to SKIP_WAITING.
//  3. Once it takes control we reload the page exactly once so the user
//     immediately sees the latest code — no manual reinstall needed.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then((registration) => {
            // Tell a waiting worker (if any) to activate immediately.
            const promote = (worker) => {
                if (!worker) return;
                if (worker.state === "installed" && navigator.serviceWorker.controller) {
                    worker.postMessage("SKIP_WAITING");
                }
                worker.addEventListener("statechange", () => {
                    if (worker.state === "installed" && navigator.serviceWorker.controller) {
                        worker.postMessage("SKIP_WAITING");
                    }
                });
            };
            promote(registration.waiting);
            registration.addEventListener("updatefound", () => promote(registration.installing));

            // Hourly poll keeps long-lived PWA windows up to date.
            setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
        }).catch((err) => {
            console.warn("SW registration failed", err);
        });

        // Reload exactly once when a new worker takes control so the
        // installed app immediately picks up the new code.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
        });
    });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
