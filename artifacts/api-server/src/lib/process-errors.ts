export interface RecentProcessError {
  timestamp: string;
  type: string;
  message: string;
}

const recentErrors: RecentProcessError[] = [];
const MAX_RECENT_ERRORS = 5;

function sanitizeErrorMessage(value: unknown): string {
  const raw =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : String(value);

  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted database URL]")
    .replace(/\bDATABASE_URL\s*[:=]\s*[^\s,;]+/gi, "DATABASE_URL=[redacted]")
    .replace(
      /\b(password|passwd|token|secret|authorization|api[_-]?key)\b\s*[:=]\s*["']?[^,\s;"']+/gi,
      "$1=[redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted token]",
    )
    .slice(0, 300);
}

function rememberError(type: string, error: unknown): void {
  recentErrors.push({
    timestamp: new Date().toISOString(),
    type,
    message: sanitizeErrorMessage(error),
  });

  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }
}

// Monitor-only keeps Node's normal uncaught-exception/rejection behavior intact.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  rememberError(origin, error);
});

export function getRecentProcessErrors(): RecentProcessError[] {
  return recentErrors.map((entry) => ({ ...entry }));
}

export function safeDiagnosticError(error: unknown): string {
  return sanitizeErrorMessage(error);
}
