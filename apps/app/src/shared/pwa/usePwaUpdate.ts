import { useState, useEffect, useCallback } from 'react';
import { pwaManager } from './pwaService';

export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(() => pwaManager.getHasUpdate());
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('planless_update_dismissed') === 'true';
    }
    return false;
  });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    return pwaManager.subscribe((hasUpdate) => {
      setNeedRefresh(hasUpdate);
      if (hasUpdate) {
        setIsDismissed(false);
      }
    });
  }, []);

  const updateApp = useCallback(async () => {
    setIsUpdating(true);
    await pwaManager.updateApp();
  }, []);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('planless_update_dismissed', 'true');
    }
  }, []);

  return {
    needRefresh: needRefresh && !isDismissed,
    isUpdating,
    updateApp,
    dismissUpdate,
  };
}
