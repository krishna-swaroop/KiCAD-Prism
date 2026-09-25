import { useLayoutEffect, useRef } from "react";

/** Keep an event/effect consumer on the last value React actually committed. */
export function useCommittedRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
