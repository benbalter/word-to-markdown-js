// Service worker kill switch. Set to true and push to main to retire the
// service worker everywhere: the build ships web/pwa/sw-kill.js as /sw.js
// (which clears the site's caches and unregisters itself on every device that
// installed the real one), and pages stop registering a worker and ask any
// existing one to update, which is what brings the kill worker in. Kept in one module so the build (service-worker.ts) and the
// page (PwaRegister.astro) can't disagree, which would loop: a page that kept
// registering the kill worker would be reloaded by it forever.
export const serviceWorkerKillSwitch = false;
