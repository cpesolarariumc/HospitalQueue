import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UiFeedbackContext } from './uiFeedbackContext';

type NoticeKind = 'success' | 'error' | 'info';

interface UiNotice {
  kind: NoticeKind;
  message: string;
}

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export default function UiFeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationOptions | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const confirmationResolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const dismissNotice = useCallback(() => {
    if (noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
    setNotice(null);
  }, []);

  const notify = useCallback((kind: NoticeKind, message: string) => {
    if (noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    setNotice({ kind, message });
    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimeoutRef.current = null;
    }, 6000);
  }, []);

  const settleConfirmation = useCallback((accepted: boolean) => {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolve) => {
    confirmationResolverRef.current?.(false);
    confirmationResolverRef.current = resolve;
    setConfirmation(options);
  }), []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    confirmationResolverRef.current?.(false);
    confirmationResolverRef.current = null;
  }, []);

  const noticeClasses = notice?.kind === 'error'
    ? 'border-red-200 bg-red-50 text-red-800'
    : notice?.kind === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-sky-200 bg-sky-50 text-sky-800';

  return (
    <UiFeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
          className={`fixed left-1/2 top-3 z-[120] flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 items-start justify-between gap-4 rounded-2xl border p-4 text-sm font-semibold shadow-xl ${noticeClasses}`}
        >
          <p>{notice.message}</p>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold hover:bg-black/5"
          >
            Dismiss
          </button>
        </div>
      )}
      {confirmation && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ui-confirmation-title"
            aria-describedby="ui-confirmation-message"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h2 id="ui-confirmation-title" className="text-lg font-bold text-slate-900">
              {confirmation.title}
            </h2>
            <p id="ui-confirmation-message" className="mt-2 text-sm leading-6 text-slate-600">
              {confirmation.message}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => settleConfirmation(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {confirmation.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settleConfirmation(true)}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition ${
                  confirmation.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {confirmation.confirmLabel || 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}
    </UiFeedbackContext.Provider>
  );
}
