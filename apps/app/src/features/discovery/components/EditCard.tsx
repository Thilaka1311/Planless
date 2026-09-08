import React, { useState } from "react";
import { ArrowLeft, Upload, X, ImageOff } from "lucide-react";
import {
  ContentConfig,
  adminUpdateItem,
  adminUploadImage,
  SUBCATEGORY_MAP,
} from "../services/discoveryAdminService";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { LocationAutocompleteInput } from "../../../shared/components/LocationAutocompleteInput";

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditCardProps {
  item: any;
  config: ContentConfig;
  token?: string;
  onClose: () => void;
  onSaved: () => void;
}

// ─── EditCard ─────────────────────────────────────────────────────────────────

export const EditCard: React.FC<EditCardProps> = ({
  item,
  config,
  token,
  onClose,
  onSaved,
}) => {
  // Initialise form data from every field in the config
  const buildInitialData = () => {
    const init: Record<string, any> = {};
    config.fields.forEach((f) => {
      init[f.name] = item?.[f.name] !== undefined ? item[f.name] : (f.defaultValue ?? "");
    });
    return init;
  };

  const [formData, setFormData] = useState<Record<string, any>>(buildInitialData);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const set = (name: string, value: any) =>
    setFormData((prev) => ({ ...prev, [name]: value }));

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleImageReplace = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const subcategory = formData.subcategory || item.subcategory || "general";
      const storagePath = await adminUploadImage(file, config.category, subcategory, item.id);
      set(fieldName, storagePath);
    } catch (err: any) {
      // error handled silently
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageRemove = (fieldName: string) => {
    set(fieldName, "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminUpdateItem(item.id, formData, config, token);
      onSaved();
    } catch (err: any) {
      console.error("[EditCard] Save request failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const heroImageField = config.fields.find((f) => f.type === "image");
  const heroImageUrl = heroImageField ? formData[heroImageField.name] : null;
  const nonImageFields = config.fields.filter((f) => f.type !== "image");

  return (
    <div
      className="fixed inset-0 z-50 bg-[#000000] flex flex-col overflow-hidden"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── Header ── */}
      <div className="shrink-0 px-5 pt-safe-top pt-4 pb-3 flex items-center gap-4 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-[#111111] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-semibold text-white leading-tight tracking-tight truncate">
            Edit Card
          </h1>
          <p className="text-[11px] font-medium text-[#71717A] tracking-wider uppercase mt-0.5">
            {config.title} Card
          </p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <form onSubmit={handleSave} className="flex-1 overflow-y-auto pb-32">

        {/* Hero image section */}
        {heroImageField && (
          <div className="relative w-full h-52 bg-[#111111] shrink-0">
            {heroImageUrl ? (
              <>
                <DiscoveryImages
                  src={heroImageUrl}
                  category={config.category}
                  alt="Card cover"
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff className="w-8 h-8 text-[#3F3F46]" />
              </div>
            )}

            {/* Image action buttons */}
            <div className="absolute bottom-4 right-4 flex gap-2">
              {heroImageUrl && (
                <button
                  type="button"
                  onClick={() => handleImageRemove(heroImageField.name)}
                  className="h-8 px-3 rounded-lg bg-black/60 backdrop-blur-md border border-white/[0.1] text-[#EF4444] text-[12px] font-medium flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Remove
                </button>
              )}
              <label className="h-8 px-3 rounded-lg bg-black/60 backdrop-blur-md border border-white/[0.1] text-white text-[12px] font-medium flex items-center gap-1.5 active:scale-95 transition cursor-pointer">
                <Upload className="w-3 h-3" />
                {uploadingImage ? "Uploading…" : heroImageUrl ? "Replace" : "Upload"}
                <input
                  id={`edit-field-input-${heroImageField.name}`}
                  name={heroImageField.name}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadingImage}
                  onChange={(e) => handleImageReplace(e, heroImageField.name)}
                />
              </label>
            </div>
          </div>
        )}

        {/* Fields */}
        <div className="px-5 pt-6 space-y-5">
          {nonImageFields.map((field) => {
            // Hide subcategory selector for CUSTOM category items
            if (config.category === "CUSTOM" && field.name === "subcategory") {
              return null;
            }
            return (
              <div key={field.name} className="flex flex-col gap-2">
                <label htmlFor={`edit-field-input-${field.name}`} className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
                  {field.label}
                  {field.required && <span className="text-[#EF4444] ml-1">*</span>}
                </label>

                {field.type === "text" && (
                  field.name === "location" ? (
                    <LocationAutocompleteInput
                      id={`edit-field-input-${field.name}`}
                      name={field.name}
                      value={formData[field.name] || ""}
                      onChange={(val) => set(field.name, val)}
                      placeholder={field.placeholder}
                      className="w-full h-12 px-4 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[15px] font-normal placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors"
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
                      id={`edit-field-input-${field.name}`}
                      name={field.name}
                      type="text"
                      required={field.required}
                      value={formData[field.name] || ""}
                      onChange={(e) => set(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full h-12 px-4 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[15px] font-normal placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors"
                    />
                  )
                )}

                {field.type === "textarea" && (
                  <textarea
                    id={`edit-field-input-${field.name}`}
                    name={field.name}
                    rows={4}
                    value={formData[field.name] || ""}
                    onChange={(e) => set(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[15px] font-normal placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors resize-none leading-relaxed"
                  />
                )}

                {field.type === "number" && (
                  <input
                    id={`edit-field-input-${field.name}`}
                    name={field.name}
                    type="number"
                    required={field.required}
                    value={formData[field.name] ?? ""}
                    onChange={(e) => set(field.name, Number(e.target.value))}
                    className="w-full h-12 px-4 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[15px] font-normal focus:outline-none focus:border-white/20 transition-colors"
                  />
                )}

                {field.type === "select" && (
                  <select
                    id={`edit-field-input-${field.name}`}
                    name={field.name}
                    value={formData[field.name] || ""}
                    onChange={(e) => set(field.name, e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[15px] font-normal focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center" }}
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
                  <label className="flex items-center gap-4 py-1 cursor-pointer">
                    <div className="relative">
                      <input
                        id={`edit-field-input-${field.name}`}
                        name={field.name}
                        type="checkbox"
                        checked={!!formData[field.name]}
                        onChange={(e) => set(field.name, e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-11 h-6 rounded-full border transition-colors ${formData[field.name]
                          ? "bg-white border-white"
                          : "bg-[#111111] border-white/[0.12]"
                          }`}
                      />
                      <div
                        className={`absolute top-1 w-4 h-4 rounded-full transition-all ${formData[field.name]
                          ? "left-6 bg-black"
                          : "left-1 bg-[#71717A]"
                          }`}
                      />
                    </div>
                    <span className="text-[15px] text-[#A1A1AA] font-normal">{field.label}</span>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </form>

      {/* ── Pinned footer ── */}
      <div className="shrink-0 px-5 pb-8 pt-4 border-t border-white/[0.06] bg-[#000000]">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploadingImage}
          className="w-full h-13 rounded-2xl bg-white text-black text-[15px] font-semibold flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-40 cursor-pointer"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
};
