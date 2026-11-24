"use client";
"use client";
import {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
  ReactNode,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
interface FlyToTargetProps {
  to?: React.RefObject<HTMLElement>;
  icon?: ReactNode;
}
export interface FlyToTargetRef {
  flyFromEvent: (event: React.MouseEvent | MouseEvent) => void;
}
interface Ball {
  id: number;
  icon: ReactNode;
  style: React.CSSProperties;
}
const FlyToTarget = forwardRef<FlyToTargetRef, FlyToTargetProps>(
  ({ to, icon = "📄" }, ref) => {
    const [balls, setBalls] = useState<Ball[]>([]);
    const ballIdCounter = useRef(0);
    // 注入全局样式
    useEffect(() => {
      const styleId = "fly-to-target-styles";
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .fly-highlight {
          animation: fly-highlight 0.4s ease-in-out;
        }

        @keyframes fly-highlight {
          0% {
            transform: scale(1);
            background-color: #facc15;
          }
          50% {
            transform: scale(1.3);
            background-color: #fbbf24;
          }
          100% {
            transform: scale(1);
            background-color: #facc15;
          }
        }
      `;
      document.head.appendChild(style);
      return () => {
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
          existingStyle.remove();
        }
      };
    }, []);
    const flyFromEvent = (event: React.MouseEvent | MouseEvent) => {
      const target = event.target as HTMLElement;
      const fromRect = target.getBoundingClientRect();
      const toRect = to?.current?.getBoundingClientRect();
      if (!toRect) return;
      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      const ballId = ballIdCounter.current++;
      const ball: Ball = {
        id: ballId,
        icon,
        style: {
          left: `${startX}px`,
          top: `${startY}px`,
          transition: "all 0.8s cubic-bezier(0.49, -0.29, 0.75, 0.41)",
          position: "fixed",
          zIndex: 50,
          pointerEvents: "none",
        },
      };
      setBalls((prev) => [...prev, ball]);
      // 下一帧飞行
      requestAnimationFrame(() => {
        setBalls((prev) =>
          prev.map((b) =>
            b.id === ballId
              ? {
                  ...b,
                  style: {
                    ...b.style,
                    left: `${endX}px`,
                    top: `${endY}px`,
                  },
                }
              : b,
          ),
        );
      });
      // 动画结束后移除
      setTimeout(() => {
        setBalls((prev) => prev.filter((b) => b.id !== ballId));
        // 添加高亮
        if (to?.current) {
          to.current.classList.add("fly-highlight");
          setTimeout(() => {
            to.current?.classList.remove("fly-highlight");
          }, 500);
        }
      }, 850);
    };
    useImperativeHandle(ref, () => ({
      flyFromEvent,
    }));
    if (typeof window === "undefined") {
      return null;
    }
    return createPortal(
      <>
        {balls.map((ball) => (
          <div
            key={ball.id}
            style={ball.style}
            className="border-border pointer-events-none rounded-full border bg-white p-2 text-2xl"
          >
            {ball.icon}
          </div>
        ))}
      </>,
      document.body,
    );
  },
);
FlyToTarget.displayName = "FlyToTarget";
export default FlyToTarget;
