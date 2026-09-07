// register-sw.js
// Registers the service worker so the site works offline and can be
// installed. Safe to include on every page — repeat registrations of the
// same script are a no-op.

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
