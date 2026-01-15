'use client';

import { useEffect } from 'react';

interface NotificationProps {
  message: string;
  type?: 'error' | 'warning' | 'info' | 'success';
  onClose: () => void;
  duration?: number;
}

export function Notification({ message, type = 'info', onClose, duration = 3000 }: NotificationProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const bgColors = {
    error: 'bg-red-100 border-red-500 text-red-800',
    warning: 'bg-yellow-100 border-yellow-500 text-yellow-800',
    info: 'bg-blue-100 border-blue-500 text-blue-800',
    success: 'bg-green-100 border-green-500 text-green-800',
  };

  return (
    <div className={`fixed top-4 right-4 z-50 border rounded p-4 shadow-lg ${bgColors[type]} max-w-md`}>
      <div className="flex justify-between items-start">
        <p>{message}</p>
        <button
          onClick={onClose}
          className="ml-4 text-gray-600 hover:text-gray-800"
        >
          ×
        </button>
      </div>
    </div>
  );
}
