import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Info, HelpCircle, CheckCircle, X } from 'lucide-react';

interface DialogState {
  isOpen: boolean;
  message: string;
  type: 'alert' | 'confirm';
  title?: string;
  resolve?: (value: boolean) => void;
}

let openDialogRef: (message: string, type: 'alert' | 'confirm', title?: string) => Promise<boolean>;

export const customAlert = (message: string, title?: string): Promise<boolean> => {
  if (openDialogRef) {
    return openDialogRef(message, 'alert', title);
  }
  window.alert(message);
  return Promise.resolve(true);
};

export const customConfirm = (message: string, title?: string): Promise<boolean> => {
  if (openDialogRef) {
    return openDialogRef(message, 'confirm', title);
  }
  return Promise.resolve(window.confirm(message));
};

export const CustomDialogProvider: React.FC = () => {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    message: '',
    type: 'alert',
  });

  const okButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openDialogRef = (message: string, type: 'alert' | 'confirm', title?: string) => {
      return new Promise<boolean>((resolve) => {
        setState({
          isOpen: true,
          message,
          type,
          title,
          resolve,
        });
      });
    };

    return () => {
      openDialogRef = null as any;
    };
  }, []);

  // Autofocus OK button when open
  useEffect(() => {
    if (state.isOpen && okButtonRef.current) {
      setTimeout(() => {
        okButtonRef.current?.focus();
      }, 50);
    }
  }, [state.isOpen]);

  if (!state.isOpen) return null;

  const handleConfirm = () => {
    state.resolve?.(true);
    setState(prev => ({ ...prev, isOpen: false }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState(prev => ({ ...prev, isOpen: false }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const isDestructive = state.message.toLowerCase().includes('delete') || 
                        state.message.toLowerCase().includes('remove') ||
                        state.message.toLowerCase().includes('clear') ||
                        state.message.toLowerCase().includes('rejoin') ||
                        state.message.toLowerCase().includes('reset');

  const getIcon = () => {
    if (isDestructive) {
      return <AlertTriangle className="text-red-400" size={24} />;
    }
    if (state.type === 'confirm') {
      return <HelpCircle className="text-indigo-400 light-theme:text-indigo-600" size={24} />;
    }
    if (state.message.toLowerCase().includes('success') || state.message.toLowerCase().includes('copied') || state.message.toLowerCase().includes('saved')) {
      return <CheckCircle className="text-emerald-400 light-theme:text-emerald-600" size={24} />;
    }
    return <Info className="text-blue-400 light-theme:text-blue-600" size={24} />;
  };

  const getTitle = () => {
    if (state.title) return state.title;
    if (state.type === 'confirm') {
      return isDestructive ? 'Confirm Action' : 'Are you sure?';
    }
    return 'Notification';
  };

  const iconBg = isDestructive 
    ? 'bg-red-500/10 border border-red-500/20' 
    : state.type === 'confirm' 
      ? 'bg-indigo-500/10 border border-indigo-500/20' 
      : 'bg-blue-500/10 border border-blue-500/20';

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-200 animate-in fade-in" 
      onClick={handleCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl relative select-none animate-in zoom-in-95 duration-200" 
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4 mb-4 mt-1">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-6 truncate">
              {getTitle()}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-medium">
              Staff-Sync Confirmation
            </p>
          </div>
        </div>

        <div className="text-slate-900 dark:text-slate-200 text-sm mb-6 whitespace-pre-line leading-relaxed pr-1 select-text">
          {state.message}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {state.type === 'confirm' && (
            <button 
              ref={cancelButtonRef}
              onClick={handleCancel} 
              className="px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all"
            >
              Cancel
            </button>
          )}
          <button 
            ref={okButtonRef}
            onClick={handleConfirm} 
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md transition-all active:scale-95 ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' 
                : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 dark:bg-purple-600 dark:hover:bg-purple-700'
            }`}
          >
            {state.type === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
