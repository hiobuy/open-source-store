"use client";
import { useTranslations as useUiTranslations } from "next-intl";
import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { X, ChevronDown } from "lucide-react";
// 定义组件属性类型
interface CustomSelectProps {
  // 选中的值
  value: string;
  // 值变更回调
  onChange: (value: string) => void;
  // 选项列表 { label: 显示文本, value: 对应值 }
  options: Array<{
    label: string;
    value: string;
  }>;
  // 占位符文本
  placeholder?: string;
  // 是否禁用
  disabled?: boolean;
  // 是否显示清除按钮（默认显示）
  showClear?: boolean;
  // 自定义类名
  className?: string;
  // 选择器宽度（默认 176px，和之前月份选择器统一）
  width?: string | number;
}
export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Please select",
  disabled = false,
  showClear = true,
  className = "",
  width = 176, // 统一默认宽度为176px，和月份选择器一致
}) => {
  const translateUi = useUiTranslations();

  // 控制下拉面板展开/关闭（和Popover联动）
  const [isOpen, setIsOpen] = useState(false);
  // 处理选项点击
  const handleOptionClick = (optionValue: string) => {
    if (disabled) return;
    onChange(optionValue);
    setIsOpen(false);
  };
  // 清除选中值
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡
    if (disabled) return;
    onChange(""); // 清空值
    setIsOpen(false);
  };
  // 切换下拉面板（禁用时不执行）
  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
  };
  // 获取当前选中的标签文本
  const getSelectedLabel = () => {
    const selectedOption = options.find((option) => option.value === value);
    return selectedOption ? selectedOption.label : "";
  };
  // 样式处理：统一尺寸和间距
  const selectWidthStyle = {
    width: typeof width === "number" ? `${width}px` : width,
    height: "36px", // 统一高度36px
    padding: "8px 12px", // 统一内间距：上下8px，左右12px
    fontSize: "14px", // 统一文字大小14px
  };
  return (
    // 核心修复：移除 Popover 上的 disabled 属性
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          className={`relative ${className} cursor-pointer rounded-md border border-gray-300 ${disabled ? "cursor-not-allowed bg-gray-100 text-gray-500" : "bg-white hover:border-gray-500"} ${isOpen && !disabled ? "border-gray-500" : ""} flex items-center justify-between overflow-hidden`}
          style={selectWidthStyle}
          onClick={toggleDropdown}
          aria-disabled={disabled}
        >
          {/* 选中值/占位符 */}
          <span
            className={`truncate ${!value ? "text-gray-500" : "text-gray-900"}`}
          >
            {value ? getSelectedLabel() : placeholder}
          </span>

          {/* 右侧操作区：清除按钮 + 下拉箭头 */}
          <div className="flex h-full items-center gap-2">
            {" "}
            {/* 关键：添加 h-full 强制占满父容器高度 */}
            {/* 清除按钮 */}
            {showClear && value && !disabled && (
              <button
                onClick={handleClear}
                className="flex h-full items-center justify-center text-gray-400 transition-colors hover:text-red-500"
                aria-label={translateUi.raw("Clear selection")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {/* 下拉箭头 */}
            <ChevronDown
              className={`h-3 w-3 flex-shrink-0 text-gray-500 transition-transform ${isOpen && !disabled ? "rotate-180" : ""} ${disabled ? "opacity-50" : ""} `}
            />
          </div>
        </div>
      </PopoverTrigger>

      {/* 下拉选项列表（基于PopoverContent，精准对齐） */}
      {!disabled && ( // 禁用时不渲染下拉面板
        <PopoverContent
          className="z-999 max-h-60 overflow-y-auto rounded-md border border-gray-200 p-0 shadow-md"
          side="bottom" // 显示在下方
          align="start" // 左对齐
          sideOffset={2} // 间距2px
          style={{
            margin: 0,
            width: selectWidthStyle.width, // 和触发框同宽
            fontSize: "14px", // 选项文字大小14px
          }}
        >
          {options.map((option) => (
            <div
              key={option.value}
              className={`cursor-pointer px-3 py-2 transition-colors hover:bg-gray-100 ${value === option.value ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700"} `}
              onClick={() => handleOptionClick(option.value)}
            >
              {option.label}
            </div>
          ))}
        </PopoverContent>
      )}
    </Popover>
  );
};
