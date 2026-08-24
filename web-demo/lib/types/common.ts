export type ID = string;
export type ISODateString = string;
export type Result<T, E = ApiError> = { ok: true; data: T } | { ok: false; error: E };

export interface ApiError {
  message: string;
  code: string;
  request_id?: string;
  status: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
