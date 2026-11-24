"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, ZoomIn, Trash2 } from "lucide-react";
import { uploadProcurementImage } from "@/lib/procurement/client";
import { MAX_CLIENT_IMAGE_BYTES } from "@/lib/procurement/types";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
export interface ImageUploadFile {
  name: string;
  url: string;
  file?: File;
}
export interface ImageUploadProps {
  value?: string | ImageUploadFile | ImageUploadFile[];
  onChange?: (value: ImageUploadFile[]) => void;
  limit?: number;
  fileSize?: number;
  fileType?: string[];
  showTip?: boolean;
  width?: string | number;
  height?: string | number;
  readonly?: boolean;
  temporary?: boolean;
  selectForSubmit?: boolean;
}
const DEFAULT_FILE_TYPE = ["png", "jpg", "jpeg"];
const formatSize = (size: string | number) =>
  typeof size === "number" ? `${size}px` : size;
function normalizeFiles(value: ImageUploadProps["value"]): ImageUploadFile[] {
  if (!value) return [];
  if (typeof value === "string")
    return value
      .split(",")
      .filter(Boolean)
      .map((url) => ({ name: url, url }));
  if (Array.isArray(value))
    return value.map((item) =>
      typeof item === "string" ? { name: item, url: item } : item,
    );
  return [value];
}
export function ImageUpload({
  value,
  onChange,
  limit = 5,
  fileSize = MAX_CLIENT_IMAGE_BYTES / (1024 * 1024),
  fileType = DEFAULT_FILE_TYPE,
  showTip = true,
  width = 80,
  height = 80,
  readonly = false,
  temporary = false,
  selectForSubmit = false,
}: ImageUploadProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const localPreviews = useRef(new Set<string>());
  useEffect(() => {
    const previews = localPreviews.current;
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
      previews.clear();
    };
  }, []);
  const suppliedFiles = normalizeFiles(value);
  const valueKey = JSON.stringify(suppliedFiles);
  const [localFiles, setLocalFiles] = useState({
    valueKey,
    files: suppliedFiles,
  });
  const fileList =
    localFiles.valueKey === valueKey ? localFiles.files : suppliedFiles;
  const setFileList = (files: ImageUploadFile[]) =>
    setLocalFiles({ valueKey, files });
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const normalizedFileType = fileType.length
    ? fileType
    : ["png", "jpg", "jpeg"];
  const w = formatSize(width);
  const h = formatSize(height);
  const formatsJoined = normalizedFileType.join("/");
  const validateFile = (file: File): boolean => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const validExt = normalizedFileType.some(
      (t) => ext === t.toLowerCase() || file.type?.includes(t),
    );
    if (!validExt) {
      toast.error(
        t("Invalid file format Please upload {formats} image files", {
          formats: formatsJoined,
        }),
      );
      return false;
    }
    if (file.name.includes(",")) {
      toast.error(t("Invalid file name Cannot contain commas"));
      return false;
    }
    if (fileSize && file.size / 1024 / 1024 > fileSize) {
      toast.error(t("Image size cannot exceed {maxMb}MB", { maxMb: fileSize }));
      return false;
    }
    return true;
  };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (fileList.length + files.length > limit) {
      toast.error(t("Cannot upload more than {limit} files", { limit }));
      return;
    }
    if (selectForSubmit) {
      const selected = Array.from(files)
        .filter(validateFile)
        .map((file) => {
          const url = URL.createObjectURL(file);
          localPreviews.current.add(url);
          return { name: file.name, url, file };
        });
      if (selected.length) {
        const next = [...fileList, ...selected];
        setFileList(next);
        onChange?.(next);
      }
      e.currentTarget.value = "";
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!validateFile(file)) continue;
      setUploading(true);
      try {
        const uploaded = await uploadProcurementImage(file, temporary);
        const newFile = { name: uploaded.id, url: uploaded.url };
        const next = [...fileList, newFile];
        setFileList(next);
        onChange?.(next);
        toast.success(t("Upload successful"));
      } catch (err) {
        console.error("Upload error:", err);
        toast.error(t("Upload failed"));
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  };
  const handleRemove = (file: ImageUploadFile) => {
    if (localPreviews.current.delete(file.url)) URL.revokeObjectURL(file.url);
    const next = fileList.filter(
      (f) => f.url !== file.url && f.name !== file.name,
    );
    setFileList(next);
    onChange?.(next);
  };
  const handlePreview = (url: string) => setPreviewUrl(url);
  const renderTipSegment = (
    template: string,
    placeholder: "{maxMb}" | "{formats}",
    bold: string,
  ) => {
    const i = template.indexOf(placeholder);
    if (i === -1) return template;
    return (
      <>
        {template.slice(0, i)}
        <b className="text-red-500">{bold}</b>
        {template.slice(i + placeholder.length)}
      </>
    );
  };
  return (
    <div className="image-upload">
      <div className="flex flex-wrap gap-2">
        {fileList.map((file) => (
          <div
            key={file.url}
            className="group relative overflow-hidden rounded-lg border bg-gray-100"
            style={{ width: w, height: h }}
          >
            <img
              src={file.url}
              alt=""
              className="block h-full w-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23eee' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3E?%3C/text%3E%3C/svg%3E";
              }}
            />
            {!readonly && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handlePreview(file.url)}
                  className="rounded-full bg-white/80 p-2 text-gray-700 hover:bg-white"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(file)}
                  className="rounded-full bg-white/80 p-2 text-red-600 hover:bg-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!readonly && fileList.length < limit && (
          <label
            className="hover:border-primary hover:text-primary flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors"
            style={{ width: w, height: h }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={normalizedFileType.map((t) => `.${t}`).join(",")}
              multiple={!selectForSubmit || limit > 1}
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {uploading ? (
              <Spinner className="size-8 text-gray-400" />
            ) : (
              <ImageIcon className="h-8 w-8 text-gray-400" />
            )}
          </label>
        )}
      </div>
      {showTip && !readonly && (fileType.length > 0 || fileSize > 0) && (
        <p className="mt-2 text-xs text-gray-500">
          {t("Please upload files")}
          {fileSize > 0 &&
            renderTipSegment(
              t.raw(" (max {maxMb}MB)"),
              "{maxMb}",
              String(fileSize),
            )}
          {fileType.length > 0 &&
            renderTipSegment(
              t.raw(" in {formats} format"),
              "{formats}",
              formatsJoined,
            )}
        </p>
      )}

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-hidden p-0">
          {previewUrl && (
            <img
              src={previewUrl}
              alt={t("Preview")}
              className="h-auto max-h-[85vh] w-full object-contain"
              referrerPolicy="no-referrer"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
