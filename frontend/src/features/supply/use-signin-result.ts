import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const REASONS: Record<string, string> = {
  denied: "DigiKey did not give access.",
  expired: "This sign-in expired or was already used. Start it again from the connector.",
  wrong_person: "Finish the sign-in as the person who started it.",
  no_code: "DigiKey did not send a code back.",
  no_tokens: "DigiKey did not issue the tokens.",
  refused: "DigiKey refused the sign-in.",
  unreadable: "The connector or its credentials cannot be read.",
};

/**
 * After a DigiKey sign-in the server sends the browser back with `signin=ok` or `signin=failed&reason=<code>`.
 * The wording is fixed here, never taken from the address. Say how it went once, then take the result out of the
 * address so a reload does not say it again.
 */
export function useSigninResult(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const result = searchParams.get("signin");
  const reason = searchParams.get("reason") ?? "";

  useEffect(() => {
    if (!result) return;
    if (result === "ok") toast.success("Signed in at DigiKey", { description: "Change notices will be read with the next polls." });
    else {
      const message = REASONS[reason];
      toast.error("The DigiKey sign-in did not finish", message ? { description: message } : undefined);
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("signin");
      next.delete("reason");
      return next;
    }, { replace: true });
  }, [result, reason, setSearchParams]);
}
