import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronDown, Eye, EyeOff, ExternalLink, KeyRound, LockKeyhole, MessageCircle, Radio, ShieldCheck } from 'lucide-react';
import { createApi, errorMessage, validateCredentials, type GreenApi } from '../api';
import { Brand, Mark } from './Brand';

export function Login({ onConnect }: { onConnect: (api: GreenApi, id: string) => void }) {
  const [id, setId] = useState(''); const [token, setToken] = useState('');
  const [apiUrl, setApiUrl] = useState('https://api.green-api.com');
  const [showToken, setShowToken] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (request.current) return;
    setError(''); const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const credentials = validateCredentials({ idInstance: id, apiTokenInstance: token, apiUrl });
      const api = createApi(credentials); const state = await api.getState(controller.signal);
      if (state !== 'authorized') {
        const states: Record<string, string> = {
          notAuthorized: 'Подключите аккаунт MAX к инстансу в кабинете GREEN-API.',
          starting: 'Инстанс запускается. Подождите минуту и подключитесь снова.',
          blocked: 'Аккаунт MAX заблокирован. Проверьте его в кабинете GREEN-API.',
          suspended: 'На аккаунте MAX действуют ограничения. Проверьте их в личном кабинете.',
          pendingPassword: 'Завершите двухфакторную авторизацию MAX в кабинете GREEN-API.',
        };
        throw new Error(states[state] ?? 'Инстанс не готов к работе. Проверьте его состояние в кабинете GREEN-API.');
      }
      await api.checkSettings(controller.signal);
      if (!controller.signal.aborted) { setToken(''); onConnect(api, credentials.idInstance); }
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted) { setBusy(false); request.current = null; } }
  }

  return <main className="login-page">
    <section className="login-story" aria-label="О веб-чате">
      <Brand />
      <div className="story-content">
        <span className="story-eyebrow"><span className="tiny-dot" /> НА СВЯЗИ ЧЕРЕЗ GREEN-API</span>
        <h1>Ближе.<br />Даже на расстоянии.</h1>
        <p>Ваш MAX в браузере.<br />Подключитесь и начните разговор.</p>
        <div className="connection-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-logo"><Mark /></div><span className="art-signal signal-one"><MessageCircle /></span><span className="art-signal signal-two"><Check /></span>
          <div className="art-caption"><span className="tiny-dot" /> От сообщения до разговора</div>
        </div>
      </div>
      <div className="story-foot"><span>MAX × GREEN-API</span><span>Текст. Контакт. Разговор.</span></div>
    </section>
    <section className="login-main">
      <div className="login-top"><span>Тестовое задание · React</span><a href="https://green-api.com/v3/docs/" target="_blank" rel="noreferrer">Документация <ExternalLink size={13} /></a></div>
      <div className="login-card">
        <div className="mobile-brand"><Brand /></div>
        <div className="login-icon"><KeyRound size={24} strokeWidth={1.7} /></div>
        <h2>Подключите свой MAX</h2>
        <p className="login-intro">Введите данные инстанса из <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">кабинета GREEN-API <ExternalLink size={12} /></a></p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="instance">idInstance</label>
          <input id="instance" value={id} onChange={e => setId(e.target.value)} placeholder="Например, 3100000001" inputMode="numeric" autoComplete="off" required disabled={busy} aria-describedby="instance-help" />
          <span id="instance-help" className="field-help">Идентификатор вашего инстанса</span>
          <label htmlFor="token">apiTokenInstance <LockKeyhole size={13} /></label>
          <div className="password-field"><input id="token" type={showToken ? 'text' : 'password'} value={token} onChange={e => setToken(e.target.value)} placeholder="Токен доступа" autoComplete="off" spellCheck={false} required disabled={busy} />
            <button type="button" className="icon-button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Скрыть токен' : 'Показать токен'} aria-pressed={showToken}>{showToken ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <label htmlFor="api-url">apiUrl</label>
          <input id="api-url" type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)} autoComplete="off" required disabled={busy} aria-describedby="url-help" />
          <span id="url-help" className="field-help">Скопируйте адрес API из настроек инстанса</span>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="primary-button connect-button" disabled={busy} type="submit">{busy ? <><span className="spinner" /> Подключаемся…</> : <>Подключиться <ArrowRight size={19} /></>}</button>
        </form>
        <div className="privacy-note"><ShieldCheck size={19} /><p>Токен хранится только в памяти этой вкладки и удаляется при выходе или перезагрузке.</p></div>
        <details className="setup-help"><summary>Как подготовить инстанс? <ChevronDown size={16} /></summary>
          <ol><li>Создайте инстанс MAX в GREEN-API и подключите аккаунт.</li><li>Включите уведомления о входящих сообщениях. Для статусов включите уведомления о сообщениях с телефона, сообщениях через API и статусах отправки.</li><li>Оставьте поле Webhook URL пустым. Скопируйте данные подключения в форму.</li></ol>
        </details>
      </div>
      <div className="login-bottom"><Radio size={14} /><span>Отправка и получение текстовых сообщений</span></div>
    </section>
  </main>;
}
