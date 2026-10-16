import type { PinCheck } from "./service";

/** What the sign-in screen says after a PIN that didn't work. */
export function pinFailureMessage(result: Exclude<PinCheck, { ok: true }>): string {
  switch (result.reason) {
    case "unknown":
      return "That person can't sign in on this till. Ask a manager.";
    case "locked": {
      const minutes = Math.max(1, Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60_000));
      return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask a manager.`;
    }
    case "invalid":
      return result.attemptsLeft <= 2
        ? `Wrong PIN. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left before a 5-minute lock.`
        : "Wrong PIN. Try again.";
  }
}
