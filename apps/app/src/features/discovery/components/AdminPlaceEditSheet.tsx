import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check, Trash, Upload, AlertTriangle, Image as ImageIcon, MapPin, Loader2 } from "lucide-react";
import { DiscoveryItem, DiscoveryCategory } from "../../../core/types/discovery";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase, SUPABASE_URL } from "../../../../lib/supabaseClient";
import { savePlaceOverride, hidePlace } from "../services/placeOverridesService";
import { adminUploadImage, SUBCATEGORY_MAP } from "../services/discoveryAdminService";
import { LocationAutocompleteInput } from "../../../shared/components/LocationAutocompleteInput";
import { extractCleanPlaceId, classifyVenueCategory } from "../services/venueRelevance";
import { getSupportedSports, extractSportsList, scoreSportsVenueRelevance, SportCategoryId } from "../services/sportsRelevance";

export const AVAILABLE_SPORTS = [
  "Football",
  "Badminton",
  "Pickleball",
  "Tennis",
  "Cricket",
  "Basketball",
  "Table Tennis",
  "Swimming",
  "Squash",
  "Volleyball",
];

const SPORT_NAME_MAP: Record<string, string> = {
  football: "Football",
  soccer: "Football",
  futsal: "Football",
  badminton: "Badminton",
  pickleball: "Pickleball",
  tennis: "Tennis",
  cricket: "Cricket",
  basketball: "Basketball",
  "table-tennis": "Table Tennis",
  "table tennis": "Table Tennis",
  swimming: "Swimming",
  squash: "Squash",
  volleyball: "Volleyball",
};

export function normalizeSportToTitleCase(sport: string): string | null {
  const clean = sport.trim().toLowerCase();
  if (SPORT_NAME_MAP[clean]) return SPORT_NAME_MAP[clean];
  const matched = AVAILABLE_SPORTS.find((s) => s.toLowerCase() === clean);
  if (matched) return matched;
  return null;
}

export function resolveDefaultSports(item: DiscoveryItem): string[] {
  // 1. If the item already has a stored subcategory (e.g. from an existing override)
  if (item.subcategory) {
    const list = extractSportsList(item.subcategory);
    const valid = list
      .map((s) => normalizeSportToTitleCase(s))
      .filter((s): s is string => Boolean(s));
    if (valid.length > 0) {
      return Array.from(new Set(valid));
    }
  }

  // 2. If the item has stamped supported_sports / supportedSports array from discovery
  const stampedSports: string[] =
    Array.isArray((item as any).supported_sports) && (item as any).supported_sports.length > 0
      ? (item as any).supported_sports
      : Array.isArray((item as any).supportedSports) && (item as any).supportedSports.length > 0
      ? (item as any).supportedSports
      : [];

  if (stampedSports.length > 0) {
    const valid = stampedSports
      .map((s) => normalizeSportToTitleCase(s))
      .filter((s): s is string => Boolean(s));
    if (valid.length > 0) {
      return Array.from(new Set(valid));
    }
  }

  // 3. Fallback to existing discovery classification logic (strongly relevant sports with keyword evidence)
  const concreteSports: SportCategoryId[] = [
    "football",
    "badminton",
    "pickleball",
    "tennis",
    "basketball",
    "cricket",
    "table-tennis",
  ];

  const stronglyRelevantSports: string[] = [];
  for (const sport of concreteSports) {
    const scoreRes = scoreSportsVenueRelevance(item as any, sport);
    if (scoreRes.isStronglyRelevant) {
      const titleCase = normalizeSportToTitleCase(sport);
      if (titleCase && !stronglyRelevantSports.includes(titleCase)) {
        stronglyRelevantSports.push(titleCase);
      }
    }
  }

  if (stronglyRelevantSports.length > 0) {
    return stronglyRelevantSports;
  }

  // 4. Cannot confidently identify any concrete sport
  return [];
}

export interface AdminPlaceEditSheetProps {
  item: DiscoveryItem | null;
  onClose: () => void;
  onSaved?: (updatedItem: DiscoveryItem) => void;
  onHidden?: (placeId: string) => void;
  userCoordinates?: { latitude: number; longitude: number } | null;
}

interface PlacePhotoItem {
  photo_reference: string;
  width?: number;
  height?: number;
}

export const AdminPlaceEditSheet: React.FC<AdminPlaceEditSheetProps> = ({
  item,
  onClose,
  onSaved,
  onHidden,
}) => {
  if (!item) return null;

  const rawPlaceId = extractCleanPlaceId(item) || item.place_id || (typeof item.id === "string" ? item.id.split("::")[0].replace(/^place_/, "") : item.id) || "";
  const placeId = String(rawPlaceId);
  const category = (
    item.category ||
    (item.section_id?.includes("sports") ? "SPORTS" : null) ||
    (item.section_id?.includes("dining") ? "DINING" : null) ||
    (item.section_id?.includes("activities") ? "ACTIVITIES" : null) ||
    (item.section_id?.includes("movies") ? "MOVIES" : null) ||
    classifyVenueCategory(item) ||
    "SPORTS"
  ).toUpperCase() as DiscoveryCategory;

  const isSportsCategory = category === "SPORTS";

  // Form State
  const [name, setName] = useState(item.title || (item as any).name || "");
  const [address, setAddress] = useState(item.place_address || item.location || "");
  const [description, setDescription] = useState(item.description || "");
  const [subcategory, setSubcategory] = useState(item.subcategory || "");
  const [selectedSports, setSelectedSports] = useState<string[]>(() => {
    if (isSportsCategory) {
      return resolveDefaultSports(item);
    }
    return [];
  });
  const [selectedPhotoRef, setSelectedPhotoRef] = useState<string | null>(
    (item as any).google_photo_reference || null
  );
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(
    (item as any).image_path || null
  );

  // Photos State
  const [googlePhotos, setGooglePhotos] = useState<PlacePhotoItem[]>(() => {
    if (Array.isArray(item.photo_references) && item.photo_references.length > 0) {
      return item.photo_references.map((ref) => ({ photo_reference: ref }));
    }
    return [];
  });
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Action State
  const [saving, setSaving] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch all Google Places photos on mount
  useEffect(() => {
    let active = true;
    if (!placeId) return;

    setLoadingPhotos(true);
    supabase.functions
      .invoke("maps", {
        body: { action: "place-details", place_id: placeId, all_photos: true },
      })
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingPhotos(false);
        if (error) {
          console.warn("[AdminPlaceEditSheet] Failed to fetch place photos:", error.message);
          return;
        }

        const photos = data?.result?.photos;
        if (Array.isArray(photos) && photos.length > 0) {
          setGooglePhotos((prev) => {
            const photoMap = new Map<string, PlacePhotoItem>();

            // Seed with any existing photos from initial discovery
            for (const p of prev) {
              if (p.photo_reference) {
                const cleanKey = p.photo_reference.split("/photos/").pop() || p.photo_reference;
                photoMap.set(cleanKey, p);
              }
            }

            // Merge newly fetched photos from place details & search enrichment
            for (const p of photos) {
              const ref = p.photo_reference || p.name || "";
              if (ref) {
                const cleanKey = ref.split("/photos/").pop() || ref;
                if (!photoMap.has(cleanKey)) {
                  photoMap.set(cleanKey, {
                    ...p,
                    photo_reference: ref,
                  });
                }
              }
            }

            return Array.from(photoMap.values());
          });
        }
      })
      .catch((err) => {
        if (active) {
          setLoadingPhotos(false);
          console.warn("[AdminPlaceEditSheet] Exception fetching place photos:", err);
        }
      });

    return () => {
      active = false;
    };
  }, [placeId]);

  // Derived cover photo URL for preview
  const currentPreviewUrl = selectedPhotoRef
    ? `${SUPABASE_URL}/functions/v1/maps?action=photo&photo_reference=${encodeURIComponent(
        selectedPhotoRef
      )}&maxwidth=800`
    : customImageUrl || item.cover_image_url;

  // Handle Custom Image Upload
  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setErrorMessage(null);
    try {
      const storagePath = await adminUploadImage(
        file,
        category,
        isSportsCategory
          ? selectedSports[0] || "general"
          : subcategory || "general",
        placeId
      );
      setCustomImageUrl(storagePath);
      setSelectedPhotoRef(null); // Clear google photo ref if custom uploaded
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeId) {
      setErrorMessage("Missing place_id");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const subcategoryToSave: string | null = isSportsCategory
      ? selectedSports.length > 0
        ? JSON.stringify(selectedSports)
        : null
      : subcategory.trim() || null;

    try {
      await savePlaceOverride(placeId, {
        name_override: name.trim() || null,
        address_override: address.trim() || null,
        description_override: description.trim() || null,
        category_override: category,
        subcategory: subcategoryToSave,
        google_photo_reference: selectedPhotoRef,
        image_path: customImageUrl,
        latitude_override: typeof item.latitude === "number" ? item.latitude : (item as any).metadata?.latitude ?? null,
        longitude_override: typeof item.longitude === "number" ? item.longitude : (item as any).metadata?.longitude ?? null,
      });

      const updatedSupportedSports = isSportsCategory
        ? selectedSports.map((s) => s.toLowerCase().replace(/\s+/g, "-"))
        : (item as any).supported_sports;

      const updatedItem: DiscoveryItem = {
        ...item,
        title: name.trim() || item.title,
        place_address: address.trim() || item.place_address,
        location: address.trim() || item.location,
        description: description.trim() || item.description,
        subcategory: subcategoryToSave,
        supported_sports: updatedSupportedSports,
        supportedSports: updatedSupportedSports,
        cover_image_url: currentPreviewUrl,
        _hasPlanlessOverride: true,
        google_photo_reference: selectedPhotoRef,
        image_path: customImageUrl,
      } as any;

      onSaved?.(updatedItem);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save place overrides");
    } finally {
      setSaving(false);
    }
  };

  // Handle Hide / Remove Place
  const handleHide = async () => {
    if (!placeId) return;
    setHiding(true);
    setErrorMessage(null);

    try {
      await hidePlace(placeId);
      onHidden?.(placeId);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to hide place");
      setHiding(false);
    }
  };

  const subcategoryOptions = React.useMemo(() => {
    if (isSportsCategory) return [];
    const list = [...(SUBCATEGORY_MAP[category] || [])];
    if (subcategory && !list.some((opt) => opt.value === subcategory || opt.label === subcategory)) {
      list.unshift({ label: subcategory, value: subcategory });
    }
    return list;
  }, [category, subcategory, isSportsCategory]);

  const sheetContent = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div
        className="relative w-full max-w-lg bg-[#0e0e11] border-t border-white/[0.08] rounded-t-3xl flex flex-col max-h-[92vh] overflow-hidden shadow-2xl z-10"
        style={{ animation: "slideUp 0.25s cubic-bezier(0.32,0.72,0,1) both" }}
      >
        {/* Grab Handle */}
        <div
          onClick={onClose}
          className="pt-3 pb-1 flex items-center justify-center shrink-0 cursor-pointer active:opacity-70 transition"
        >
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-white leading-tight">
              Edit Place Details
            </h3>
            <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mt-0.5">
              Admin Override &middot; {category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#71717A] hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-8 no-scrollbar text-left">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Hero Image Preview */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
              Cover Photo Preview
            </label>
            <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.08] shrink-0">
              <DiscoveryImages
                src={currentPreviewUrl}
                category={category}
                alt={name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 text-xs font-medium text-white/90 truncate max-w-[85%]">
                {name || "Untitled Place"}
              </div>
            </div>
          </div>

          {/* 2. Google Places Photo Picker Carousel */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
                Google Places Photos {googlePhotos.length > 0 && `(${googlePhotos.length})`}
              </label>
              <label className="text-[11px] font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 cursor-pointer transition">
                <Upload className="w-3 h-3" />
                <span>{uploadingImage ? "Uploading..." : "Upload Custom"}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingImage}
                  className="sr-only"
                  onChange={handleCustomUpload}
                />
              </label>
            </div>

            {loadingPhotos && googlePhotos.length === 0 ? (
              <div className="h-24 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center gap-2 text-zinc-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading Google Places photos...</span>
              </div>
            ) : googlePhotos.length > 0 ? (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
                {googlePhotos.map((photo, index) => {
                  const photoUrl = `${SUPABASE_URL}/functions/v1/maps?action=photo&photo_reference=${encodeURIComponent(
                    photo.photo_reference
                  )}&maxwidth=300`;
                  const isSelected = selectedPhotoRef === photo.photo_reference;

                  return (
                    <button
                      key={photo.photo_reference || index}
                      type="button"
                      onClick={() => {
                        setSelectedPhotoRef(photo.photo_reference);
                        setCustomImageUrl(null);
                      }}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border transition-all cursor-pointer group ${
                        isSelected
                          ? "border-white ring-2 ring-white/80 scale-[1.02]"
                          : "border-white/[0.08] hover:border-white/30 opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={photoUrl}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white text-black flex items-center justify-center shadow-md">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="h-16 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-500 text-xs">
                <ImageIcon className="w-4 h-4 mr-1.5 opacity-50" />
                <span>No Google Places photos returned for this venue</span>
              </div>
            )}
          </div>

          {/* 3. Place Name Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
              Place Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Play Arena Turf"
              className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {/* 4. Location / Address Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
              Location & Address
            </label>
            <LocationAutocompleteInput
              value={address}
              onChange={(val) => setAddress(val)}
              placeholder="Search or edit address"
              className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors"
              onSelectPlace={(place) => {
                setAddress(place.formatted_address || place.name || "");
              }}
            />
          </div>

          {/* 5. Category Subtype: Multi-Select for Sports, Dropdown for other categories */}
          {isSportsCategory ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
                  Category Subtype (Sports)
                </label>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {selectedSports.length > 0 ? `${selectedSports.length} selected` : "None (null)"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-[#111111] border border-white/[0.08]">
                {AVAILABLE_SPORTS.map((sport) => {
                  const isSelected = selectedSports.includes(sport);
                  return (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => {
                        setSelectedSports((prev) =>
                          isSelected ? prev.filter((s) => s !== sport) : [...prev, sport]
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                        isSelected
                          ? "bg-white text-black font-semibold shadow-sm"
                          : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      <span>{sport}</span>
                    </button>
                  );
                })}
              </div>
              {selectedSports.length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedSports([])}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    Clear all (set to null)
                  </button>
                </div>
              )}
            </div>
          ) : subcategoryOptions.length > 0 ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
                Category Subtype
              </label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
              >
                <option value="">Default ({category})</option>
                {subcategoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* 6. Description Textarea */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.12em]">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add optional notes or descriptions for Planless users"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111111] border border-white/[0.08] text-white text-[14px] placeholder-[#3F3F46] focus:outline-none focus:border-white/20 transition-colors resize-none"
            />
          </div>

          {/* 7. Action Buttons */}
          <div className="pt-2 space-y-3">
            {/* Save Overrides Button */}
            <button
              type="button"
              disabled={saving || hiding}
              onClick={handleSave}
              className="w-full h-12 rounded-xl bg-white text-black text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-40 cursor-pointer shadow-lg"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? "Saving Overrides..." : "Save Changes"}</span>
            </button>

            {/* Hide / Remove Place Button */}
            {!confirmingHide ? (
              <button
                type="button"
                disabled={saving || hiding}
                onClick={() => setConfirmingHide(true)}
                className="w-full h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/15 text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer"
              >
                <Trash className="w-4 h-4" />
                <span>Hide from Planless</span>
              </button>
            ) : (
              /* Inline Exclusion Confirmation */
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-white">
                      Hide this place from Planless?
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                      This place will be permanently excluded from all searches, category feeds, and discovery rails.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmingHide(false)}
                    className="flex-1 h-10 rounded-lg bg-zinc-900 border border-white/[0.08] text-[12px] font-semibold text-zinc-300 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={hiding}
                    onClick={handleHide}
                    className="flex-1 h-10 rounded-lg bg-red-600 hover:bg-red-500 text-[12px] font-semibold text-white flex items-center justify-center transition cursor-pointer"
                  >
                    {hiding ? "Hiding..." : "Yes, Hide Place"}
                  </button>
                </div>
              </div>
            )}
          </div>
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

  return typeof document !== "undefined"
    ? createPortal(sheetContent, document.body)
    : sheetContent;
};
