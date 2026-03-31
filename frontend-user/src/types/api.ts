import { AxiosResponse } from 'axios';

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T = any> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginatedResponse<T = any> extends ApiResponse<PaginatedData<T>> {}

export type ApiResult<T = any> = AxiosResponse<ApiResponse<T>>;
export type PaginatedResult<T = any> = AxiosResponse<PaginatedResponse<T>>;
