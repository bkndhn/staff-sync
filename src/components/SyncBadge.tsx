import React from 'react';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export const SyncBadge: React.FC = () => {
  const { syncState, pendingCount, forceSync } = useOfflineSync();

  return (
    <div 
      onClick={forceSync}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border
        ${syncState === 'online-synced' 
          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' 
          : syncState === 'online-syncing'
          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
          : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
        }`}
      title={syncState === 'offline' ? 'Offline - Changes will sync when online' : 'Click to force sync'}
    >
      {syncState === 'online-synced' && (
        <>
          <Wifi size={14} />
          <span className="hidden sm:inline">Synced</span>
        </>
      )}
      
      {syncState === 'online-syncing' && (
        <>
          <RefreshCw size={14} className="animate-spin" />
          <span className="hidden sm:inline">Syncing...</span>
        </>
      )}

      {syncState === 'offline' && (
        <>
          <WifiOff size={14} />
          <span className="hidden sm:inline">Offline</span>
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">
              {pendingCount}
            </span>
          )}
        </>
      )}
    </div>
  );
};
