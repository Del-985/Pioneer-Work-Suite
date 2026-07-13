interface ApiErrorLike {
  message?: unknown;
  response?: {
    data?: {
      error?: unknown;
    };
  };
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as ApiErrorLike;
  const responseMessage = candidate.response?.data?.error;

  if (typeof responseMessage === "string") {
    return responseMessage;
  }

  return typeof candidate.message === "string"
    ? candidate.message
    : fallback;
}

