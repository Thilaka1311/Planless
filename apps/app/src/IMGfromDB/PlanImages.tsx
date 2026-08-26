import React from "react";
import { resolveImage, ImageType } from "../shared/imaging/imageResolver";

interface DiscoveryImagesProps {
  id?: string;
  /** The storage path or full URL of the cover image. */
  src?: string | null;
  /** Category to determine fallback covers */
  category?: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Extra CSS styles */
  className?: string;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  style?: React.CSSProperties;
}

/**
 * DiscoveryImages
 *
 * Renders discovery cover images. All URL resolution is delegated to the
 * shared imageResolver — this component contains no bucket names or URL logic.
 *
 * Fallback chain (handled by imageResolver + onError):
 *   discovery-images bucket → plan-images bucket (legacy) → placeholder
 */
export const DiscoveryImages: React.FC<DiscoveryImagesProps> = ({
  id,
  src,
  category = "CUSTOM",
  alt = "Discovery Preview",
  className = "",
  onClick,
  style,
}) => {
  // Tracks which resolution attempt we are on so the error handler knows
  // which bucket to try next.
  const [attempt, setAttempt] = React.useState<"primary" | "fallback" | "placeholder">(
    () => (!src || !src.trim() ? "placeholder" : "primary")
  );

  const [imgSrc, setImgSrc] = React.useState<string>(() =>
    resolveImage(src, ImageType.DiscoveryCover)
  );

  React.useEffect(() => {
    if (!src || !src.trim()) {
      setAttempt("placeholder");
      setImgSrc(resolveImage(null, ImageType.DiscoveryCover));
    } else {
      setAttempt("primary");
      setImgSrc(resolveImage(src, ImageType.DiscoveryCover));
    }
  }, [src]);

  const handleError = () => {
    if (!src || !src.trim()) return;

    if (attempt === "primary") {
      // Primary bucket failed — try legacy plan-images bucket
      setAttempt("fallback");
      setImgSrc(resolveImage(src, ImageType.PlanCover));
    } else if (attempt === "fallback") {
      // Both buckets failed — show placeholder
      setAttempt("placeholder");
      setImgSrc(resolveImage(null, ImageType.DiscoveryCover));
    }
  };

  return (
    <img
      id={id}
      src={imgSrc}
      alt={alt}
      className={className}
      onError={handleError}
      onClick={onClick}
      style={style}
      referrerPolicy="no-referrer"
    />
  );
};
