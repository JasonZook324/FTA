export function userMessageFromError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  // Pattern: "<status>: <body>"
  const colon = raw.indexOf(":");
  const statusPart = colon > -1 ? raw.slice(0, colon).trim() : "";
  const bodyPart = colon > -1 ? raw.slice(colon + 1).trim() : raw;

  // Try JSON parse of body for { message, code }
  if (bodyPart.startsWith("{") && bodyPart.endsWith("}")) {
    try {
      const json = JSON.parse(bodyPart);
      if (json && typeof json.message === "string" && json.message.length) {
        return json.message;
      }
    } catch {/* ignore */}
  }

  // If body contains plain message text
  if (bodyPart && !/^[{\[]/.test(bodyPart)) {
    // For cases like "Invalid username or password"
    if (bodyPart.length < 200) return bodyPart;
  }

  const status = parseInt(statusPart, 10);
  switch (status) {
    case 400:
      return "Please check your input and try again.";
    case 401:
      return "Invalid username or password.";
    case 403:
      return "You don’t have permission to perform this action.";
    case 404:
      return "We couldn’t find what you were looking for.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Something went wrong on our side. Please try again.";
    default:
      return fallback;
  }
}
