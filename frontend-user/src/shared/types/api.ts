/**
 * 统一 API 响应类型定义
 */

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PaginatedResponse<T> extends ApiResponse<PaginatedData<T>> {}

export type ApiErrorType =
  | 'AUTH_EXPIRED'
  | 'AUTH_KICKED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'QUOTA'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'SERVER'
  | 'UNKNOWN';

export interface ApiError {
  type: ApiErrorType;
  code?: number;
  message: string;
  status?: number;
  raw?: any;
}
