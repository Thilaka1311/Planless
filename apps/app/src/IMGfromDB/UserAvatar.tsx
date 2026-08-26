import React from "react";
import { resolveImage, evictImageCache, ImageType } from "../shared/imaging/imageResolver";

interface UserAvatarProps {
  /** The user's uploaded profile image URL. Empty string or null → default avatar. */
  src?: string | null;
  /** Alt text for accessibility */
  alt?: string;
  /** Tailwind size class, e.g. "w-8 h-8". Applied to the wrapping element. */
  size?: string;
  /** Additional classes to merge onto the <img> element */
  className?: string;
  /** onClick handler */
  onClick?: (e?: any) => void;
  /** Custom style rules */
  style?: React.CSSProperties;
}

/**
 * UserAvatar
 *
 * Single source of truth for all user profile image rendering in Planless.
 * Falls back to the Planless default avatar when:
 *  - src is empty / null / undefined
 *  - the image fails to load (broken URL, 404, etc.)
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  alt = "User",
  size = "w-8 h-8",
  className = "",
  onClick,
  style,
}) => {
  const [imgSrc, setImgSrc] = React.useState<string>(() =>
    resolveImage(src, ImageType.Avatar)
  );

  // Sync when src prop changes (e.g. after upload)
  React.useEffect(() => {
    setImgSrc(resolveImage(src, ImageType.Avatar));
  }, [src]);

  const handleError = () => {
    if (src) evictImageCache(src, ImageType.Avatar);
    setImgSrc(resolveImage(null, ImageType.Avatar));
  };

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={handleError}
      onClick={onClick}
      style={style}
      className={`${size} rounded-full object-cover flex-shrink-0 ${className}`}
      referrerPolicy="no-referrer"
      draggable={false}
    />
  );
};

export default UserAvatar;
