/**
 * Core Static Assets Registry and In-Memory Preloader
 *
 * Centralizes the list of critical static UI assets shipped with the app.
 * Ensuring these assets are bundled, precached via ServiceWorker, and
 * pre-warmed in the browser image cache for instant, zero-latency screen transitions.
 */

import sportsImage from "../../assets/sports.png";
import moviesImage from "../../assets/Movies.png";
import diningImage from "../../assets/dining.png";
import customCoverImage from "../../assets/planimagedefault.png";
import defaultAvatarImage from "../../assets/default_avatar.png";
import planlessLogoImage from "../../assets/planless_logo.png";
import onboardingCupsImage from "../../assets/Onboarding_cups.png";

import { preloadImage } from "../imaging/preloadImage";

export const CORE_STATIC_IMAGES = [
  sportsImage,
  moviesImage,
  diningImage,
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
