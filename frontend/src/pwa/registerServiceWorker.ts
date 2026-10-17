import { registerSW } from 'virtual:pwa-register';

export function registerPwaServiceWorker(): void {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    registerSW({
      onNeedRefresh() {
        if (confirm('New AgriAdvisor update available. Reload now?')) {
          window.location.reload();
        }
      },
      onOfflineReady() {
        console.log('AgriAdvisor AI is ready for offline usage.');
      },
    });
  }
}
