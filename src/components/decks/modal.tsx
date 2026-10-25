"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
export function DeckModal({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const el = ref.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    el?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = previous;
      requestAnimationFrame(() => {
        if (
          previousFocus?.isConnected &&
          !document.querySelector("dialog[open]")
        )
          previousFocus.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`deck-modal ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          aria-label="Đóng hộp thoại"
          disabled={busy}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
