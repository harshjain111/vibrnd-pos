"use client";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";
import { ToastContextProvider, useToast } from "./use-toast";

function ToasterInner() {
  const { toasts, dismiss } = useToast();
  return (
    <>
      {toasts.map(({ id, title, description, variant, duration }) => (
        <Toast
          key={id}
          variant={variant ?? "default"}
          duration={duration ?? 3500}
          onOpenChange={(open) => {
            if (!open) dismiss(id);
          }}
        >
          <div className="grid gap-0.5">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </>
  );
}

export function Toaster({ children }: { children?: React.ReactNode }) {
  return (
    <ToastContextProvider>
      <ToastProvider swipeDirection="right">
        {children}
        <ToasterInner />
      </ToastProvider>
    </ToastContextProvider>
  );
}
