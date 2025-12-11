export type FormatApiErrorOptions = {
  defaultMessage?: string;
  knownPatterns?: Array<{ test: RegExp; message: string }>;
};

export function formatApiError(err: unknown, options?: FormatApiErrorOptions): string {
  const defaultMsg = options?.defaultMessage ?? "Something went wrong. Please try again.";

  try {
    const raw = err instanceof Error ? String(err.message) : String(err);

    // Common network failures
    if (/failed to fetch|network error|networkrequestfailed/i.test(raw)) {
      return "We couldn't reach the server. Please check your connection and try again.";
    }

    // Trim leading status prefix like "400: {json}"
    const idx = raw.indexOf(":");
    const after = idx >= 0 ? raw.slice(idx + 1).trim() : raw.trim();

    // Try JSON parse first
    try {
      const parsed = JSON.parse(after);
      if (parsed && typeof parsed === "object") {
        if ("message" in parsed) return String((parsed as any).message);
        if ("error" in parsed) return String((parsed as any).error);
      }
    } catch {}

    // Try to extract message from JSON-like text
    const match = after.match(/"message"\s*:\s*"([^"]+)"/);
    if (match) return match[1];

    // Apply known pattern overrides
    if (options?.knownPatterns) {
      for (const kp of options.knownPatterns) {
        if (kp.test.test(after)) return kp.message;
      }
    }

    // Reasonable fallbacks for common account cases
    if (/incorrect/i.test(after)) return "Current password is incorrect";
    if (/required/i.test(after) && /password/i.test(after)) return "Current password is required";
    if (/email/i.test(after) && /invalid|format/.test(after)) return "Please enter a valid email address.";
    if (/email/i.test(after) && /exist|used|taken/.test(after)) return "That email is already in use.";
    if (/username/i.test(after) && /exist|used|taken/.test(after)) return "That username is already taken.";

    return defaultMsg;
  } catch {
    return defaultMsg;
  }
}
