/**
 * Export metadata for tracking which sentences have been exported
 */
export interface ExportMetadata {
  sentenceId: string;
  exportedAt: Date;
  exportPackageId: string; // UUID-* format
  cardId: string; // UUID-[] format for the card folder
}
