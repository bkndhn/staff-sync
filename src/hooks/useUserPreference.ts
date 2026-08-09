import { useState, useEffect } from 'react';
import { userPreferencesService } from '../services/userPreferencesService';

export function useUserPreference<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userPreferencesService.getPreference<T>(key, defaultValue).then(val => {
      setValue(val);
      setLoading(false);
    });
  }, [key]); // We rely on stringification if we want to add defaultValue to deps, but it's usually static

  const updateValue = (newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = newValue instanceof Function ? newValue(prev) : newValue;
      userPreferencesService.setPreference(key, next);
      return next;
    });
  };

  return [value, updateValue, loading] as const;
}
