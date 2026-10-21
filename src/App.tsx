import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CheckCheck, CircleAlert, LogOut, MessageCircle, Plus, Search, Send, ShieldCheck, X } from 'lucide-react';
import { ApiError, errorMessage, type GreenApi } from './api';
import { chatReducer, parseNotification, record, type Chat, type Message } from './model';
import { pollNotifications } from './polling';
import { Brand, Mark } from './components/Brand';
import { Login } from './components/Login';
import { NewChat } from './components/NewChat';

const time = (timestamp: number) => new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
const day = (timestamp: number) => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(timestamp);
const statuses: Record<string, string> = { queued: 'В очереди', sent: 'Отправлено', delivered: 'Доставлено', read: 'Прочитано', failed: 'Не доставлено', notInGroup: 'Не доставлено', noAccount: 'Получатель недоступен' };

export default function App() {
  const [session, setSession] = useState<{ api: GreenApi; id: string } | null>(null);
  return session ? <ChatApp api={session.api} instanceId={session.id} onDisconnect={() => setSession(null)} /> : <Login onConnect={(api, id) => setSession({ api, id })} />;
}

function Avatar({ chat, small = false }: { chat: Chat; small?: boolean }) {
  const label = chat.name.startsWith('+') ? chat.phone?.slice(-2) ?? 'М' : chat.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  const tone = Number(chat.id.replace(/\D/g, '').slice(-1)) % 4;
  return <span className={`avatar tone-${tone} ${small ? 'avatar-small' : ''}`} aria-hidden="true">{label}</span>;
}

function MessageBubble({ message }: { message: Message }) {
  const failed = ['failed', 'notInGroup', 'noAccount'].includes(message.status ?? '');
  const label = statuses[message.status ?? 'queued'] ?? 'В очереди';
  return <div className={`message-row ${message.direction === 'out' ? 'outgoing' : ''}`}>
    <div className={`message-bubble ${failed ? 'message-failed' : ''}`}>
      <p data-testid="message-text">{message.text}</p>
      <div className="message-meta"><time dateTime={new Date(message.timestamp).toISOString()}>{time(message.timestamp)}</time>
        {message.direction === 'out' && <span title={label} aria-label={label}>{failed ? <CircleAlert size={14} /> : ['delivered', 'read'].includes(message.status ?? '') ? <CheckCheck size={15} className={message.status === 'read' ? 'read-check' : ''} /> : <Check size={14} />}</span>}
      </div>
      {failed && <span className="failed-caption">{label}</span>}
    </div>
  </div>;
}

function ChatApp({ api, instanceId, onDisconnect }: { api: GreenApi; instanceId: string; onDisconnect: () => void }) {
  const [chats, dispatch] = useReducer(chatReducer, []); const [activeId, setActiveId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null); const [query, setQuery] = useState(''); const [newChat, setNewChat] = useState(false);
  const [pollError, setPollError] = useState(''); const [stopped, setStopped] = useState(false); const [pollRun, setPollRun] = useState(0);
  const [sending, setSending] = useState<string | null>(null); const sendLock = useRef(false);
  const [sendError, setSendError] = useState<{ chatId: string; message: string } | null>(null);
  const lifecycle = useRef(new AbortController()); const bottom = useRef<HTMLDivElement>(null); const composer = useRef<HTMLTextAreaElement>(null);
  const active = chats.find(chat => chat.id === activeId);

  useEffect(() => { const request = lifecycle.current; return () => request.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController(); const signal = AbortSignal.any([controller.signal, lifecycle.current.signal]);
    setStopped(false);
    void pollNotifications(api, body => {
      const data = record(body);
      if (data.typeWebhook === 'stateInstanceChanged' && typeof data.stateInstance === 'string' && data.stateInstance !== 'authorized') {
        setPollError('Подключение MAX прервано. Проверьте состояние инстанса в GREEN-API и нажмите «Повторить».');
        setStopped(true);
        return false;
      }
      const event = parseNotification(body);
      if (event) dispatch({ type: 'event', event, activeId: activeRef.current });
    }, cause => {
      if (signal.aborted) return;
      setPollError(cause ? errorMessage(cause) : '');
      if (cause instanceof ApiError && [400, 401, 403].includes(cause.status)) setStopped(true);
    }, signal);
    return () => controller.abort();
  }, [api, pollRun]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [activeId, active?.messages.length]);
  useEffect(() => { if (activeId) composer.current?.focus(); }, [activeId]);

  function select(id: string | null) {
    activeRef.current = id; setActiveId(id);
    if (id) dispatch({ type: 'read', chatId: id });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !active.draft.trim() || active.draft.length > 4000 || sendLock.current || stopped) return;
    const chatId = active.id; const text = active.draft; const timestamp = Date.now();
    sendLock.current = true; setSending(chatId); setSendError(null);
    try {
      const id = await api.sendMessage(chatId, text, lifecycle.current.signal);
      if (!lifecycle.current.signal.aborted) dispatch({ type: 'sent', chatId, draft: text, message: { id, text, timestamp, direction: 'out', status: 'queued' } });
    } catch (cause) {
      if (!lifecycle.current.signal.aborted) setSendError({ chatId, message: `${errorMessage(cause)} Перед повторной отправкой проверьте, не пришло ли сообщение в MAX.` });
    } finally {
      sendLock.current = false; if (!lifecycle.current.signal.aborted) { setSending(null); composer.current?.focus(); }
    }
  }

  const filtered = chats.filter(chat => `${chat.name} ${chat.phone ?? ''}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <main className={`chat-app ${active ? 'has-active-chat' : ''}`}>
    <aside className="sidebar" aria-label="Список чатов">
      <div className="sidebar-brand"><Brand /><span className="integration-tag">GREEN-API</span></div>
      <header className="sidebar-title"><h1>Чаты</h1><button className="new-chat-button" aria-label="Новый чат" title="Новый чат" onClick={() => setNewChat(true)}><Plus size={22} /></button></header>
      <div className="search-field"><Search size={18} /><input aria-label="Поиск чатов" placeholder="Поиск по чатам" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={16} /></button>}</div>
      <div className="chat-list">
        {filtered.map(chat => <button key={chat.id} className={`chat-list-item ${chat.id === activeId ? 'selected' : ''}`} onClick={() => select(chat.id)} aria-current={chat.id === activeId ? 'true' : undefined}>
          <Avatar chat={chat} /><span className="chat-preview"><span className="chat-preview-heading"><strong>{chat.name}</strong>{chat.messages.length > 0 && <time>{time(chat.messages.at(-1)!.timestamp)}</time>}</span>
            <span className="chat-preview-bottom"><span>{chat.draft ? <><em>Черновик: </em>{chat.draft}</> : chat.messages.length ? `${chat.messages.at(-1)!.direction === 'out' ? 'Вы: ' : ''}${chat.messages.at(-1)!.text}` : 'Начните разговор'}</span>{chat.unread > 0 && <span className="unread-count">{chat.unread}</span>}</span></span>
        </button>)}
        {filtered.length === 0 && <div className="empty-list"><span className="empty-list-icon"><MessageCircle size={25} strokeWidth={1.5} /></span><h2>{query ? 'Чатов не найдено' : 'Пока нет разговоров'}</h2><p>{query ? 'Попробуйте другое имя или номер.' : 'Добавьте номер телефона, чтобы написать первым.'}</p>{!query && <button className="text-button" onClick={() => setNewChat(true)}><Plus size={16} /> Новый чат</button>}</div>}
      </div>
      <div className="sidebar-foot"><span className={`connection-dot ${pollError ? 'connection-error' : ''}`} /><div><strong>{stopped ? 'Получение приостановлено' : pollError ? 'Восстанавливаем связь' : 'Подключено к MAX'}</strong><span>Инстанс {instanceId}</span></div><button className="icon-button" title="Отключиться" aria-label="Отключиться" onClick={onDisconnect}><LogOut size={19} /></button></div>
    </aside>

    <section className="conversation" aria-label="Переписка">
      {pollError && <div className="connection-banner" role="alert"><CircleAlert size={18} /><span>{pollError}</span>{stopped && <button onClick={() => { setPollError(''); setPollRun(run => run + 1); }}>Повторить</button>}</div>}
      {active ? <>
        <header className="conversation-header"><button className="icon-button back-button" aria-label="К списку чатов" onClick={() => select(null)}><ArrowLeft size={22} /></button><Avatar chat={active} small /><div><h2>{active.name}</h2><p>{active.phone ? `+${active.phone} · MAX` : 'MAX · чат'}</p></div><span className="text-only-tag">Текстовые сообщения</span></header>
        <div className="message-feed" role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions text">
          {active.messages.length === 0 ? <div className="start-conversation"><span><MessageCircle size={25} /></span><h3>Начните с «Привет!»</h3><p>Ваше сообщение придёт собеседнику в MAX.</p></div> : <div className="message-container">{active.messages.map((message, index) => <div key={message.id}>{(index === 0 || day(active.messages[index - 1].timestamp) !== day(message.timestamp)) && <div className="date-divider"><span>{day(message.timestamp)}</span></div>}<MessageBubble message={message} /></div>)}</div>}
          <div ref={bottom} />
        </div>
        <div className="composer-area">
          {sendError?.chatId === active.id && <div className="send-error error-box" role="alert">{sendError.message}<button className="icon-button" aria-label="Закрыть ошибку" onClick={() => setSendError(null)}><X size={16} /></button></div>}
          <form className="composer" onSubmit={send}>
            <textarea ref={composer} rows={1} aria-label="Сообщение" placeholder="Написать сообщение…" value={active.draft} maxLength={4000}
              onChange={event => dispatch({ type: 'draft', chatId: active.id, text: event.target.value })}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(event); } }} />
            <button className="send-button" type="submit" aria-label="Отправить сообщение" disabled={!active.draft.trim() || sending !== null || stopped}>{sending === active.id ? <span className="spinner" /> : <Send size={21} />}</button>
          </form>
          <div className="composer-help"><span>Enter — отправить · Shift + Enter — новая строка</span><span>{active.draft.length} / 4000</span></div>
        </div>
      </> : <div className="welcome-screen"><div className="welcome-emblem"><Mark /><span className="welcome-emblem-badge"><MessageCircle size={22} /></span></div><span className="welcome-eyebrow">ВАШ MAX В БРАУЗЕРЕ</span><h2>Хороший разговор<br />начинается с сообщения</h2><p>Выберите чат слева или начните новый.<br />Всё остальное — просто общение.</p><button className="primary-button" onClick={() => setNewChat(true)}><Plus size={18} /> Новый чат <ArrowUpRight size={17} /></button><div className="welcome-privacy"><ShieldCheck size={15} /> Переписка хранится до закрытия или обновления вкладки</div></div>}
    </section>
    {newChat && <NewChat api={api} onClose={() => setNewChat(false)} onCreate={(id, phone) => { dispatch({ type: 'open', chat: { id, phone, name: `+${phone}`, messages: [], unread: 0, draft: '' } }); select(id); setNewChat(false); setQuery(''); }} />}
  </main>;
}
