"use client";
// 商品搜索: 商品名称/链接，商品图片
// 商品搜索: 商品名称/链接，商品图片
import { useRef, useState } from "react";
import {
  getExternalGoodsProductPathPlatform,
  isExternalGoods,
  parseGoodsExternalUrl,
  parserExternalGoodsLink,
} from "@/lib/utils";
import { purchaseProductHref } from "@/lib/procurement/purchase";
import { toast } from "sonner";
import { uploadProcurementImage } from "@/lib/procurement/client";
import { MAX_CLIENT_IMAGE_BYTES } from "@/lib/procurement/types";
import Analytics from "../analytics";
import { useRouterWithProgress } from "./use-router-with-progress";
export const SEARCH_HISTORY_KEY = "haiou_search_history";
export interface UseProductSearchOptions {
  uploadFailed?: string;
}
// 保存搜索历史记录
const saveSearchHistory = (keyword: string) => {
  if (typeof window === "undefined") return;
  const trimmed = keyword.trim();
  if (!trimmed) return;
  try {
    const current = JSON.parse(
      localStorage.getItem(SEARCH_HISTORY_KEY) || "[]",
    );
    const list = Array.isArray(current) ? current : [];
    const next = [
      trimmed,
      ...list.filter((item: string) => item !== trimmed),
    ].slice(0, 10);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify([trimmed]));
  }
};
export const useProductSearch = (
  initialKeyword?: string,
  options?: UseProductSearchOptions,
) => {
  const router = useRouterWithProgress();
  const [searchKeyword, setSearchKeyword] = useState(initialKeyword || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  // 文字搜索
  const handleSearch = (
    keyword: string,
    directSearch: boolean = true,
  ): string | undefined => {
    const nextKeyword = keyword.trim();
    if (!nextKeyword) return;
    Analytics.trackProductSearch(nextKeyword);
    saveSearchHistory(nextKeyword);
    if (isExternalGoods(nextKeyword)) {
      const link = parserExternalGoodsLink(nextKeyword);
      if (!link) return;
      // 能直接取到 id 的走商品详情；短链等交给后端解析，详情页加载后再改成规范地址
      const parsed = parseGoodsExternalUrl(link);
      router.push(
        parsed?.num_iid
          ? purchaseProductHref(parsed.api_type, parsed.num_iid)
          : `/product/${getExternalGoodsProductPathPlatform(link)}/${encodeURIComponent(link)}`,
      );
      return;
    }
    if (directSearch) {
      router.push(`/search?keyword=${encodeURIComponent(nextKeyword)}`);
    }
    return nextKeyword;
  };
  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };
  // 图片搜索
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    directSearch: boolean = true,
  ): Promise<string | undefined> => {
    const file = event.target.files?.[0];
    if (!file) return;
    const imageFile =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      /\.(?:png|jpe?g)$/i.test(file.name);
    if (!imageFile || file.size > MAX_CLIENT_IMAGE_BYTES) {
      toast.error(options?.uploadFailed || "Upload failed, please try again");
      event.target.value = "";
      return;
    }
    try {
      setImageUploading(true);
      const uploaded = await uploadProcurementImage(file, true);
      if (directSearch) {
        router.push(`/search?img=${encodeURIComponent(uploaded.id)}`);
      }
      return uploaded.id;
    } catch (error) {
      toast.error(options?.uploadFailed || "Upload failed, please try again");
    } finally {
      setImageUploading(false);
      event.target.value = "";
    }
  };
  return {
    handleFileChange,
    handleImageUpload,
    handleSearch,
    searchKeyword,
    setSearchKeyword,
    imageUploading,
    fileInputRef,
  };
};
