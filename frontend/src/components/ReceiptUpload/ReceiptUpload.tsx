import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import {
  ImagePreview,
  type PreviewItem,
} from './ImagePreview';
import { ImageCropper } from './ImageCropper';
import { ManualEntryFallback, type ManualEntryData } from './ManualEntryFallback';
import {
  MAX_FILE_SIZE_BYTES,
  isImageFile,
} from './utils/cropUtils';

const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

export interface ReceiptUploadProps {
  /** Called with array of processed files (images compressed, PDFs as-is) */
  onFilesChange?: (files: File[]) => void;
  /** Called when user submits manual entry instead of uploading */
  onManualEntry?: (data: ManualEntryData) => void;
  /** Called on validation or processing errors */
  onError?: (error: Error) => void;
  /** Max file size in bytes (default 10MB) */
  maxFileSize?: number;
  /** Max number of files (default 10) */
  maxFiles?: number;
}

function generateId() {
  return `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ReceiptUpload({
  onFilesChange,
  onManualEntry,
  onError,
  maxFileSize = MAX_FILE_SIZE_BYTES,
  maxFiles = 10,
}: ReceiptUploadProps) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [cropModal, setCropModal] = useState<{ item: PreviewItem; url: string } | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const removeItem = useCallback(
    (id: string) => {
      setUploadError(null);
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
        const next = prev.filter((i) => i.id !== id);
        onFilesChange?.(next.map((i) => i.file));
        return next;
      });
    },
    [onFilesChange]
  );

  const processFile = useCallback(
    async (file: File): Promise<PreviewItem> => {
      const id = generateId();
      if (isImageFile(file)) {
        const url = URL.createObjectURL(file);
        setItems((prev) => [
          ...prev,
          { id, file, previewUrl: url, progress: 0 },
        ]);
        try {
          const compressed = await imageCompression(file, {
            maxSizeMB: 5,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            onProgress: (p) => {
              setItems((prev) =>
                prev.map((i) => (i.id === id ? { ...i, progress: p } : i))
              );
            },
          });
          const resultFile = new File([compressed], file.name, {
            type: compressed.type,
          });
          setItems((prev) => {
            const next = prev.map((i) =>
              i.id === id
                ? { ...i, file: resultFile, progress: 100, previewUrl: url }
                : i
            );
            onFilesChange?.(next.map((i) => i.file));
            return next;
          });
          return { id, file: resultFile, previewUrl: url, progress: 100 };
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Compression failed');
          onError?.(error);
          setItems((prev) =>
            prev.map((i) =>
              i.id === id ? { ...i, error: error.message, progress: undefined } : i
            )
          );
          return { id, file, previewUrl: url, error: error.message };
        }
      } else {
        setItems((prev) => {
          const next = [...prev, { id, file }];
          onFilesChange?.(next.map((i) => i.file));
          return next;
        });
        return { id, file };
      }
    },
    [onFilesChange, onError]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setUploadError(null);
      fileRejections.forEach(({ file, errors }) => {
        const msg = errors.find((e) => e.code === 'file-too-large')
          ? `"${file.name}" is larger than ${maxFileSize / 1024 / 1024}MB`
          : errors.find((e) => e.code === 'file-invalid-type')
            ? `"${file.name}" is not a supported type (use JPG, PNG, or PDF)`
            : `"${file.name}" could not be accepted`;
        setUploadError((prev) => (prev ? `${prev}; ${msg}` : msg));
      });
      const toProcess = acceptedFiles.slice(0, maxFiles - items.length);
      toProcess.forEach((file) => processFile(file));
    },
    [maxFileSize, maxFiles, items.length, processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: maxFileSize,
    maxFiles: maxFiles - items.length,
    multiple: true,
    disabled: items.length >= maxFiles,
    onDropRejected: (rejected) => {
      const first = rejected[0];
      if (first?.errors[0]?.code === 'file-too-large') {
        setUploadError(`File must be under ${maxFileSize / 1024 / 1024}MB`);
      } else if (first?.errors[0]?.code === 'file-invalid-type') {
        setUploadError('Please use JPG, PNG, or PDF only.');
      }
    },
  });

  const handleCrop = useCallback((item: PreviewItem) => {
    if (!item.previewUrl) return;
    setCropModal({ item, url: item.previewUrl });
  }, []);

  const handleCropConfirm = useCallback(
    (croppedFile: File) => {
      if (!cropModal) return;
      const { item } = cropModal;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      const newUrl = URL.createObjectURL(croppedFile);
      setItems((prev) => {
        const next = prev.map((i) =>
          i.id === item.id
            ? { ...i, file: croppedFile, previewUrl: newUrl, error: undefined }
            : i
        );
        onFilesChange?.(next.map((previewItem) => previewItem.file));
        return next;
      });
      setCropModal(null);
    },
    [cropModal, onFilesChange]
  );

  const handleCropCancel = useCallback(() => {
    setCropModal(null);
  }, []);

  const handleManualSubmit = useCallback(
    (data: ManualEntryData) => {
      onManualEntry?.(data);
      setShowManualEntry(false);
    },
    [onManualEntry]
  );

  return (
    <div className="space-y-4">
      {!showManualEntry ? (
        <>
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-xl p-6 md:p-8 text-center cursor-pointer transition-colors
              min-h-[140px] flex flex-col items-center justify-center gap-2
              ${isDragActive ? 'border-accent bg-accent/10' : 'border-theme bg-card-theme hover:bg-surface'}
              ${items.length >= maxFiles ? 'opacity-60 cursor-not-allowed' : ''}
            `}
          >
            <input {...getInputProps()} aria-label="Upload receipt files" />
            <Upload size={40} className="text-muted-theme" />
            <p className="text-theme font-medium">
              {isDragActive
                ? 'Drop files here…'
                : 'Drag & drop receipts here, or click to browse'}
            </p>
            <p className="text-sm text-muted-theme">
              JPG, PNG, or PDF · max {maxFileSize / 1024 / 1024}MB each · up to {maxFiles} files
            </p>
          </div>

          {uploadError && (
            <div
              className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm"
              role="alert"
            >
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {items.length > 0 && (
            <>
              <ImagePreview
                items={items}
                onCrop={handleCrop}
                onRemove={removeItem}
                maxColumns={4}
              />
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowManualEntry(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-theme bg-surface text-theme hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 ring-theme min-h-[44px]"
            >
              <FileText size={18} />
              Enter details manually
            </button>
          </div>
        </>
      ) : (
        <ManualEntryFallback
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManualEntry(false)}
        />
      )}

      {cropModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Crop image"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <ImageCropper
              src={cropModal.url}
              fileName={cropModal.item.file.name}
              onConfirm={handleCropConfirm}
              onCancel={handleCropCancel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
