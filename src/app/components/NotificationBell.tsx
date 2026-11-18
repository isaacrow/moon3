/**
 * Bell in the top bar: the signed-in user's notifications (welcome, records waiting for review,
 * approvals and returns with the reason), with an unread count. Checks every minute while the page
 * is visible; opening the list marks it read.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { moonFetch, getSessionToken } from "../utils/moonApi";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { UserAvatar } from './UserAvatar';

interface Notice {
  id: number;
  kind: "welcome" | "signup" | "review" | "approved" | "returned" | "comment" | "assigned" | "suggestion" | "suggestion_accepted" | "suggestion_declined";
  recordId?: string;
  recordTitle?: string;
  actor?: string;
  reason?: string;
  createdAt: string;
  read: boolean;
}

function message(n: Notice, ar: boolean): { title: string; body?: string } {
  const t = n.recordTitle ? `"${n.recordTitle}"` : ar ? "تسجيلة" : "a record";
  switch (n.kind) {
    case "welcome":
      return ar
        ? { title: "مرحبًا بك في محرر MOON", body: "محرر ببفريم (BIBFRAME) للمكتبات العربية. ابدأ تسجيلة جديدة من «تسجيلة جديدة»، وستصلك هنا إشعارات اعتماد تسجيلاتك أو إعادتها." }
        : { title: "Welcome to Moon Editor", body: "A BIBFRAME editor for Arabic libraries. Start a record with New Record; you'll be told here when your records are approved or returned." };
    case "signup":
      return ar
        ? { title: `حساب جديد: ${n.actor || n.recordTitle || ""}`, body: n.reason ? `${n.reason} · فُعّل تلقائيًا، ويمكنك رفضه من قائمة الحسابات` : undefined }
        : { title: `New account: ${n.actor || n.recordTitle || ""}`, body: n.reason ? `${n.reason} · approved automatically; you can decline it in Accounts` : undefined };
    case "review":
      return ar ? { title: `${n.actor || "مفهرس"} أرسل ${t} للمراجعة` } : { title: `${n.actor || "A cataloger"} sent ${t} for review` };
    case "approved":
      return ar ? { title: `اعتُمدت ${t}`, body: n.actor ? `بواسطة ${n.actor}` : undefined } : { title: `${t} was approved`, body: n.actor ? `by ${n.actor}` : undefined };
    case "assigned":
      return ar ? { title: `أُسندت إليك مراجعة ${t}`, body: n.actor ? `بواسطة ${n.actor}` : undefined } : { title: `You were asked to review ${t}`, body: n.actor ? `by ${n.actor}` : undefined };
    case "comment":
      return ar
        ? { title: `علّق ${n.actor || "مراجع"} على ${t}`, body: n.reason }
        : { title: `${n.actor || "A reviewer"} commented on ${t}`, body: n.reason };
    case "suggestion":
      return ar ? { title: `اقترح ${n.actor || "مستخدم"} تعديلاً على ${t}`, body: n.reason } : { title: `${n.actor || "Someone"} suggested a change to ${t}`, body: n.reason };
    case "suggestion_accepted":
      return ar ? { title: `قُبل اقتراحك على ${t}`, body: n.reason } : { title: `Your suggestion on ${t} was accepted`, body: n.reason };
    case "suggestion_declined":
      return ar ? { title: `رُفض اقتراحك على ${t}`, body: n.reason } : { title: `Your suggestion on ${t} was declined`, body: n.reason };
    case "returned":
      return ar
        ? { title: `أُعيدت ${t} للتعديل`, body: n.reason ? `السبب: ${n.reason}` : undefined }
        : { title: `${t} was returned for changes`, body: n.reason ? `Reason: ${n.reason}` : undefined };
  }
}

function ago(iso: string, ar: boolean): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return ar ? "الآن" : "just now";
  if (m < 60) return ar ? `منذ ${m} دقيقة` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return ar ? `منذ ${h} ساعة` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(ar ? "ar-IQ" : "en-GB", { day: "numeric", month: "short" });
}

export function NotificationBell({ isDark, onOpenRecord }: { isDark: boolean; onOpenRecord?: (recordId: string) => void }) {
  const { i18n } = useTranslation();
  const ar = i18n.language === "ar";
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!getSessionToken() || document.visibilityState !== "visible") return;
    const { ok, data } = await moonFetch<{ unread: number; items: Notice[] }>("/notifications").catch(() => ({ ok: false, data: null as any }));
    if (ok && data) {
      setItems(data.items || []);
      setUnread(data.unread || 0);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const onOpenChange = (open: boolean) => {
    if (!open || unread === 0) return;
    setUnread(0);
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    moonFetch("/notifications/read", { body: {} }).catch(() => {});
  };

  const text = isDark ? "#ffffff" : "#111827";
  const muted = isDark ? "rgba(255,255,255,0.6)" : "rgba(17,24,39,0.6)";

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ar ? "الإشعارات" : "Notifications"}
          className="relative rounded-xl p-2 transition-all cursor-pointer"
          style={{
            background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.08)",
            color: text,
          }}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-0">
        <div dir={ar ? "rtl" : "ltr"}>
        <div className="px-4 py-3 text-sm font-bold border-b" style={{ color: text }}>{ar ? "الإشعارات" : "Notifications"}</div>
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center" style={{ color: muted }}>{ar ? "لا توجد إشعارات" : "No notifications"}</div>
        ) : (
          items.map((n) => {
            const m = message(n, ar);
            const clickable = !!(n.recordId && onOpenRecord);
            return (
              <button
                key={n.id}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onOpenRecord!(n.recordId!)}
                className="w-full text-start px-4 py-3 border-b last:border-b-0 flex gap-2 enabled:cursor-pointer enabled:hover:bg-black/5"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read ? "transparent" : "#3b82f6" }} />
                {n.actor && <UserAvatar username={n.actor} size={28} className="mt-0.5" />}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold break-words" style={{ color: text }}>{m.title}</span>
                  {m.body && <span className="block text-xs mt-0.5 break-words" style={{ color: muted }}>{m.body}</span>}
                  <span className="block text-[11px] mt-1" style={{ color: muted }}>{ago(n.createdAt, ar)}</span>
                </span>
              </button>
            );
          })
        )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationBell;
