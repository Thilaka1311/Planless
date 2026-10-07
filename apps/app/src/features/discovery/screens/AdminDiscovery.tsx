import React, { useState } from "react";
import { Trash, Pencil, AlertTriangle } from "lucide-react";
import {
  ContentConfig,
  adminDeleteItem,
} from "../services/discoveryAdminService";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

// ─── AdminContextSheet ────────────────────────────────────────────────────────
// Native-feeling action sheet that appears after an admin action on a custom discovery card.
// Only rendered for admin users.

export interface AdminContextSheetProps {
  item: any;
  config: ContentConfig;
  token?: string;
  onClose: () => void;
  onEdit: (item: any) => void;
  onDeleted: () => void;
}

export const AdminContextSheet: React.FC<AdminContextSheetProps> = ({
  item,
  config,
  token,
  onClose,
  onEdit,
  onDeleted,
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminDeleteItem(item.id, token);
      onDeleted();
    } catch (e: any) {
      console.error("[AdminContextSheet] Deletion request failed:", e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full flex flex-col" style={{ animation: "slideUp 0.26s cubic-bezier(0.32,0.72,0,1) both" }}>

        {/* Card preview strip */}
        <div className="mx-4 mb-2 rounded-2xl bg-[#111111] border border-white/[0.08] px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1A1A1A] shrink-0 flex items-center justify-center border border-white/[0.06]">
            <DiscoveryImages
              src={item.cover_image_url}
              category={config.category}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#71717A] tracking-wider uppercase font-medium">
              {config.category} &middot; {item.subcategory || "General"}
            </p>
            <p className="text-[15px] font-semibold text-white truncate mt-0.5">{item.title}</p>
          </div>
        </div>

        {/* Action rows */}
        <div className="mx-4 mb-2 rounded-2xl bg-[#111111] border border-white/[0.08] overflow-hidden">
          {!confirmingDelete ? (
            <>
              {/* Edit */}
              <button
                type="button"
                onClick={() => { onEdit(item); }}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer border-b border-white/[0.06]"
              >
                <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center shrink-0">
                  <Pencil className="w-3.5 h-3.5 text-[#A1A1AA]" />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-medium text-white leading-tight">Edit Card</p>
                  <p className="text-[12px] text-[#71717A] mt-0.5">Modify all card properties</p>
                </div>
              </button>

              {/* Remove */}
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer text-red-500"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <Trash className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-medium leading-tight">Remove Card</p>
                  <p className="text-[12px] text-red-400/60 mt-0.5">Delete this card permanently</p>
                </div>
              </button>
            </>
          ) : (
            /* Inline delete confirmation */
            <div className="p-5 flex flex-col gap-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white">Remove Card suggestion?</p>
                <p className="text-[12px] text-[#71717A] mt-1">This action is permanent and cannot be undone.</p>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 h-11 rounded-xl bg-zinc-900 border border-white/[0.08] text-[13px] font-semibold text-white hover:bg-zinc-800 transition active:scale-97 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-500 text-[13px] font-semibold text-white flex items-center justify-center transition active:scale-97 cursor-pointer"
                >
                  {deleting ? "Removing..." : "Yes, Remove"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cancel */}
        <div className="mx-4 mb-8">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-13 rounded-2xl bg-[#111111] border border-white/[0.06] text-[#A1A1AA] text-[15px] font-medium active:scale-98 transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

