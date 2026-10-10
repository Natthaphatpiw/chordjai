'use client';
import { X, LoaderCircle, AlertCircle } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="modal" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
export function Busy({ label = 'กำลังโหลดข้อมูล' }: { label?: string }) { return <div className="busy" role="status"><LoaderCircle className="spin" size={22}/><span>{label}</span></div>; }
export function ErrorBox({ message }: { message: string }) { return <div className="error-box" role="alert"><AlertCircle size={20}/><span>{message}</span></div>; }
export function Empty({ icon = '🌱', title, detail }: { icon?: string; title: string; detail?: string }) { return <div className="empty"><span>{icon}</span><h3>{title}</h3>{detail ? <p>{detail}</p> : null}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div className="notice">{children}</div>; }
