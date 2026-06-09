"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastVariant = "default" | "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  action?: ToastAction;
  durationMs: number;
  variant: ToastVariant;
}

interface ToastApi {
  show: (opts: {
    message: string;
    action?: ToastAction;
    durationMs?: number;
    variant?: ToastVariant;
  }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => {
        // No provider mounted; silently no-op.
      },
    };
  }
  return ctx;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; icon: React.ReactNode; accent: string }
> = {
  default: {
    container: "bg-slate-900 text-white",
    icon: <Info className="h-4 w-4 text-slate-300" aria-hidden />,
    accent: "text-brand-300",
  },
  success: {
    container: "bg-white text-slate-900 border border-emerald-200",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />,
    accent: "text-emerald-700",
  },
  error: {
    container: "bg-white text-slate-900 border border-red-200",
    icon: <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />,
    accent: "text-red-700",
  },
  info: {
    container: "bg-white text-slate-900 border border-brand-500/30",
    icon: <Info className="h-4 w-4 text-brand-600" aria-hidden />,
    accent: "text-brand-700",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastApi["show"]>(
    ({ message, action, durationMs = 5000, variant = "default" }) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setToasts((t) => [...t, { id, message, action, durationMs, variant }]);
      const handle = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, handle);
    },
    [dismiss]
  );

  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const handle of t.values()) clearTimeout(handle);
      t.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const style = VARIANT_STYLES[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto w-full max-w-sm rounded-xl shadow-lg ring-1 ring-black/5 px-4 py-3 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-200 ${style.container}`}
            >
              <span className="shrink-0">{style.icon}</span>
              <span className="flex-1 leading-snug">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className={`text-xs font-semibold underline underline-offset-2 ${style.accent}`}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
