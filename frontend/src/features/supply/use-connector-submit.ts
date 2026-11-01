import { useCallback, useState } from "react";

/** Busy and error state for one form submit. `run` returns whether the action succeeded. */
export function useConnectorSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, run };
}
