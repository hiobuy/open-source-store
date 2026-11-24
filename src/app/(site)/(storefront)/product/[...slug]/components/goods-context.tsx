/**
 * 代购商品数据共享 Context
 * 用于在 GoodsDetailContainer 和子组件之间共享商品数据
 */
"use client";
import { createContext, useContext, ReactNode } from "react";
import type { GoodsInfo } from "@/lib/client/services/goods-types";
export interface GoodsContextValue {
  goodsInfo: GoodsInfo | null;
  loading: boolean;
  error: Error | null;
}
const GoodsContext = createContext<GoodsContextValue | null>(null);
export function GoodsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: GoodsContextValue;
}) {
  return (
    <GoodsContext.Provider value={value}>{children}</GoodsContext.Provider>
  );
}
export function useGoods() {
  const context = useContext(GoodsContext);
  if (!context) {
    return {
      goodsInfo: null,
      loading: false,
      error: null,
    };
  }
  return context;
}
