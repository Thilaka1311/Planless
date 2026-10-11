import React from "react";
import { NotificationItem } from "../../core/types";
import { NotificationMeta } from "../../../lib/mappers";
import { useDismissibleOverlay } from "../../features/navigation/appRouter";

interface CompletedMemoryItem {
  memory: any;
  plan: any;
  title: string;
  subtitle: string;
  isPending: boolean;
}

interface NotificationsTrayModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredNotifications: NotificationItem[];
  handleAcceptInviteFromNotif: (notif: NotificationItem) => void;
  handleOpenNotification: (notif: NotificationItem) => void;
  completedMemories: CompletedMemoryItem[];
  onSelectMemoryPlan: (plan: any) => void;
}

export default function NotificationsTrayModal({
  isOpen,
  onClose,
  filteredNotifications,
  handleAcceptInviteFromNotif,
  handleOpenNotification,
  completedMemories,
  onSelectMemoryPlan
}: NotificationsTrayModalProps) {
  useDismissibleOverlay(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div id="notifications_tray_overlay" className="absolute inset-0 bg-[#0C0C0E]/98 z-40 flex flex-col animate-fade-in text-left">
      <div className="p-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950 shrink-0">
        <h3 className="text-sm font-display font-semibold text-zinc-200">Notifications</h3>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-white focus:outline-none cursor-pointer">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
        {/* Standard Notifications Section */}
        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <p className="text-center text-xs text-zinc-650 py-8 font-mono">Tray clear</p>
          ) : (
            filteredNotifications.map(notif => {
              const meta = NotificationMeta[notif.type] || { label: "Notification", icon: "🔔" };
              return (
                <div
                  key={notif.id}
                  onClick={() => handleOpenNotification(notif)}
                  className={`p-3.5 bg-zinc-900 border border-zinc-850 rounded-2xl space-y-2 animate-slide-up cursor-pointer hover:border-zinc-700 transition-colors ${notif.settled ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-[10px] font-bold font-mono text-[#ff8b66] uppercase tracking-wider">{meta.label}</span>
                    <span className="text-[9px] font-mono text-zinc-650 ml-auto">{notif.relativeTime}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-zinc-100">{notif.title}</p>
                    {notif.body && <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">{notif.body}</p>}
                  </div>
                  {!notif.settled && notif.actionText && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptInviteFromNotif(notif);
                      }}
                      className="bg-[#ff8b66] text-black text-[9px] font-black uppercase font-mono px-3.5 py-1 rounded focus:outline-none cursor-pointer"
                    >
                      {notif.actionText}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Completed Memories Section */}
        {completedMemories.length > 0 && (
          <div className="border-t border-zinc-900 pt-4 space-y-3">
            <h4 className="text-[10px] font-mono text-[#ff8b66] uppercase tracking-widest font-black px-1">
              Completed Memories
            </h4>
            <div className="grid gap-2">
              {completedMemories.map(item => (
                <div
                  key={item.memory.id}
                  onClick={() => onSelectMemoryPlan(item.plan)}
                  className="p-3.5 bg-zinc-900 border border-zinc-850 hover:border-zinc-700 rounded-2xl flex flex-col space-y-1 cursor-pointer transition-colors active:scale-[0.99] text-left"
                >
                  <p className="text-xs font-semibold text-zinc-100">{item.title}</p>
                  <p className="text-[10px] font-mono text-emerald-450">{item.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
