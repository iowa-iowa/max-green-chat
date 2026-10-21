import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Phone, X } from 'lucide-react';
import { errorMessage, type GreenApi } from '../api';
import { normalizePhone } from '../model';

export function NewChat({ api, onClose, onCreate }: { api: GreenApi; onClose: () => void; onCreate: (id: string, phone: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const controller = useRef(new AbortController());
  const lock = useRef(false); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); const request = controller.current; return () => request.abort(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current) return;
    setError('');
    try {
      const number = normalizePhone(phone); lock.current = true; setBusy(true);
      const id = await api.checkAccount(number, controller.current.signal);
      if (!controller.current.signal.aborted) onCreate(id, number);
    } catch (cause) { if (!controller.current.signal.aborted) setError(errorMessage(cause)); }
    finally { lock.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  }
  return <dialog ref={dialog} className="new-chat-dialog" aria-labelledby="new-chat-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <button className="icon-button dialog-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
    <div className="login-icon"><Phone size={24} strokeWidth={1.7} /></div>
    <h2 id="new-chat-title">Новый разговор</h2>
    <p>Введите номер человека, которому хотите написать в MAX.</p>
    <form onSubmit={submit}>
      <label htmlFor="phone">Номер телефона</label>
      <input autoFocus id="phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+7 (999) 123-45-67" autoComplete="tel" required disabled={busy} aria-describedby="phone-help" />
      <span className="field-help" id="phone-help">Россия (+7) или Беларусь (+375)</span>
      {error && <div className="error-box" role="alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? <><span className="spinner" /> Проверяем номер…</> : <>Начать переписку <ArrowRight size={18} /></>}</button>
    </form>
  </dialog>;
}
