export class LabError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'LabError';
  }
}

export function safeError(error: unknown): string {
  if (error instanceof LabError) return error.message;
  if (error instanceof Error && ['AbortError', 'TimeoutError', 'APITimeoutError', 'APIConnectionTimeoutError'].includes(error.name)) {
    return 'Request timed out or was cancelled. No automatic retry was made.';
  }
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    const descriptions: Record<number, string> = {
      400: 'Provider rejected the request. Verify model support for strict structured output.',
      401: 'Provider authentication failed. Check the API key.',
      403: 'Provider access denied. Check the key and model access.',
      404: 'Provider endpoint or model was not found. Check the base URL and model name.',
      429: 'Provider rate limit or quota reached. No automatic retry was made.',
    };
    return descriptions[error.status] ?? `Provider returned HTTP ${error.status}. No automatic retry was made.`;
  }
  return 'Provider operation failed. Check connectivity, endpoint compatibility, and credentials. Raw error details are withheld.';
}
