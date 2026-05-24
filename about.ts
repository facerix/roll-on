import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import '/components/UpdateNotification.js';
import '/components/ConfirmationModal.js';

const whenLoaded = Promise.all([
  customElements.whenDefined('update-notification'),
  customElements.whenDefined('confirmation-modal'),
]);

whenLoaded.then(async () => {
  const updateNotification = document.querySelector('update-notification');
  const confirmationModal = document.querySelector('confirmation-modal');

  window.addEventListener('sw-update-available', event => {
    console.log('Service worker update available, showing notification');
    updateNotification?.show(event.detail.pendingWorker);
  });

  await serviceWorkerManager.register();

  const version = document.getElementById('version');
  const latestVersion = document.getElementById('latestVersion');
  const latestVersionContainer = document.getElementById('latestVersionContainer');
  const noUpdateContainer = document.getElementById('noUpdateContainer');
  const btnUpdate = document.getElementById('btnUpdate');

  const currentVersion = await serviceWorkerManager.getVersion();
  if (version) {
    version.innerText = currentVersion ?? 'Not available';
  }

  const latestVersionInfo = await serviceWorkerManager.getLatestVersion();
  if (latestVersionInfo && latestVersionInfo !== currentVersion) {
    if (latestVersion) latestVersion.innerText = latestVersionInfo;
    if (latestVersionContainer) latestVersionContainer.style.display = 'flex';
    if (noUpdateContainer) noUpdateContainer.style.display = 'none';
  } else {
    if (latestVersionContainer) latestVersionContainer.style.display = 'none';
    if (noUpdateContainer) {
      noUpdateContainer.style.display = currentVersion ? 'block' : 'none';
    }
  }

  btnUpdate?.addEventListener('click', () => {
    const pendingWorker =
      updateNotification?.pendingWorkerInstance ?? serviceWorkerManager.getRegistration()?.waiting;
    if (pendingWorker) {
      serviceWorkerManager.handleUpdateNow(pendingWorker);
    } else {
      serviceWorkerManager.checkForUpdates();
    }
  });

  const btnClearCache = document.getElementById('btnClearCache') as HTMLButtonElement | null;
  const clearCacheStatus = document.getElementById('clearCacheStatus');

  btnClearCache?.addEventListener('click', () => {
    if (!confirmationModal) return;
    confirmationModal.showModal('This will clear all cached data and reload the page. Continue?', {
      btnClearCache,
      clearCacheStatus,
    });
    confirmationModal.addEventListener('confirm', async () => {
      btnClearCache.disabled = true;
      if (clearCacheStatus) clearCacheStatus.innerText = 'Clearing caches...';
      try {
        await serviceWorkerManager.clearAllCaches();
      } catch (error) {
        console.error('Failed to clear caches:', error);
        if (clearCacheStatus) clearCacheStatus.innerText = 'Failed to clear caches';
        btnClearCache.disabled = false;
      }
    });
    confirmationModal.addEventListener('cancel', () => {
      btnClearCache.disabled = false;
      if (clearCacheStatus) clearCacheStatus.innerText = '';
    });
  });
});
