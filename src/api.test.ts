import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, validateCredentials } from './api';

const credentials = { idInstance: '3100000001', apiTokenInstance: 'test_token', apiUrl: 'https://3100.api.green-api.com' };
afterEach(() => vi.unstubAllGlobals());
describe('GREEN-API клиент', () => {
  it('не отправляет токен на посторонний домен', () => {
    expect(() => validateCredentials({ ...credentials, apiUrl: 'https://green-api.com.evil.org' })).toThrow();
    expect(() => validateCredentials({ ...credentials, apiUrl: 'http://3100.api.green-api.com' })).toThrow();
    expect(() => validateCredentials({ ...credentials, apiUrl: 'https://3100.api.green-api.com/path' })).toThrow();
  });
  it('проверяет idInstance и токен', () => {
    expect(() => validateCredentials({ ...credentials, idInstance: 'abc' })).toThrow();
    expect(() => validateCredentials({ ...credentials, apiTokenInstance: '' })).toThrow();
  });
  it('получает настоящий chatId по номеру', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ exist: true, chatId: '10000000' })));
    vi.stubGlobal('fetch', fetcher);
    expect(await createApi(credentials).checkAccount('79991234567')).toBe('10000000');
    expect(fetcher.mock.calls[0][0]).toBe('https://3100.api.green-api.com/waInstance3100000001/checkAccount/test_token');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ phoneNumber: 79991234567 });
  });
  it('различает отсутствие пользователя и неуспешную проверку', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ exist: false, chatId: '' }))));
    await expect(createApi(credentials).checkAccount('79991234567')).rejects.toThrow(/не найден/);
  });
  it('не повторяет отправку при ошибке и не раскрывает токен', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error(`secret ${credentials.apiTokenInstance}`));
    vi.stubGlobal('fetch', fetcher);
    await expect(createApi(credentials).sendMessage('10000000', 'Привет')).rejects.toThrow(/соединение/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('не отправляет пустой или слишком длинный текст', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(createApi(credentials).sendMessage('10000000', '  ')).rejects.toThrow();
    await expect(createApi(credentials).sendMessage('10000000', 'я'.repeat(4001))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('распознаёт пустой ответ long polling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
    expect(await createApi(credentials).receiveNotification()).toBeNull();
  });
  it('отклоняет повреждённый ответ уведомления', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"unexpected":true}')));
    await expect(createApi(credentials).receiveNotification()).rejects.toThrow(/ответ/);
  });
  it('возвращает понятную ошибку неверного токена', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private secret', { status: 401 })));
    await expect(createApi(credentials).getState()).rejects.toThrow(/idInstance.*apiTokenInstance/);
  });
});
