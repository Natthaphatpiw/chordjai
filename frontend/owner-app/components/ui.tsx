'use client';
import { useLocale, LanguageSwitcher } from '../../shared/locale';
import { localizeStatus } from './status-copy';
import { X, LoaderCircle, AlertCircle, FolderHeart } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) { const {locale,t}=useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} aria-label={title} className={`modal ${className}`} onCancel={event=>{event.preventDefault();onClose();}} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label={t("ปิดหน้าต่าง","Close dialog")} onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
export function Busy({ label }: { label?: string }) { const {locale,t}=useLocale(); return <div className="busy" role="status"><LoaderCircle className="spin" size={22}/><span>{label||t('กำลังโหลดข้อมูล','Loading…')}</span></div>; }
export function ErrorBox({ message }: { message: string }) { const {locale}=useLocale();return <div className="error-box" role="alert"><AlertCircle size={20}/><span>{localizeStatus(message,locale)}</span></div>; }
export function Empty({ icon = <FolderHeart size={30} strokeWidth={1.4}/>, title, detail }: { icon?: ReactNode; title: string; detail?: string }) { const {locale,t}=useLocale(); return <div className="empty"><span className="empty-icon" aria-hidden="true">{icon}</span><h3>{title}</h3>{detail ? <p>{detail}</p> : null}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div className="notice">{children}</div>; }
