/**
 * 图片预览 Lightbox 公共组件
 * 基于 react-photo-view PhotoSlider，支持缩放、左右切换
 * 使用受控模式（visible/onClose），避免 PhotoProvider+PhotoView 因 display:none 触发器导致的二次打开失效
 */
"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { PhotoSlider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
export interface ImagePreviewLightboxSlide {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}
export interface ImagePreviewLightboxProps {
  open: boolean;
  onClose: () => void;
  slides: ImagePreviewLightboxSlide[];
  index?: number;
  closeOnBackdropClick?: boolean;
}
export function ImagePreviewLightbox({
  open,
  onClose,
  slides,
  index = 0,
  closeOnBackdropClick = true,
}: ImagePreviewLightboxProps) {
  const t = useTranslations();
  const [selection, setSelection] = useState({ open, index, current: index });
  if (selection.open !== open || selection.index !== index)
    setSelection({ open, index, current: index });
  const images = useMemo(() => {
    return slides
      .filter(
        (s) => s.src && typeof s.src === "string" && s.src.trim().length > 0,
      )
      .map((s, i) => ({
        src: s.src.trim(),
        key: `${s.src}-${i}`,
      }));
  }, [slides]);
  if (images.length === 0) return null;
  // 每次从关闭到打开时用 key 强制重新挂载，避免 PhotoSlider 内部缓存了 img 的 error 状态导致第二次打开显示 "Failed to load image"
  const openKey = open ? "open" : "closed";
  return (
    <PhotoSlider
      key={openKey}
      images={images}
      visible={open}
      onClose={onClose}
      index={Math.min(Math.max(0, selection.current), images.length - 1)}
      onIndexChange={(current) => setSelection({ open, index, current })}
      maskClosable={closeOnBackdropClick}
      brokenElement={
        <span className="text-sm text-white">{t("Failed to load image")}</span>
      }
    />
  );
}
