/**
 * ConsultDetail 组件
 * 代购咨询详情 - 弹窗形式（参考 Vue consult-dialog）
 */
"use client";
import { useLocaleStore } from "@/stores/locale-store";
import { useTranslations } from "next-intl";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import { useSyncExternalStore } from "react";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
} from "react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { type ConsultData, type ConsultContent } from "@/lib/store/parcel";
import { X, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
const PRIMARY_COLOR = "#FF5B00";
// 表情列表
const EMOJI_LIST = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "🙃",
  "😉",
  "😊",
  "😇",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😗",
  "😚",
  "😙",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "🤨",
  "😐",
  "😑",
  "😶",
  "😏",
  "😒",
  "🙄",
  "😬",
  "🤥",
  "😌",
  "😔",
  "😪",
  "🤤",
  "😴",
  "😷",
  "🤒",
  "🤕",
  "🤢",
  "🤮",
  "🤧",
  "🥵",
  "🥶",
  "😵",
  "🤯",
  "🤠",
  "🥳",
  "😎",
  "🤓",
  "🧐",
  "😕",
  "😟",
  "🙁",
  "😮",
  "😯",
  "😲",
  "😳",
  "🥺",
  "😦",
  "😧",
  "😨",
  "😰",
  "😥",
  "😢",
  "😭",
  "😱",
  "😖",
  "😣",
  "😞",
  "😓",
  "😩",
  "😫",
  "😤",
  "😡",
  "😠",
  "🤬",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "🤍",
  "🤎",
  "💯",
  "👍",
  "👎",
  "👏",
  "🙏",
  "✌️",
  "🤞",
  "🤟",
  "👋",
  "🤚",
  "🖐️",
  "✋",
  "🖖",
  "👌",
  "🤌",
];
function subscribeViewport(onChange: () => void) {
  const viewport = window.visualViewport;
  window.addEventListener("resize", onChange);
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
  };
}
function viewportInset() {
  const viewport = window.visualViewport;
  return viewport
    ? Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      )
    : 0;
}
function useVisualViewportBottomInset(enabled: boolean) {
  const inset = useSyncExternalStore(subscribeViewport, viewportInset, () => 0);
  return enabled ? inset : 0;
}
export interface ConsultDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 咨询 id（已有咨询） */
  consultId?: string | number;
  /** 从列表传入的完整咨询数据，有则直接用，不请求详情 */
  consultData?: ConsultData | null;
  /** 新咨询：订单 id */
  orderId?: string;
  /** 新咨询：订单号 */
  orderSn?: string;
  /** 发送消息成功后由外部刷新列表 */
  onMessageSent?: () => void;
  /** 咨询类型：0 代购 1 包裹 2 集运/运输，新建咨询时使用，默认 2 */
  type?: number;
  /**
   * 读取咨询详情。尚未接入咨询接口时不传，弹窗只展示 consultData。
   */
  loadConsult?: (consultId: string | number) => Promise<ConsultData>;
  /**
   * 发送咨询消息。尚未接入咨询接口时不传，发送会提示失败。
   */
  sendMessage?: (input: ConsultMessageInput) => Promise<void>;
}
/** 发送咨询消息所需的数据；content 为 HTML。 */
export interface ConsultMessageInput {
  content: string;
  order_id: ConsultData["order_id"];
  order_sn: ConsultData["order_sn"];
  type: ConsultData["type"];
}
/** 判断消息样式：my-message 或 other-message */
function filterMessageClass(
  message: ConsultContent,
): "my-message" | "other-message" {
  if (message.is_right === 1) return "my-message";
  if (message.is_right === 0) return "other-message";
  if (
    (
      message as ConsultContent & {
        user_id?: number;
      }
    ).user_id &&
    (
      message as ConsultContent & {
        user_id?: number;
      }
    ).user_id !== 0
  ) {
    return "my-message";
  }
  return "other-message";
}
/** 咨询详情弹窗 - 可嵌入 ConsultList、PackageList 等 */
export function ConsultDetailDialog({
  open,
  onOpenChange,
  consultId,
  consultData,
  orderId,
  orderSn,
  onMessageSent,
  type = 2,
  loadConsult,
  sendMessage,
}: ConsultDetailDialogProps) {
  const t = useTranslations();
  const locale = useLocaleStore((state) => state.locale);
  const isMobile = useIsMobile();
  const [currentConsult, setCurrentConsult] = useState<ConsultData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileViewportBottomInset = useVisualViewportBottomInset(
    open && isMobile,
  );
  const mobileSheetStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isMobile) return undefined;
    return {
      bottom: `${mobileViewportBottomInset}px`,
      height: `min(calc(100dvh - ${mobileViewportBottomInset}px), 85dvh)`,
      maxHeight: `calc(100dvh - ${mobileViewportBottomInset}px)`,
    };
  }, [isMobile, mobileViewportBottomInset]);
  const scrollToBottom = useCallback(() => {
    if (chatContentRef.current) {
      chatContentRef.current.scrollTo({
        top: chatContentRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest("[data-emoji-button]")
      ) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showEmojiPicker]);
  const consultKey = JSON.stringify([open, consultId, orderId, orderSn, type]);
  const [previousConsultKey, setPreviousConsultKey] = useState<string | null>(
    null,
  );
  const [previousConsultData, setPreviousConsultData] = useState(consultData);
  if (
    previousConsultKey !== consultKey ||
    previousConsultData !== consultData
  ) {
    setPreviousConsultKey(consultKey);
    setPreviousConsultData(consultData);
    setMessage("");
    setPreviewImage("");
    setPreviewVisible(false);
    setShowEmojiPicker(false);
    setLoading(open && !consultData && !!consultId && !!loadConsult);
    setCurrentConsult(
      !open
        ? null
        : (consultData ??
            (orderId && orderSn
              ? {
                  id: 0,
                  company_id: 0,
                  type,
                  problem_order_id: 0,
                  order_sn: orderSn,
                  order_id: Number(orderId),
                  content: "",
                  contents: [],
                  created_at: "",
                  updated_at: "",
                }
              : null)),
    );
  }
  useEffect(() => {
    if (!open || consultData || !consultId || !loadConsult) return;
    let current = true;
    loadConsult(consultId).then(
      (consult) => {
        if (!current) return;
        setCurrentConsult(consult);
        setLoading(false);
      },
      (error) => {
        if (!current) return;
        console.error("Error fetching consult detail:", error);
        toast.error(t("Failed to load consultation details"));
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [
    open,
    consultId,
    consultData,
    loadConsult,
    t("Failed to load consultation details"),
  ]);
  useEffect(() => {
    if (open && currentConsult?.contents && !loading) {
      setTimeout(scrollToBottom, 100);
    }
  }, [open, currentConsult?.id, loading, scrollToBottom]);
  useEffect(() => {
    if (currentConsult?.contents) {
      scrollToBottom();
    }
  }, [currentConsult?.contents, scrollToBottom]);
  const handleSend = async () => {
    if (!message.trim()) {
      toast.warning(t("Please enter content"));
      return;
    }
    if (!currentConsult) {
      toast.error(t("Consultation data does not exist"));
      return;
    }
    if (!sendMessage) {
      toast.error(t("Send failed, please try again"));
      return;
    }
    const messageContent = message.trim();
    const contentHtml = messageContent.startsWith("<")
      ? messageContent
      : `<p>${messageContent}</p>`;
    setSending(true);
    try {
      await sendMessage({
        content: contentHtml,
        order_id: currentConsult.order_id,
        order_sn: currentConsult.order_sn,
        type: currentConsult.type,
      });
      if (consultId && loadConsult) {
        setCurrentConsult(await loadConsult(consultId));
      } else if (currentConsult.order_id) {
        const newContent: ConsultContent = {
          id: Date.now(),
          nickName: t("Me"),
          content: contentHtml,
          is_right: 1,
          status: 0,
          created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
          updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        };
        setCurrentConsult({
          ...currentConsult,
          contents: [...(currentConsult.contents || []), newContent],
          updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        });
      }
      toast.success(t("Sent successfully"));
      setMessage("");
      onMessageSent?.();
    } catch (error) {
      console.error("Send message failed:", error);
      toast.error(t("Send failed, please try again"));
    } finally {
      setSending(false);
    }
  };
  const handleEmojiClick = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };
  const handleLookImage = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      setPreviewImage((target as HTMLImageElement).src);
      setPreviewVisible(true);
    }
  };
  const handleDialogClose = (next: boolean) => {
    onOpenChange(next);
  };
  const handleCloseClick = () => {
    onOpenChange(false);
  };
  const msgList = currentConsult?.contents || [];
  const chatContent = (
    <div
      ref={chatContentRef}
      className="min-h-0 flex-1 overflow-y-auto bg-[#efefef] p-5 md:h-[400px] md:flex-none"
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : msgList.length === 0 ? (
        <div className="flex h-full items-center justify-center text-gray-500">
          {t("No messages yet")}
        </div>
      ) : (
        <div className="space-y-2.5">
          {msgList.map((msg, index) => {
            const msgClass = filterMessageClass(msg);
            const showDateSeparator =
              index === 0 ||
              new Date(msg.created_at || "").getTime() -
                new Date(msgList[index - 1]?.created_at || "").getTime() >
                86400000;
            return (
              <div
                key={msg.id}
                className={cn(
                  "chat-message flex flex-col",
                  msgClass === "my-message" ? "items-end" : "items-start",
                )}
              >
                {showDateSeparator && (
                  <div className="w-full py-1 text-center text-sm text-gray-500">
                    {new Date(msg.created_at || "").toLocaleDateString(
                      LOCALE_HTML_LANG[locale],
                    )}
                  </div>
                )}
                <div className="name mb-1 text-xs text-gray-500">
                  {msg.nickName}
                </div>
                <div
                  className={cn(
                    "message-content editor-content-view max-w-[70%] cursor-default rounded px-3 py-2 text-sm [&_blockquote]:my-2 [&_blockquote]:border-s-8 [&_blockquote]:border-[#3399cc] [&_blockquote]:bg-[#3399cc1a] [&_blockquote]:py-2.5 [&_blockquote]:ps-2.5 [&_code]:rounded [&_code]:bg-[#3399cc] [&_code]:px-1 [&_code]:font-mono [&_img]:cursor-pointer [&_li]:whitespace-pre-wrap [&_ol]:ps-5 [&_p]:whitespace-pre-wrap [&_pre_code]:block [&_pre_code]:p-2.5 [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-[#3399cc80] [&_ul]:ps-5",
                    msgClass === "my-message"
                      ? "text-white [&_blockquote]:border-white [&_code]:bg-white [&_code]:text-[#3399cc]"
                      : "bg-white text-gray-900",
                  )}
                  style={
                    msgClass === "my-message"
                      ? { backgroundColor: PRIMARY_COLOR }
                      : undefined
                  }
                  onClick={handleLookImage}
                  dangerouslySetInnerHTML={{ __html: msg.content || "" }}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(msg.created_at || "").toLocaleTimeString(
                    LOCALE_HTML_LANG[locale],
                  )}
                </p>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
  const consultChatBody = (
    <div className="consult-chat flex h-full min-h-0 flex-col">
      {/* Header: primary bg, order_sn, close icon */}
      <div
        className="chat-header relative flex shrink-0 items-center justify-center rounded-t-[10px]"
        style={{ backgroundColor: PRIMARY_COLOR, height: 46 }}
      >
        <h4 className="font-medium text-white">
          {currentConsult?.order_sn ?? "—"}
        </h4>
        <button
          type="button"
          onClick={handleCloseClick}
          className="absolute end-5 top-0 bottom-0 my-auto p-1 text-white transition-opacity hover:opacity-80"
          aria-label={t("Close")}
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      {/* Chat content */}
      {chatContent}

      {/* Input area */}
      <div className="chat-input shrink-0 bg-white p-4">
        <div className="mb-2 flex gap-2">
          <div className="relative">
            <button
              type="button"
              data-emoji-button
              className="rounded p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              title={t("Emoji")}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile className="h-5 w-5" />
            </button>
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className={cn(
                  "absolute start-0 bottom-full z-50 mb-2 rounded-lg bg-white p-4 shadow-lg",
                  "h-[300px] w-[300px] overflow-y-auto sm:w-[400px]",
                  "grid grid-cols-10 gap-1",
                )}
              >
                {EMOJI_LIST.map((emoji, i) => (
                  <button
                    key={i}
                    type="button"
                    className="rounded p-2 text-lg transition-colors hover:bg-gray-100"
                    onClick={() => handleEmojiClick(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <Textarea
          ref={textareaRef}
          placeholder={t("Enter message")}
          className="min-h-[100px] resize-none"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
      </div>

      {/* Footer: Cancel + Send */}
      <div className="flex shrink-0 justify-end gap-2 border-t bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          className="min-w-20"
          onClick={handleCloseClick}
        >
          {t("Cancel")}
        </Button>
        <Button
          className="min-w-20 text-white"
          style={{ backgroundColor: PRIMARY_COLOR }}
          onClick={handleSend}
          disabled={sending || !message.trim()}
        >
          {sending ? (
            <>
              <Spinner className="me-1 h-4 w-4" />
              {t("Sending")}
            </>
          ) : (
            t("Send")
          )}
        </Button>
      </div>
    </div>
  );
  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={handleDialogClose}>
          <SheetContent
            side="bottom"
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="z-[70] max-w-full rounded-t-xl border-0 p-0! [&>button]:hidden"
            style={mobileSheetStyle}
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-t-xl">
              {consultChatBody}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleDialogClose}>
          <DialogContent
            className="flex max-h-[90vh] max-w-[800px] flex-col gap-0 overflow-hidden border-0 p-0! [&>button]:hidden"
            showCloseButton={false}
          >
            <div className="overflow-hidden">{consultChatBody}</div>
          </DialogContent>
        </Dialog>
      )}

      {/* Image preview dialog */}
      <Dialog open={previewVisible} onOpenChange={setPreviewVisible}>
        <DialogContent className="max-w-[30%] p-0">
          {previewImage && (
            <img
              src={previewImage}
              alt={t("Preview")}
              className="h-auto w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
