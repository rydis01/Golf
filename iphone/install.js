'use strict';
(() => {
  const status = document.getElementById('offline-state');
  const updateButton = document.getElementById('install-update');
  let ready = false;
  function render() {
    status.textContent = ready ? (navigator.onLine ? 'Sparad på telefonen · kan öppnas utan internet.' : 'Offline · hålkarta och beräkning finns på telefonen.')
      : 'Inte sparad för offline ännu. Behåll internetanslutningen tills appen är klar.';
  }
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.getElementById('iphone-install').hidden = true;
  window.addEventListener('online', render); window.addEventListener('offline', render);
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Öppna den publicerade HTTPS-adressen i Safari för att installera och spara appen offline.';
    return;
  }
  let pending;
  function offerUpdate(registration) {
    if (registration.waiting && navigator.serviceWorker.controller) { pending = registration.waiting; updateButton.hidden = false; }
  }
  navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(registration => {
    offerUpdate(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(registration); });
    });
    registration.update().catch(() => {});
    return navigator.serviceWorker.ready;
  }).then(() => { ready = true; render(); }).catch(() => { status.textContent = 'Appen kunde inte sparas offline. Prova att ladda om med internetanslutning.'; });
  updateButton.addEventListener('click', () => pending?.postMessage({ type: 'SKIP_WAITING' }));
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pending && !refreshing) { refreshing = true; location.reload(); }
  });
})();
