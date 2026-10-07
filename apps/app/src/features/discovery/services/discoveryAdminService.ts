import { supabase } from "../../../../lib/supabaseClient";
import { processImage, validateImageFile, ImagePresets } from "../../../shared/imaging/imagePipeline";

// ─── Constants & Typed Schemas ───────────────────────────────────────────────

export const CATEGORY_OPTIONS = [
  { label: "Sports", value: "SPORTS" },
  { label: "Movies", value: "MOVIES" },
  { label: "Dining", value: "DINING" },
  { label: "Activities", value: "ACTIVITIES" },
  { label: "Custom", value: "CUSTOM" },
];

export const SUBCATEGORY_MAP: Record<string, { label: string; value: string }[]> = {
  SPORTS: [
    { label: "Badminton", value: "BADMINTON" },
    { label: "Football", value: "FOOTBALL" },
    { label: "Pickleball", value: "PICKLEBALL" },
    { label: "Tennis", value: "TENNIS" },
    { label: "Cricket", value: "CRICKET" },
    { label: "Basketball", value: "BASKETBALL" },
    { label: "Table Tennis", value: "TABLE_TENNIS" },
    { label: "Swimming", value: "SWIMMING" },
    { label: "Squash", value: "SQUASH" },
    { label: "Football | Pickleball", value: "Football | Pickleball" },
    { label: "Badminton | Table Tennis", value: "Badminton | Table Tennis" },
  ],
  MOVIES: [
    { label: "English", value: "ENGLISH" },
    { label: "Tamil", value: "TAMIL" },
    { label: "Hindi", value: "HINDI" },
  ],
  DINING: [
    { label: "Cafe", value: "CAFE" },
    { label: "Pub", value: "PUB" },
    { label: "Fine Dine", value: "FINE_DINE" },
  ],
  ACTIVITIES: [
    { label: "Bowling", value: "BOWLING" },
    { label: "Mystery Rooms", value: "MYSTERY_ROOMS" },
    { label: "Mini Golf", value: "MINI_GOLF" },
    { label: "Go-Karting", value: "GO_KARTING" },
    { label: "Amusement Parks", value: "AMUSEMENT_PARKS" },
    { label: "Arcades", value: "ARCADES" },
    { label: "Adventure & Fun", value: "ADVENTURE_FUN" },
  ],
  CUSTOM: [],
};

export function validateSubcategory(category: string, subcategory: string | null): boolean {
  const cat = category.toUpperCase();
  if (cat === "CUSTOM") {
    return subcategory === null;
  }
  const allowed = SUBCATEGORY_MAP[cat];
  if (!allowed) return true; // Accept other categories by default
  return (
    subcategory !== null &&
    (allowed.some((opt) => opt.value.toUpperCase() === subcategory.toUpperCase() || opt.label.toUpperCase() === subcategory.toUpperCase()) ||
      subcategory.includes("|"))
  );
}

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'boolean' | 'image';
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  defaultValue?: any;
}

export interface ContentConfig {
  type: string;
  title: string;
  category: 'SPORTS' | 'MOVIES' | 'DINING' | 'DRINKS' | 'CUSTOM' | 'ACTIVITIES';
  section_id: string;
  fields: FieldConfig[];
}

// ─── Content configurations ───────────────────────────────────────────────────

export const ADMIN_CONFIGS: Record<string, ContentConfig> = {
  turfs: {
    type: 'turfs',
    title: 'Turfs',
    category: 'SPORTS',
    section_id: '6dca5b0c-81e8-405a-851b-1a84664af845',
    fields: [
      { name: 'title', label: 'Name of the venue', type: 'text', required: true, placeholder: 'e.g. Play Arena Turf HSR' },
      {
        name: 'subcategory', label: 'Sport Supported', type: 'select', required: true, options: [
          { label: 'Football', value: 'FOOTBALL' },
          { label: 'Badminton', value: 'BADMINTON' },
          { label: 'Pickleball', value: 'PICKLEBALL' },
        ], defaultValue: 'FOOTBALL'
      },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'e.g. Casual 5v5 friendly game on turf' },
      { name: 'location', label: 'Address / Venue Location', type: 'text', required: true, placeholder: 'e.g. Play Arena, Kasavanahalli' },
      { name: 'cover_image_url', label: 'Cover Image', type: 'image', defaultValue: '/assets/plan-covers/football.webp' },
      { name: 'display_order', label: 'Display Order', type: 'number', defaultValue: 1 },
    ]
  },
  movies: {
    type: 'movies',
    title: 'Movies',
    category: 'MOVIES',
    section_id: 'ac6c3c7d-2717-4277-8e9e-82570b1ceedf',
    fields: [
      { name: 'title', label: 'Movie Title', type: 'text', required: true, placeholder: 'e.g. IMAX Blockbuster Premiere' },
      {
        name: 'subcategory', label: 'Language', type: 'select', required: true, options: [
          { label: 'English', value: 'ENGLISH' },
          { label: 'Tamil', value: 'TAMIL' },
          { label: 'Hindi', value: 'HINDI' }
        ], defaultValue: 'ENGLISH'
      },
      { name: 'description', label: 'Description / Synopsis', type: 'textarea', placeholder: 'e.g. Latest cinematic blockbuster release' },
      { name: 'location', label: 'Cinema Location', type: 'text', required: true, placeholder: 'e.g. Nexus IMAX Koramangala' },
      { name: 'cover_image_url', label: 'Movie Poster / Image', type: 'image', defaultValue: '/assets/plan-covers/movie.webp' },
      { name: 'display_order', label: 'Display Order', type: 'number', defaultValue: 1 },
    ]
  },
  dining: {
    type: 'dining',
    title: 'Dining',
    category: 'DINING',
    section_id: 'cb8d24c8-29ec-471c-922f-15fdf3a7904d',
    fields: [
      { name: 'title', label: 'Venue Name', type: 'text', required: true, placeholder: 'e.g. Cozy Corner Cafe' },
      {
        name: 'subcategory', label: 'Type', type: 'select', required: true, options: [
          { label: 'Cafe', value: 'CAFE' },
          { label: 'Pub', value: 'PUB' },
          { label: 'Fine Dine', value: 'FINE_DINE' }
        ], defaultValue: 'CAFE'
      },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'e.g. Best coffee and desserts in town' },
      { name: 'location', label: 'Location', type: 'text', required: true, placeholder: 'e.g. Indiranagar, Bangalore' },
      { name: 'cover_image_url', label: 'Cover Image', type: 'image', defaultValue: '/assets/plan-covers/dining.webp' },
      { name: 'display_order', label: 'Display Order', type: 'number', defaultValue: 1 },
    ]
  },
  activities: {
    type: 'activities',
    title: 'Activities',
    category: 'ACTIVITIES',
    section_id: 'places_activities',
    fields: [
      { name: 'title', label: 'Venue Name', type: 'text', required: true, placeholder: 'e.g. Mystery Rooms Koramangala' },
      {
        name: 'subcategory', label: 'Activity Type', type: 'select', required: true, options: [
          { label: 'Bowling', value: 'BOWLING' },
          { label: 'Mystery Rooms', value: 'MYSTERY_ROOMS' },
          { label: 'Mini Golf', value: 'MINI_GOLF' },
          { label: 'Go-Karting', value: 'GO_KARTING' },
          { label: 'Amusement Parks', value: 'AMUSEMENT_PARKS' },
          { label: 'Arcades', value: 'ARCADES' },
          { label: 'Adventure & Fun', value: 'ADVENTURE_FUN' },
        ], defaultValue: 'BOWLING'
      },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'e.g. Exciting real-life escape room adventure' },
      { name: 'location', label: 'Location', type: 'text', required: true, placeholder: 'e.g. Indiranagar, Bangalore' },
      { name: 'cover_image_url', label: 'Cover Image', type: 'image', defaultValue: '/assets/Activities.png' },
      { name: 'display_order', label: 'Display Order', type: 'number', defaultValue: 1 },
    ]
  }
};

// ─── API helpers ──────────────────────────────────────────────────────────────

import {
  adminFetchItems as serviceFetchItems,
  adminCreateItem as serviceCreateItem,
  adminUpdateItem as serviceUpdateItem,
  adminDeleteItem as serviceDeleteItem,
} from "./discoveryService";

export async function adminFetchItems(category: ContentConfig['category'], token?: string): Promise<any[]> {
  return serviceFetchItems(category);
}

export async function adminCreateItem(
  payload: Record<string, any>,
  config: ContentConfig,
  token?: string
): Promise<void> {
  await serviceCreateItem(payload, config);
}

export async function adminUpdateItem(
  id: string,
  payload: Record<string, any>,
  config: ContentConfig,
  token?: string
): Promise<void> {
  await serviceUpdateItem(id, payload, config);
}

export async function adminDeleteItem(id: string, token?: string): Promise<void> {
  await serviceDeleteItem(id);
}

export async function adminUploadImage(
  file: File,
  category: string,
  subcategory: string,
  itemId: string
): Promise<string> {
  // 1. Validate file type / size via the shared pipeline validator
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  // 2. Normalize path segments
  const normCategory = category.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const normSubcategory = subcategory.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  // 3. Process through the shared pipeline — resize to 800×500 and convert to WebP
  const blob = await processImage(file, ImagePresets.DiscoveryCover);

  // 4. Canonical storage key: always .webp
  const storagePath = `${normCategory}/${normSubcategory}/${itemId}.webp`;

  const { data, error } = await supabase.storage
    .from("discovery-images")
    .upload(storagePath, blob, { contentType: "image/webp", upsert: true });

  if (error || !data) throw error || new Error("Upload failed");

  return storagePath;
}
