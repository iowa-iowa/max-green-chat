import { describe, expect, it } from 'vitest';
import { normalizePhone, chatReducer, parseNotification } from './model';

describe('номера MAX', () => {
  it('нормализует номер с пробелами, скобками и дефисами', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('79991234567');
    expect(normalizePhone('+375 29 123-45-67')).toBe('375291234567');
  });
  it.each(['', '89991234567', '+44 7700 900123', '7abc9991234567', '799912345678', '7999'])('отклоняет неверный номер %s', (phone) => {
    expect(() => normalizePhone(phone)).toThrow();
  });
});

describe('уведомления и чаты', () => {
  const body = { typeWebhook: 'incomingMessageReceived', idMessage: 'm1', timestamp: 1792550000,
    senderData: { chatId: '10000000', senderName: 'Анна', senderPhoneNumber: 79991234567 },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } } };
  it('использует реальный MAX chatId для ответа в созданный чат', () => {
    const initial = chatReducer([], { type: 'open', chat: { id: '10000000', phone: '79991234567', name: '+79991234567', messages: [], unread: 0, draft: '' } });
    const event = parseNotification(body)!;
    expect(event.type).toBe('incoming');
    const next = chatReducer(initial, { type: 'event', event, activeId: '10000000' });
    expect(next).toHaveLength(1);
    expect(next[0].messages[0].text).toBe('Привет!');
    expect(next[0].unread).toBe(0);
    expect(next[0].name).toBe('Анна');
  });
  it('не дублирует повторно полученное сообщение', () => {
    const action = { type: 'event', event: parseNotification(body)!, activeId: null } as const;
    const first = chatReducer([], action);
    const second = chatReducer(first, action);
    expect(second[0].messages).toHaveLength(1);
    expect(second[0].unread).toBe(1);
  });
  it('разбирает текст с URL без HTML-инъекций', () => {
    const event = parseNotification({ ...body, messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: '<script>text</script> https://example.org' } } });
    expect(event?.type === 'incoming' && event.message.text).toContain('<script>');
  });
  it('пропускает медиа и повреждённые события', () => {
    expect(parseNotification(null)).toBeNull();
    expect(parseNotification({ ...body, senderData: {} })).toBeNull();
    expect(parseNotification({ ...body, messageData: { typeMessage: 'imageMessage' } })).toBeNull();
  });
  it('сохраняет черновики отдельно и сбрасывает счётчик при выборе', () => {
    const chat = chatReducer([], { type: 'event', event: parseNotification(body)!, activeId: null });
    const drafted = chatReducer(chat, { type: 'draft', chatId: chat[0].id, text: 'Ответ' });
    const selected = chatReducer(drafted, { type: 'read', chatId: chat[0].id });
    expect(selected[0].draft).toBe('Ответ');
    expect(selected[0].unread).toBe(0);
  });
  it('сохраняет статус ошибки, пришедший раньше ответа sendMessage', () => {
    const initial = chatReducer([], { type: 'open', chat: { id: '10000000', name: 'Анна', messages: [], unread: 0, draft: 'Текст' } });
    const notified = chatReducer(initial, { type: 'event', event: { type: 'status', chatId: '10000000', messageId: 'sent1', status: 'failed' }, activeId: '10000000' });
    const sent = chatReducer(notified, { type: 'sent', chatId: '10000000', draft: 'Текст', message: { id: 'sent1', text: 'Текст', direction: 'out', timestamp: 1, status: 'queued' } });
    expect(sent[0].messages[0].status).toBe('failed');
  });
});
