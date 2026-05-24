/**
 * Ambient declarations for cross-cutting types: the window-scoped service
 * worker singleton and the custom window events dispatched by
 * ServiceWorkerManager.
 *
 * Per-component HTMLElementTagNameMap augmentations live alongside each
 * component's `customElements.define()` call (see components/*.ts) so the
 * registration and its type entry can't drift apart.
 */

import type { ServiceWorkerManager } from '/src/ServiceWorkerManager.js';

declare global {
  interface Window {
    serviceWorkerManager?: ServiceWorkerManager;
  }

  interface WindowEventMap {
    'sw-update-available': CustomEvent<{
      registration: ServiceWorkerRegistration;
      pendingWorker: ServiceWorker | null;
    }>;
    'sw-update-progress': CustomEvent<{ status: string }>;
  }
}

export {};
