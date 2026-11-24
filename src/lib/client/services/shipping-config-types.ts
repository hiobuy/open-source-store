export interface InsuranceData {
  id: number;
  insurance_proportion: number;
  enabled: number;
  insurance_type: number; // 1: 按比例, 2: 固定金额
  start: number;
  remark: string;
  is_force: number; // 1: 强制, 0: 可选
  max: number;
  min: number;
}

export interface InsuranceInfo {
  enabled: number;
  data: InsuranceData[];
  explanation: string;
  enabled_line_ids: number[];
}

export interface TariffData {
  id: number;
  enabled: number;
  threshold: number; // 阈值（分）
  type: number; // 1: 按比例, 2: 固定金额
  amount: number; // 比例或固定金额
  enforce: number; // 1: 强制, 0: 可选
  remark: string;
  min?: number; // 最小金额（分，可选）
  max?: number; // 最大金额（分，可选）
}

export interface TariffInfo {
  enabled: number;
  data: TariffData[];
  explanation: string;
  enabled_line_ids: number[];
}
