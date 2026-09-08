import React, { useState, useEffect } from "react";
import { Plus, Edit, Trash, Upload, Check, X, ArrowLeft, Pencil, AlertTriangle } from "lucide-react";
import {
  ContentConfig,
  adminFetchItems,
  adminCreateItem,
  adminUpdateItem,
  adminDeleteItem,
  adminUploadImage,
  SUBCATEGORY_MAP,
} from "../services/discoveryAdminService";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { LocationAutocompleteInput } from "../../../shared/components/LocationAutocompleteInput";

// ─── AdminContextSheet ────────────────────────────────────────────────────────
// Native-feeling action sheet that appears after a long-press on a discovery card.
// Only rendered for admin users.

export interface AdminContextSheetProps {
  item: any;
  config: ContentConfig;
  token?: string;
  onClose: () => void;
  onEdit: (item: any) => void;
  onAdd: () => void;
  onDeleted: () => void;
}

export const AdminContextSheet: React.FC<AdminContextSheetProps> = ({
  item,
  config,
  token,
  onClose,
  onEdit,
  onAdd,
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
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer border-b border-white/[0.06] text-red-500"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <Trash className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-medium leading-tight">Remove Card</p>
                  <p className="text-[12px] text-red-400/60 mt-0.5">Delete this card permanently</p>
                </div>
              </button>

              {/* Add */}
              <button
                type="button"
                onClick={onAdd}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 text-[#A1A1AA]" />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-medium text-white leading-tight">Add Card</p>
                  <p className="text-[12px] text-[#71717A] mt-0.5">Create a new {config.title.slice(0, -1).toLowerCase()}</p>
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

// ─── AdminDrawer ──────────────────────────────────────────────────────────────
// Slide-up sheet for creating a new discovery card. Used by "Add Card" action.

export interface AdminDrawerProps {
  config: ContentConfig;
  token?: string;
  onClose: () => void;
  onMutated: () => void;
}

export const AdminDrawer: React.FC<AdminDrawerProps> = ({ config, token, onClose, onMutated }) => {
  const [itemUuid] = useState(() => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  });
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    config.fields.forEach((f) => { init[f.name] = f.defaultValue ?? ""; });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const set = (name: string, value: any) =>
    setFormData((p) => ({ ...p, [name]: value }));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const subcategory = formData.subcategory || "general";
      const storagePath = await adminUploadImage(file, config.category, subcategory, itemUuid);
      set(fieldName, storagePath);
    } catch (e: any) {
      // error handled silently
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminCreateItem({ ...formData, id: itemUuid }, config, token);
      onMutated();
    } catch (e: any) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full bg-[#09090C] rounded-t-3xl border-t border-white/[0.06] flex flex-col max-h-[92vh] overflow-hidden"
        style={{ animation: "slideUp 0.26s cubic-bezier(0.32,0.72,0,1) both" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-[#3F3F46]" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[17px] font-semibold text-white leading-tight">
              {config.category === "SPORTS" ? "New Sports Card" : `New ${config.title.slice(0, -1)} Card`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#111111] border border-white/[0.08] flex items-center justify-center text-[#71717A] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4 pb-6">
          {config.fields.map((field) => {
            // Hide subcategory selector for CUSTOM category items
            if (config.category === "CUSTOM" && field.name === "subcategory") {
              return null;
            }
            return (
              <div key={field.name} className="flex flex-col gap-1.5">
                <label htmlFor={`field-input-${field.name}`} className="text-[10px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
                  {field.label} {field.required && <span className="text-[#EF4444]">*</span>}
                </label>

                {field.type === "text" && (
                  field.name === "location" ? (
                    <LocationAutocompleteInput
                      id={`field-input-${field.name}`}
                      name={field.name}
                      value={formData[field.name] || ""}
                      onChange={(val) => set(field.name, val)}
                      placeholder={field.placeholder}
                      className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors"
                      onSelectPlace={(place) => {
                        set("location", place.name);
                        set("place_id", place.place_id);
                        set("place_name", place.name);
                        set("place_address", place.formatted_address);
                        set("latitude", place.latitude);
                        set("longitude", place.longitude);
                      }}
                    />
                  ) : (
                    <input
                      id={`field-input-${field.name}`}
                      name={field.name}
                      type="text"
                      required={field.required}
                      value={formData[field.name] || ""}
                      onChange={(e) => set(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors"
                    />
                  )
                )}

                {field.type === "textarea" && (
                  <textarea
                    id={`field-input-${field.name}`}
                    name={field.name}
                    rows={3}
                    value={formData[field.name] || ""}
                    onChange={(e) => set(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors resize-none"
                  />
                )}

                {field.type === "number" && (
                  <input
                    id={`field-input-${field.name}`}
                    name={field.name}
                    type="number"
                    required={field.required}
                    value={formData[field.name] ?? ""}
                    onChange={(e) => set(field.name, Number(e.target.value))}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] focus:outline-none focus:border-white/20 transition-colors"
                  />
                )}

                {field.type === "select" && (
                  <select
                    id={`field-input-${field.name}`}
                    name={field.name}
                    value={formData[field.name] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      set(field.name, val);
                    }}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
                  >
                    {(() => {
                      let opts = field.options || [];
                      if (field.name === "subcategory") {
                        opts = SUBCATEGORY_MAP[config.category] || [];
                      }
                      return opts.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#111111]">
                          {opt.label}
                        </option>
                      ));
                    })()}
                  </select>
                )}

                {field.type === "boolean" && (
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      id={`field-input-${field.name}`}
                      name={field.name}
                      type="checkbox"
                      checked={!!formData[field.name]}
                      onChange={(e) => set(field.name, e.target.checked)}
                      className="w-4 h-4 rounded border-[#3F3F46] bg-[#111111] focus:ring-0 cursor-pointer accent-white"
                    />
                    <span className="text-[14px] text-[#A1A1AA] font-normal">{field.label}</span>
                  </label>
                )}

                {field.type === "image" && (
                  <div className="flex gap-3 items-center">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-[#111111] border border-white/[0.08] flex items-center justify-center shrink-0">
                      {formData[field.name] ? (
                        <DiscoveryImages
                          src={formData[field.name]}
                          category={config.category}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[#3F3F46] text-[10px]">None</span>
                      )}
                    </div>
                    <label className="flex-1 h-9 px-4 rounded-xl bg-[#111111] border border-white/[0.08] text-[12px] font-medium text-[#A1A1AA] flex items-center justify-center gap-2 hover:text-white transition-colors active:scale-95 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingImage ? "Uploading…" : "Upload Image"}
                      <input
                        id={`field-input-${field.name}`}
                        name={field.name}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={uploadingImage}
                        onChange={(e) => handleImageUpload(e, field.name)}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || uploadingImage}
              className="w-full h-12 rounded-2xl bg-white text-black text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {loading ? "Creating…" : "Create Card"}
            </button>
          </div>
        </form>
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
