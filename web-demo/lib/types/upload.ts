import type { ID, ISODateString } from './common';

export interface Upload {
  id: ID;
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  uploaded_at: ISODateString;
}
