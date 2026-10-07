/**
 * Core Static Assets Registry and In-Memory Preloader
 *
 * Centralizes the list of critical static UI assets shipped with the app.
 * Ensuring these assets are bundled, precached via ServiceWorker, and
 * pre-warmed in the browser image cache for instant, zero-latency screen transitions.
 */

import sportsCategoryIcon from "../../assets/categories/sports.png";
import moviesCategoryIcon from "../../assets/categories/movies.png";
import diningCategoryIcon from "../../assets/categories/dining.png";
import customCoverImage from "../../assets/planimagedefault.webp";
import defaultAvatarImage from "../../assets/default_avatar.webp";
import planlessLogoImage from "../../assets/planless_logo.webp";
import onboardingCupsImage from "../../assets/Onboarding_cups.webp";

import { preloadImage } from "../imaging/preloadImage";

export const CORE_STATIC_IMAGES = [
  sportsCategoryIcon,
  moviesCategoryIcon,
  diningCategoryIcon,
  customCoverImage,
  defaultAvatarImage,
  planlessLogoImage,
  onboardingCupsImage,
] as const;

let isPreloaded = false;

/**
 * Preload core static assets into the browser memory cache and GPU textures.
 * Runs non-blocking via requestIdleCallback / setTimeout so initial paint is instantaneous.
 */
export function preloadCoreStaticAssets(): void {
  if (isPreloaded || typeof window === "undefined") return;
  isPreloaded = true;

  const executePreload = () => {
    CORE_STATIC_IMAGES.forEach((src) => {
      if (src) {
        preloadImage(src);
      }
    });
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(executePreload, { timeout: 2000 });
  } else {
    setTimeout(executePreload, 200);
  }
}
