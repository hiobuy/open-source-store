"use client";
import { default as Step1Icon } from "@/assets/images/order-process/step-1.svg";
import { default as Step2Icon } from "@/assets/images/order-process/step-2.svg";
import { default as Step3Icon } from "@/assets/images/order-process/step-3.svg";
import { default as Step4Icon } from "@/assets/images/order-process/step-4.svg";
import { default as Step5Icon } from "@/assets/images/order-process/step-5.svg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import type { CSSProperties, FC, SVGProps } from "react";
import { useTranslations } from "next-intl";
import { useState } from "react";
export interface DaigouOrderStepItem {
  label: string;
}
const STEP_LABELS = [
  "Select Items",
  "Confirm Order",
  "Pay Order Fee",
  "Storage & Submit Parce",
  "Wait for Delivery",
] as const;
function StepArrow({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-0 w-0 border-y-10 border-s-16 border-y-transparent",
        active ? "border-s-primary/30" : "border-s-[#E2E3E5]",
      )}
      aria-hidden
    />
  );
}
const STEP_ICONS: FC<SVGProps<SVGSVGElement>>[] = [
  Step1Icon,
  Step2Icon,
  Step3Icon,
  Step4Icon,
  Step5Icon,
];
type StepIconStyle = CSSProperties & {
  "--order-step-icon-bg": string;
};
function StepIcon({ active, step }: { active: boolean; step: number }) {
  const Icon = STEP_ICONS[step - 1] || Step1Icon;
  return (
    <Icon
      className={cn(
        "h-12 w-12 shrink-0",
        active ? "text-primary" : "text-[#A2A2A2]",
      )}
      style={
        {
          "--order-step-icon-bg": active
            ? "color-mix(in srgb, var(--primary) 16%, white)"
            : "#DFDFDF",
        } as StepIconStyle
      }
      aria-hidden
      focusable="false"
    />
  );
}
export function DaigouOrderSteps({ activeStep = 3 }: { activeStep?: number }) {
  const t = useTranslations();
  const [modalOpen, setModalOpen] = useState(false);
  const safeSteps: DaigouOrderStepItem[] = STEP_LABELS.map((label) => ({
    label: t(label),
  }));
  const safeActive = Math.max(
    0,
    Math.min(activeStep - 1, safeSteps.length - 1),
  );
  const currentLabel = safeSteps[safeActive]?.label || `Step ${safeActive + 1}`;
  const renderMobileStepItem = (step: DaigouOrderStepItem, index: number) => {
    const isCurrent = index === safeActive;
    const isPast = index < safeActive;
    const isDone = index <= safeActive;
    const hasConnector = index < safeSteps.length - 1;
    return (
      <div key={`${step.label}-${index}`} className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center">
          <StepIcon active={isDone} step={index + 1} />
          {hasConnector ? (
            <div
              className={cn(
                "-mb-1 min-h-6 w-0.5",
                isPast
                  ? "border-s-2 border-gray-600"
                  : "border-s border-dashed border-gray-300",
              )}
              style={{ height: 28 }}
            />
          ) : null}
        </div>
        <span
          className={cn(
            "pt-3 pb-2 text-sm",
            isCurrent
              ? "text-primary font-semibold"
              : isPast
                ? "text-[#333333]"
                : "text-[#666666]",
          )}
        >
          {step.label || `Step ${index + 1}`}
        </span>
      </div>
    );
  };
  return (
    <div className="w-full rounded-lg bg-[#FAFAFA] px-4 py-3 md:overflow-x-auto md:rounded-xl md:px-8 md:py-5">
      <div
        className="hidden min-w-[820px] items-start md:grid"
        style={{
          gridTemplateColumns: `repeat(${safeSteps.length * 2 - 1}, minmax(0, 1fr))`,
        }}
      >
        {safeSteps.map((step, index) => {
          const active = index <= safeActive;
          const connectorActive = index < safeActive;
          return (
            <div key={`${step.label}-${index}`} className="contents">
              <div className="flex min-w-0 flex-col items-center text-center">
                <div
                  className={cn(
                    "mb-1 text-2xl leading-none font-bold",
                    active ? "text-primary" : "text-[#A4A4A4]",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
                <StepIcon active={active} step={index + 1} />
                <div
                  className={cn(
                    "mt-2 max-w-[120px] text-xs leading-tight font-bold",
                    active ? "text-primary" : "text-[#666666]",
                  )}
                >
                  {step.label}
                </div>
              </div>
              {index < safeSteps.length - 1 ? (
                <div className="flex justify-center pt-[28px]">
                  <div className="flex h-12 items-center justify-center">
                    <StepArrow active={connectorActive} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <div
          className="text-primary flex cursor-pointer items-center justify-end gap-2 text-xs md:hidden"
          onClick={() => setModalOpen(true)}
        >
          <span className="font-semibold">
            {t("Process :")} <span className="font-bold">{currentLabel}</span>
          </span>
          <div className="bg-primary flex h-6 w-6 items-center justify-center rounded-full text-white">
            <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
        </div>
        <DialogContent className="max-w-[min(90vw,340px)] gap-0 overflow-hidden rounded-2xl p-0 [&>button]:hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-center text-base font-bold">
              {t("Order Process")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-0 px-6 py-4">
            {safeSteps.map((step, index) => renderMobileStepItem(step, index))}
          </div>
          <div className="p-4 pt-2">
            <Button
              className="bg-primary hover:bg-primary/90 h-11 w-full rounded-full font-semibold text-white"
              onClick={() => setModalOpen(false)}
            >
              {t("I Got It")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
