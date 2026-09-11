export interface FirmSnapshot {
  id: string;
  companyId: string;
  sourceRepo: string;
  commitSha: string | null;
  snapshotJson: Record<string, unknown>;
  contextMarkdown: string;
  isLatest: boolean;
  fetchedAt: Date;
  createdAt: Date;
}
