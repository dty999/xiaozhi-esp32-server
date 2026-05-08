/// <reference lib="webworker" />

// Serwist Service Worker 占位
export default null;
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => {
  self.skipWaiting();
});
