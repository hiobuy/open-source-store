"use client";
import { useTranslations as useUiTranslations } from "next-intl";
import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarDays, X, ChevronDown } from "lucide-react";
interface MonthPickerProps {
  value: {
    begin_date: string | undefined;
    end_date: string | undefined;
  };
  onChange: (value: {
    begin_date: string | undefined;
    end_date: string | undefined;
  }) => void;
}
export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onChange,
}) => {
  const translateUi = useUiTranslations();

  const [tempYear, setTempYear] = useState<number>(new Date().getFullYear());
  const [tempMonth, setTempMonth] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const years = Array.from(
    { length: 10 },
    (_, i) => new Date().getFullYear() - 5 + i,
  );
  const months = [
    { value: 1, label: "Jan" },
    { value: 2, label: "Feb" },
    { value: 3, label: "Mar" },
    { value: 4, label: "Apr" },
    { value: 5, label: "May" },
    { value: 6, label: "Jun" },
    { value: 7, label: "Jul" },
    { value: 8, label: "Aug" },
    { value: 9, label: "Sep" },
    { value: 10, label: "Oct" },
    { value: 11, label: "Nov" },
    { value: 12, label: "Dec" },
  ];
  const [previousBeginDate, setPreviousBeginDate] = useState<
    string | undefined
  >(undefined);
  if (previousBeginDate !== value.begin_date) {
    setPreviousBeginDate(value.begin_date);
    const date = new Date(value.begin_date || "");
    const valid = !Number.isNaN(date.getTime());
    setTempYear(valid ? date.getFullYear() : new Date().getFullYear());
    setTempMonth(valid ? date.getMonth() + 1 : null);
  }
  const calculateDateRange = (year: number, month: number) => {
    const beginDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    return {
      begin_date: formatDate(beginDate),
      end_date: formatDate(endDate),
    };
  };
  const handleMonthClick = (month: number) => {
    setTempMonth(month);
    onChange(calculateDateRange(tempYear, month));
    setIsOpen(false);
  };
  const handleYearChange = (year: number) => {
    setTempYear(year);
    setTempMonth(null);
  };
  // 修复：恢复原始的清空逻辑，传递空字符串而不是 undefined
  const handleClear = () => {
    onChange({ begin_date: "", end_date: "" });
    setTempYear(new Date().getFullYear());
    setTempMonth(null);
  };
  const formatDisplayValue = () => {
    if (!value.begin_date) return "Select month";
    const date = new Date(value.begin_date);
    if (isNaN(date.getTime())) return "Select month";
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  };
  return (
    <div className="flex items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            {/* 样式修改：固定尺寸、内边距、字体大小 */}
            <Button
              variant="ghost"
              // 核心新增：isOpen 时添加 border-gray-500 高亮边框
              className={`flex h-[36px] w-[176px] cursor-pointer items-center justify-between rounded-md border border-gray-300 bg-white text-start text-gray-700 hover:border-gray-500 hover:bg-gray-50 ${isOpen ? "border-gray-500" : ""}`}
              style={{
                padding: "8px 12px", // 上下8px，左右12px
                fontSize: "14px", // 文字14px
              }}
            >
              {/* 左侧图标 + 文字区域 */}
              <div className="flex items-center gap-2 overflow-hidden">
                <CalendarDays className="h-4 w-4 flex-shrink-0 text-gray-500" />
                <span
                  className={
                    !value.begin_date ? "text-gray-500" : "text-gray-900"
                  }
                >
                  {formatDisplayValue()}
                </span>
              </div>

              {/* 右侧箭头/清除图标：添加旋转动画 */}
              <div className="ms-2 flex items-center justify-center">
                {value.begin_date ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClear();
                      setIsOpen(false);
                    }}
                    className="flex items-center justify-center text-gray-400 transition-colors hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </div>
                ) : (
                  // 核心新增：isOpen 时 rotate-180 旋转箭头，添加 transition-transform 动画
                  <ChevronDown
                    className={`h-3 w-3 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                )}
              </div>
            </Button>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 rounded-md border border-gray-200 p-0 shadow-md"
          // shadcn/ui PopoverContent 的定位属性
          side="bottom" // 显示在触发元素下方
          align="start" // 水平左对齐（关键！实现面板和输入框左侧对齐）
          sideOffset={4} // 距离触发元素底部 2px 间距（可调整）
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleYearChange(tempYear - 1)}
              className="h-8 w-8 p-0"
            >
              &lt;
            </Button>
            <span className="font-medium">{tempYear}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleYearChange(tempYear + 1)}
              className="h-8 w-8 p-0"
            >
              &gt;
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-1 p-4">
            {months.map((month) => (
              <button
                key={month.value}
                onClick={() => handleMonthClick(month.value)}
                className={`cursor-pointer rounded-md px-1 py-2 text-sm transition-colors ${tempMonth === month.value ? "bg-primary text-white" : "bg-white text-gray-700 hover:bg-gray-100"} `}
              >
                {month.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end border-t border-gray-200 px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleClear();
                setIsOpen(false);
              }}
              className={`${value.begin_date ? "text-red-500" : "cursor-not-allowed text-gray-400"}`}
              disabled={!value.begin_date}
            >
              <X className="me-1 h-4 w-4" />
              {translateUi.raw("Clear")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
