export interface StoredRawNote {
  account: string;
  kind: string | null;
  title: string | null;
  text: string;
  createdAt: string;
  status: "draft" | "sent";
}
