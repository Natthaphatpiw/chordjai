'use client';
import { X, LoaderCircle, AlertCircle, FolderHeart } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className={`modal ${className}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
export function Busy({ label = 'กำลังโหลดข้อมูล' }: { label?: string }) { return <div className="busy" role="status"><LoaderCircle className="spin" size={22}/><span>{label}</span></div>; }
export function ErrorBox({ message }: { message: string }) { return <div className="error-box" role="alert"><AlertCircle size={20}/><span>{message}</span></div>; }
export function Empty({ icon = <FolderHeart size={30} strokeWidth={1.4}/>, title, detail }: { icon?: ReactNode; title: string; detail?: string }) { return <div className="empty"><span className="empty-icon" aria-hidden="true">{icon}</span><h3>{title}</h3>{detail ? <p>{detail}</p> : null}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div className="notice">{children}</div>; }
