import { createContext, useContext } from 'react';

type NoticeKind = 'success' | 'error' | 'info';

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface UiFeedbackContextValue {
  notify: (kind: NoticeKind, message: string) => void;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
}

export const UiFeedbackContext = createContext<UiFeedbackContextValue | null>(null);

export function useUiFeedback() {
  const context = useContext(UiFeedbackContext);
  if (!context) {
    throw new Error('useUiFeedback must be used within UiFeedbackProvider.');
  }
  return context;
}
