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
      className="modal-overlay" 
      onClick={handleCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="modal-content select-none relative !max-w-md border border-white/10 dark:border-white/5 shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-all"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4 mb-4 mt-1">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-lg font-bold text-white leading-6 truncate">
              {getTitle()}
            </h3>
            <p className="text-white/40 text-xs mt-0.5 font-medium">
              staff-sync application
            </p>
          </div>
        </div>

        <div className="text-white/80 text-sm mb-6 whitespace-pre-line leading-relaxed pr-1 select-text">
          {state.message}
        </div>

        <div className="flex justify-end gap-3">
          {state.type === 'confirm' && (
            <button 
              ref={cancelButtonRef}
              onClick={handleCancel} 
              className="px-5 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/5 border border-white/10 font-medium text-sm transition-all"
            >
              Cancel
            </button>
          )}
          <button 
            ref={okButtonRef}
            onClick={handleConfirm} 
            className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md active:scale-95 ${
              isDestructive 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-indigo-500 hover:bg-indigo-600 text-white dark:bg-purple-500 dark:hover:bg-purple-600'
            }`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
