import { useEffect, useRef } from 'react'
import { requestHandler } from '.';

// hook to fetch requests in the useEffect
function useRenderFetch(api, setLoading, onSuccess, onError, args = [], dependencies = [], conditionToCheck = () => true) {
  const renderNumberRef = useRef(1);

  useEffect(() => {
    if (!conditionToCheck()) {
      return;
    }

    const controller = new AbortController();

    const renderNumberValueAtCall = renderNumberRef.current;

    requestHandler(
      async (signal) => {
        return api(...args, signal);
      },
      setLoading,
      (data) => {
        //check if the render has changed since
        if (renderNumberRef.current === renderNumberValueAtCall) {
          if (onSuccess) {
            onSuccess(data);
          }
        } else {
          return { restrictUndoSetLoading: true }
        }
      },
      (errorMessage) => {
        if (renderNumberRef.current === renderNumberValueAtCall) {
          if (onError) onError(errorMessage);
        } else {
          return { restrictUndoSetLoading: true }
        }
      },
      0,
      controller.signal
    );

    // upon cleanup, increase the render number and and abort the api call
    return () => {
      renderNumberRef.current += 1;
      controller.abort();
    }
  }, [...dependencies]);

  return;
}

export default useRenderFetch;
