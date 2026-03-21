import { useState, useEffect, useRef, useCallback } from 'react';
import { getPendingCount } from '../services/offlineStore';

// ============================================================
// useOnlineStatus — tracks navigator.onLine
// ============================================================
export const useOnlineStatus = () => {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
};

// ============================================================
// usePendingSync — count of items waiting to sync
// ============================================================
export const usePendingSync = (bizId) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!bizId) return;
    const check = async () => setCount(await getPendingCount(bizId));
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [bizId]);

  return count;
};

// ============================================================
// useDebounce — debounces a value by delay ms
// ============================================================
export const useDebounce = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

// ============================================================
// useAsync — run an async function, track loading/error
// ============================================================
export const useAsync = (fn, deps = []) => {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(data => {
      if (!cancelled) setState({ data, loading: false, error: null });
    }).catch(err => {
      if (!cancelled) setState({ data: null, loading: false, error: err.message });
    });
    return () => { cancelled = true; };
  }, deps);

  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    fn().then(data => setState({ data, loading: false, error: null }))
       .catch(err => setState({ data: null, loading: false, error: err.message }));
  }, deps);

  return { ...state, reload };
};
