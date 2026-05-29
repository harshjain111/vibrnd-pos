/**
 * Vibrnd POS — minimal service worker.
 *
 * Goals (per audit + PRD Phase 1):
 *  1. Make the app installable (manifest + this SW + valid scope).
 *  2. Keep the app shell available offline so the SyncStatusPill can show "offline".
 *  3. Stay out of the way for everything else — opaque pass-through for /api, dev
 *     routes, server actions. We're NOT trying to implement full offline-write
 *     queuing yet (that's Sprint 3, TASK 28 in the audit).
 */

const CACHE = "vibrnd-shell-v1";

// Files that make up the app shell — fetched on install for offline boot.
const SHELL = ["/", "/login", "/manifest.json", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // server actions, mutations — let the network handle them
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Skip Next.js HMR / RSC streams and API routes.
  if (url.pathname.startsWith("/_next/data") || url.pathname.startsWith("/api/")) return;

  // Network-first for navigations; cached fallback when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }
  // Cache-first for static assets.
  if (url.pathname.startsWith("/_next/static") || /\.(svg|png|jpg|css|js|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
