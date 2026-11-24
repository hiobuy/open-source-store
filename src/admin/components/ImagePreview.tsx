import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, X } from "lucide-react";
import { useI18n } from "../lib/i18n";

/** Native modal keeps previews above drawers and restores focus to the thumbnail. */
export function ImagePreview({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const panel = dialog.current!;
    const opener = document.activeElement as HTMLElement | null;
    panel.showModal();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Do not also close an underlying order/package drawer.
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      panel.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} aria-label={name} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-hidden rounded-xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/80">
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
      <p className="min-w-0 truncate text-sm font-medium" title={name}>{name}</p>
      <button type="button" autoFocus aria-label={t("Close")} onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500"><X size={20} /></button>
    </div>
    {failed ? <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-400"><ImageOff size={28} />{t("Image unavailable")}</div> :
      <img src={url} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[calc(92dvh_-_4rem)] min-h-32 w-full bg-slate-950 object-contain" />}
  </dialog>, document.body);
}

