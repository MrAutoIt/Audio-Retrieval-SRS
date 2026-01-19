'use client';

import { useEffect } from 'react';

export interface ExportItemStatus {
  sentenceId: string;
  sentenceText: string;
  status: 'pending' | 'exporting' | 'success' | 'failed';
  error?: string;
}

interface ExportProgressModalProps {
  isOpen: boolean;
  items: ExportItemStatus[];
  onClose: () => void;
  onDownload?: (zipBlob: Blob) => void;
  exportPackageBlob?: Blob | null;
}

export default function ExportProgressModal({
  isOpen,
  items,
  onClose,
  onDownload,
  exportPackageBlob,
}: ExportProgressModalProps) {
  if (!isOpen) return null;

  const allComplete = items.every(item => item.status === 'success' || item.status === 'failed');
  const hasErrors = items.some(item => item.status === 'failed');
  const successCount = items.filter(item => item.status === 'success').length;

  function handleDownload() {
    if (!exportPackageBlob || !onDownload) return;
    
    // Validate blob size
    if (exportPackageBlob.size === 0) {
      console.error('[ExportProgressModal] Blob is empty, cannot download');
      return;
    }
    
    onDownload(exportPackageBlob);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Export Progress</h2>
        
        <div className="space-y-2 mb-4">
          {items.map((item) => (
            <div
              key={item.sentenceId}
              className={`p-3 rounded border ${
                item.status === 'success'
                  ? 'bg-green-50 border-green-200'
                  : item.status === 'failed'
                  ? 'bg-red-50 border-red-200'
                  : item.status === 'exporting'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">{item.sentenceText}</div>
                  {item.status === 'pending' && (
                    <div className="text-xs text-gray-500">Waiting...</div>
                  )}
                  {item.status === 'exporting' && (
                    <div className="text-xs text-blue-600">Generating audio...</div>
                  )}
                  {item.status === 'success' && (
                    <div className="text-xs text-green-600">Exported successfully</div>
                  )}
                  {item.status === 'failed' && (
                    <div className="text-xs text-red-600">
                      {item.error || 'Export failed'}
                    </div>
                  )}
                </div>
                {item.status === 'exporting' && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 ml-2"></div>
                )}
                {item.status === 'success' && (
                  <div className="text-green-600 ml-2">✓</div>
                )}
                {item.status === 'failed' && (
                  <div className="text-red-600 ml-2">✗</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-sm text-gray-600 mb-4">
          {successCount} of {items.length} items exported successfully
          {hasErrors && ` (${items.length - successCount} failed)`}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            {allComplete ? 'Close' : 'Cancel'}
          </button>
          {allComplete && successCount > 0 && exportPackageBlob && exportPackageBlob.size > 0 && (
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Download Package
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
