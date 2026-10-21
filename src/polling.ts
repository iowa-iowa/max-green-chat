import { ApiError, type Notification } from './api';

type PollApi = {
  receiveNotification(signal?: AbortSignal): Promise<Notification | null>;
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<unknown>;
};

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function pollNotifications(api: PollApi, process: (body: unknown) => void | false | Promise<void | false>,
  onError: (error: unknown | null) => void, signal: AbortSignal): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const notification = await api.receiveNotification(signal);
      if (signal.aborted) return;
      if (notification) {
        const proceed = await process(notification.body);
        if (signal.aborted) return;
        await api.deleteNotification(notification.receiptId, signal);
        if (proceed === false) return;
      }
      failures = 0; onError(null);
      await wait(notification ? 100 : 300, signal);
    } catch (error) {
      if (signal.aborted) return;
      onError(error);
      if (signal.aborted || (error instanceof ApiError && [400, 401, 403].includes(error.status))) return;
      await wait(Math.min(30000, 1500 * 2 ** Math.min(failures++, 5)), signal);
    }
  }
}
