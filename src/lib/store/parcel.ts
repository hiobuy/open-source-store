/**
 * 包裹相关全局状态（提交的包裹列表）
 * 用于在多个组件间共享已提交的包裹信息
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProcurementParcel } from "@/lib/procurement/logistics-types";

interface ParcelState {
  /** 已提交的包裹列表 */
  submittedParcels: ProcurementParcel[];
  /** 保存提交的包裹列表 */
  setSubmittedParcels: (parcels: ProcurementParcel[]) => void;
  /** 清空已提交的包裹列表 */
  clearSubmittedParcels: () => void;
}

export const useParcelStore = create<ParcelState>()(
  persist(
    (set) => ({
      submittedParcels: [],
      setSubmittedParcels: (parcels) =>
        set({
          submittedParcels: parcels,
        }),
      clearSubmittedParcels: () =>
        set({
          submittedParcels: [],
        }),
    }),
    {
      name: "submitted-parcels",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ submittedParcels: state.submittedParcels }),
    },
  ),
);

/** 便捷方法：在非 React 上下文中设置已提交的包裹列表 */
export function setSubmittedParcels(parcels: ProcurementParcel[]): void {
  useParcelStore.getState().setSubmittedParcels(parcels);
}

// 咨询数据类型
export interface ConsultContent {
  id: number;
  nickName: string;
  content: string;
  is_right: number;
  status: number;
  created_at: string;
  updated_at: string;
}
export interface ConsultData {
  id: number;
  company_id: number;
  type: number;
  problem_order_id: number;
  order_sn: string;
  order_id: number;
  content: string;
  contents: ConsultContent[];
  created_at: string;
  updated_at: string;
}
