export interface Message { id: string; text: string; direction: 'in' | 'out'; timestamp: number; status?: string }
export interface Chat { id: string; name: string; phone?: string; messages: Message[]; unread: number; draft: string; pendingStatuses?: Record<string, string> }
export type ChatEvent =
  | { type: 'incoming'; chatId: string; name: string; phone?: string; message: Message }
  | { type: 'status'; chatId: string; messageId: string; status: string };
export type Action =
  | { type: 'open'; chat: Chat }
  | { type: 'event'; event: ChatEvent; activeId: string | null }
  | { type: 'draft'; chatId: string; text: string }
  | { type: 'read'; chatId: string }
  | { type: 'sent'; chatId: string; message: Message; draft: string };

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizePhone(input: string): string {
  if (!/^\+?[\d\s()-]+$/.test(input.trim())) throw new Error('Введите номер в международном формате: +7 или +375.');
  const digits = input.replace(/\D/g, '');
  if (!/^(7\d{10}|375\d{9})$/.test(digits)) throw new Error('MAX поддерживает номера РФ (+7, 11 цифр) и Беларуси (+375, 12 цифр).');
  return digits;
}

export function parseNotification(input: unknown): ChatEvent | null {
  const body = record(input);
  if (body.typeWebhook === 'outgoingMessageStatus' && typeof body.chatId === 'string' && typeof body.idMessage === 'string' && typeof body.status === 'string') {
    return { type: 'status', chatId: body.chatId, messageId: body.idMessage, status: body.status };
  }
  if (body.typeWebhook !== 'incomingMessageReceived') return null;
  const sender = record(body.senderData); const data = record(body.messageData);
  const text = data.typeMessage === 'textMessage' ? record(data.textMessageData).textMessage :
    data.typeMessage === 'extendedTextMessage' ? record(data.extendedTextMessageData).text : undefined;
  if (typeof text !== 'string' || typeof sender.chatId !== 'string' || !sender.chatId || typeof body.idMessage !== 'string' ||
    typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp)) return null;
  const name = [sender.senderContactName, sender.senderName, sender.chatName].find(x => typeof x === 'string' && x.trim());
  const phone = sender.senderPhoneNumber ? String(sender.senderPhoneNumber) : undefined;
  return { type: 'incoming', chatId: sender.chatId, name: typeof name === 'string' ? name : phone ? `+${phone}` : `Чат ${sender.chatId}`, phone,
    message: { id: body.idMessage, text, direction: 'in', timestamp: body.timestamp * 1000 } };
}

export function chatReducer(chats: Chat[], action: Action): Chat[] {
  if (action.type === 'open') return chats.some(chat => chat.id === action.chat.id) ? chats : [action.chat, ...chats];
  if (action.type === 'event' && action.event.type === 'incoming') {
    const event = action.event; const chat = chats.find(item => item.id === event.chatId);
    if (chat?.messages.some(message => message.id === event.message.id)) return chats;
    const updated: Chat = { ...chat, id: event.chatId, name: event.name, phone: event.phone || chat?.phone,
      draft: chat?.draft ?? '', messages: [...(chat?.messages ?? []), event.message],
      unread: action.activeId === event.chatId ? 0 : (chat?.unread ?? 0) + 1 };
    return [updated, ...chats.filter(item => item.id !== event.chatId)];
  }
  return chats.map(chat => {
    if (action.type === 'event' && action.event.type === 'status') {
      const event = action.event;
      if (chat.id !== event.chatId) return chat;
      if (!chat.messages.some(message => message.id === event.messageId)) {
        return { ...chat, pendingStatuses: { ...chat.pendingStatuses, [event.messageId]: event.status } };
      }
      return { ...chat, messages: chat.messages.map(message => message.id === event.messageId ? { ...message, status: event.status } : message) };
    }
    if (action.type === 'event' || chat.id !== action.chatId) return chat;
    if (action.type === 'read') return { ...chat, unread: 0 };
    if (action.type === 'draft') return { ...chat, draft: action.text };
    if (action.type === 'sent') {
      const pendingStatuses = { ...chat.pendingStatuses };
      const status = pendingStatuses[action.message.id] ?? action.message.status;
      delete pendingStatuses[action.message.id];
      return { ...chat, pendingStatuses, draft: chat.draft === action.draft ? '' : chat.draft,
        messages: chat.messages.some(message => message.id === action.message.id) ? chat.messages : [...chat.messages, { ...action.message, status }] };
    }
    return chat;
  });
}
