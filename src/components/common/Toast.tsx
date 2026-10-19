import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 bottom-6 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-night/95 text-white text-xs md:text-sm font-medium tracking-wide shadow-2xl backdrop-blur-xl border border-white/10 transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 max-w-[90vw] text-center"
    >
      {message}
    </div>
  );
};
