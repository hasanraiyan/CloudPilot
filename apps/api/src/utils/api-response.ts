export interface ApiResponseBody<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function successResponse<T>(data: T): ApiResponseBody<T> {
  return {
    success: true,
    data,
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
): ApiResponseBody<never> {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}
