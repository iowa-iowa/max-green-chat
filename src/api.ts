import { normalizePhone, record } from './model';

export interface Credentials { idInstance: string; apiTokenInstance: string; apiUrl: string }
export interface Notification { receiptId: number; body: unknown }

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) { super(message); this.name = 'ApiError'; this.status = status; }
}

export function validateCredentials(input: Credentials): Credentials {
  const idInstance = input.idInstance.trim();
  const apiTokenInstance = input.apiTokenInstance.trim();
  if (!/^\d+$/.test(idInstance)) throw new Error('idInstance должен содержать только цифры.');
  if (!/^[A-Za-z0-9_-]+$/.test(apiTokenInstance)) throw new Error('Введите apiTokenInstance из личного кабинета GREEN-API.');
  let url: URL;
  try { url = new URL(input.apiUrl.trim()); } catch { throw new Error('Введите apiUrl из личного кабинета GREEN-API.'); }
  if (url.protocol !== 'https:' || !/^(?:\d+\.)?api\.green-api\.com$/.test(url.hostname) ||
    url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('apiUrl должен быть HTTPS-адресом API GREEN-API без пути, например https://3100.api.green-api.com.');
  }
  return { idInstance, apiTokenInstance, apiUrl: url.origin };
}

export function createApi(input: Credentials) {
  const credentials = validateCredentials(input);
  async function request(method: string, verb = 'GET', body?: unknown, signal?: AbortSignal, suffix = ''): Promise<unknown> {
    const timeout = AbortSignal.timeout(45000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${credentials.apiUrl}/waInstance${credentials.idInstance}/${method}/${credentials.apiTokenInstance}${suffix}`, {
        method: verb, signal: combined, credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new ApiError('Не удалось установить соединение с GREEN-API. Проверьте интернет и apiUrl.');
    }
    if (!response.ok) {
      const descriptions: Record<number, string> = {
        400: 'GREEN-API отклонил запрос. Для получения сообщений очистите Webhook URL в кабинете инстанса и проверьте настройки.',
        401: 'Проверьте idInstance и apiTokenInstance в личном кабинете GREEN-API.',
        403: 'GREEN-API ограничил доступ. Проверьте токен, тариф и состояние аккаунта MAX.',
        429: 'Слишком много запросов к GREEN-API. Подождите немного.',
        469: 'MAX временно ограничил поиск по номеру. Попробуйте позже.',
      };
      throw new ApiError(descriptions[response.status] ?? `Ошибка GREEN-API (${response.status}). Попробуйте позже.`, response.status);
    }
    const text = await response.text();
    if (!text.trim()) return null;
    try { return JSON.parse(text) as unknown; } catch { throw new ApiError('GREEN-API вернул некорректный ответ.'); }
  }
  return {
    async getState(signal?: AbortSignal) {
      const result = record(await request('getStateInstance', 'GET', undefined, signal));
      if (typeof result.stateInstance !== 'string') throw new ApiError('GREEN-API вернул некорректный ответ состояния.');
      return result.stateInstance;
    },
    async checkSettings(signal?: AbortSignal) {
      const result = record(await request('getSettings', 'GET', undefined, signal));
      if (typeof result.webhookUrl !== 'string' || typeof result.incomingWebhook !== 'string') throw new ApiError('Не удалось проверить настройки инстанса GREEN-API.');
      if (result.webhookUrl) throw new ApiError('В кабинете GREEN-API очистите Webhook URL: он мешает получению сообщений через HTTP API. Изменения применяются около минуты.');
      if (result.incomingWebhook !== 'yes') throw new ApiError('Включите «Получать уведомления о входящих сообщениях и файлах» в настройках инстанса GREEN-API.');
    },
    async checkAccount(phone: string, signal?: AbortSignal): Promise<string> {
      const result = record(await request('checkAccount', 'POST', { phoneNumber: Number(normalizePhone(phone)) }, signal));
      if (result.exist === false) throw new ApiError('Пользователь MAX не найден или запретил поиск по номеру.');
      if (result.exist !== true || typeof result.chatId !== 'string' || !/^\d+$/.test(result.chatId)) {
        throw new ApiError('Не удалось проверить номер в MAX. Проверьте состояние инстанса и повторите позже.');
      }
      return result.chatId;
    },
    async sendMessage(chatId: string, message: string, signal?: AbortSignal): Promise<string> {
      if (!message.trim() || message.length > 4000) throw new Error('Введите сообщение от 1 до 4000 символов.');
      const result = record(await request('sendMessage', 'POST', { chatId, message }, signal));
      if (typeof result.idMessage !== 'string' || !result.idMessage) throw new ApiError('GREEN-API вернул некорректный ответ отправки. Перед повтором проверьте MAX.');
      return result.idMessage;
    },
    async receiveNotification(signal?: AbortSignal): Promise<Notification | null> {
      const result = await request('receiveNotification', 'GET', undefined, signal, '?receiveTimeout=20');
      if (result === null) return null;
      const data = record(result);
      if (!Number.isSafeInteger(data.receiptId) || Number(data.receiptId) < 0 || !data.body || typeof data.body !== 'object') {
        throw new ApiError('GREEN-API вернул некорректный ответ уведомления.');
      }
      return { receiptId: Number(data.receiptId), body: data.body };
    },
    async deleteNotification(receiptId: number, signal?: AbortSignal) {
      const result = record(await request('deleteNotification', 'DELETE', undefined, signal, `/${receiptId}`));
      if (result.result !== true) throw new ApiError('GREEN-API не подтвердил обработку уведомления.');
    },
  };
}

export type GreenApi = ReturnType<typeof createApi>;
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
