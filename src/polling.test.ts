import { expect, it, vi } from 'vitest';
import { pollNotifications } from './polling';

it('обрабатывает уведомление перед подтверждением, без параллельных запросов', async () => {
  const controller = new AbortController();
  const order: string[] = [];
  const api = {
    receiveNotification: async () => { order.push('receive'); return { receiptId: 4, body: { typeWebhook: 'other' } }; },
    deleteNotification: async () => { order.push('delete'); controller.abort(); },
  };
  await pollNotifications(api, async () => { order.push('process'); }, vi.fn(), controller.signal);
  expect(order).toEqual(['receive', 'process', 'delete']);
});

it('не подтверждает событие, если его обработка не завершилась', async () => {
  const controller = new AbortController(); const remove = vi.fn();
  await pollNotifications({ receiveNotification: async () => ({ receiptId: 1, body: {} }), deleteNotification: remove },
    () => { throw new Error('processing'); }, () => controller.abort(), controller.signal);
  expect(remove).not.toHaveBeenCalled();
});

it('после отмены не обрабатывает результат запоздавшего запроса', async () => {
  const controller = new AbortController(); const process = vi.fn(); const remove = vi.fn();
  await pollNotifications({ receiveNotification: async () => { controller.abort(); return { receiptId: 1, body: {} }; }, deleteNotification: remove }, process, vi.fn(), controller.signal);
  expect(process).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});

it('подтверждает служебное событие перед остановкой получения', async () => {
  const controller = new AbortController(); const remove = vi.fn(); const process = vi.fn().mockReturnValue(false);
  const receive = vi.fn().mockResolvedValue({ receiptId: 9, body: { typeWebhook: 'stateInstanceChanged', stateInstance: 'notAuthorized' } });
  receive.mockImplementationOnce(async () => ({ receiptId: 9, body: {} })).mockImplementationOnce(async () => { controller.abort(); return null; });
  await pollNotifications({ receiveNotification: receive, deleteNotification: remove }, process, vi.fn(), controller.signal);
  expect(remove).toHaveBeenCalledWith(9, controller.signal);
  expect(receive).toHaveBeenCalledTimes(1);
});
