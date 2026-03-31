import { useState, useCallback, useEffect } from 'react';

interface UseLocalStorageOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  options: UseLocalStorageOptions<T> = {},
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options;

  const getStoredValue = useCallback((): T => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) return deserialize(item);
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  }, [key, initialValue, deserialize]);

  const [storedValue, setStoredValue] = useState<T>(getStoredValue);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore =
          typeof value === 'function' ? (value as (prev: T) => T)(storedValue) : value;
        setStoredValue(valueToStore);
        localStorage.setItem(key, serialize(valueToStore));
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, serialize, storedValue],
  );

  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setStoredValue(typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(deserialize(e.newValue));
        } catch (error) {
          console.warn(`Error deserializing storage event for key "${key}":`, error);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, deserialize]);

  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;
