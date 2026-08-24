import type { ID, ISODateString } from './common';

export interface Upload {
  id?: ID;
  /** Gateway 用 filename 作为唯一标识,不一定有 id */
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  uploaded_at: ISODateString;
}
