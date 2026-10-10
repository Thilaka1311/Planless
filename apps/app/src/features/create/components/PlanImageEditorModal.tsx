/**
 * PlanImageEditorModal.tsx
 *
 * Full-screen Apple-like image cropping & positioning modal (Move and Scale).
 * Allows single-finger pan and pinch-to-zoom, with strict boundary constraints
 * ensuring the image always completely covers the crop viewport.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ZoomIn, ZoomOut, Check } from "lucide-react";
import { resolveImage, ImageType } from "../../../shared/imaging/imageResolver";

export type CropShape = 'portrait' | 'circle';

export interface PlanImageEditorModalProps {
  imageSrc: string | File | Blob | null;
  isOpen: boolean;
  onClose: () => void;
  cropShape?: CropShape;
  title?: string;
  subtitle?: string;
  outputWidth?: number;
  outputHeight?: number;
  initialScale?: number;
  initialTranslateX?: number;
  initialTranslateY?: number;
  onSave: (result: {
    previewUrl: string;         // Cropped preview URL
    blob: Blob;                 // Cropped blob
    originalBlob: Blob | null;  // Original unmodified image blob
    originalPreviewUrl: string; // Original image preview URL
    width: number;
    height: number;
  }) => Promise<void> | void;
}

const getInitialViewport = (isCircle: boolean) => {
  if (typeof window === "undefined") {
    return isCircle ? { width: 300, height: 300 } : { width: 270, height: 480 };
  }
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const maxAvailableHeight = Math.max(200, windowHeight - 190);
  const maxAvailableWidth = Math.max(150, windowWidth - 48);

  if (isCircle) {
    const size = Math.round(Math.min(maxAvailableWidth, maxAvailableHeight, 340));
    return { width: size, height: size };
  } else {
    const portraitRatio = 9 / 16;
    let targetHeight = maxAvailableHeight;
    let targetWidth = Math.round(targetHeight * portraitRatio);

    if (targetWidth > maxAvailableWidth) {
      targetWidth = maxAvailableWidth;
      targetHeight = Math.round(targetWidth / portraitRatio);
    }

    return { width: targetWidth, height: targetHeight };
  }
};

export const PlanImageEditorModal: React.FC<PlanImageEditorModalProps> = ({
  imageSrc,
  isOpen,
  onClose,
  cropShape = 'portrait',
  title,
  subtitle,
  outputWidth,
  outputHeight,
  initialScale,
  initialTranslateX,
  initialTranslateY,
  onSave,
}) => {
  const isCircle = cropShape === 'circle';

  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Viewport dimensions (in px) — initialized synchronously to window dimensions
  const [viewportWidth, setViewportWidth] = useState(() => getInitialViewport(isCircle).width);
  const [viewportHeight, setViewportHeight] = useState(() => getInitialViewport(isCircle).height);

  // Transform state: Scale and translation (X, Y) relative to viewport center
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [maxScale, setMaxScale] = useState(4);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  // Gesture tracking refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number }>({ x: 0, y: 0, tx: 0, ty: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const initialPinchScaleRef = useRef<number>(1);
  const isInitializedRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive viewport size calculation
  useEffect(() => {
    const updateViewport = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Available space between top nav (~70px) and bottom controls (~110px)
      const maxAvailableHeight = Math.max(200, windowHeight - 190);
      const maxAvailableWidth = Math.max(150, windowWidth - 48);

      if (isCircle) {
        // Square viewport for circular crop (1:1 ratio) bounded by screen dimensions
        const size = Math.round(Math.min(maxAvailableWidth, maxAvailableHeight, 340));
        setViewportWidth(size);
        setViewportHeight(size);
      } else {
        // Home card vertical portrait ratio (9:16)
        const portraitRatio = 9 / 16;

        let targetHeight = maxAvailableHeight;
        let targetWidth = Math.round(targetHeight * portraitRatio);

        if (targetWidth > maxAvailableWidth) {
          targetWidth = maxAvailableWidth;
          targetHeight = Math.round(targetWidth / portraitRatio);
        }

        setViewportWidth(targetWidth);
        setViewportHeight(targetHeight);
      }
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [isCircle]);

  // Helper to compute max allowed translations for a given scale to prevent empty space
  const getBounds = useCallback(
    (currentScale: number, imgWidth: number, imgHeight: number) => {
      const renderedWidth = imgWidth * currentScale;
      const renderedHeight = imgHeight * currentScale;

      const maxX = Math.max(0, (renderedWidth - viewportWidth) / 2);
      const maxY = Math.max(0, (renderedHeight - viewportHeight) / 2);

      return { maxX, maxY };
    },
    [viewportWidth, viewportHeight]
  );

  // Clamp translation coordinates to ensure image always fully covers viewport
  const clampTranslation = useCallback(
    (x: number, y: number, currentScale: number, imgWidth: number, imgHeight: number) => {
      const { maxX, maxY } = getBounds(currentScale, imgWidth, imgHeight);
      const clampedX = Math.max(-maxX, Math.min(maxX, x));
      const clampedY = Math.max(-maxY, Math.min(maxY, y));
      return { x: clampedX, y: clampedY };
    },
    [getBounds]
  );

  // Object URL ref managed exclusively by this modal for File/Blob sources
  const createdUrlRef = useRef<string | null>(null);
  const prevSourceRef = useRef<any>(null);

  // Clean up any created object URL when the modal closes
  useEffect(() => {
    if (!isOpen) {
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
        createdUrlRef.current = null;
      }
      prevSourceRef.current = null;
      setImageElement(null);
      setLoadedUrl(null);
      setIsImageLoaded(false);
      isInitializedRef.current = false;
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
    }
  }, [isOpen]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
        createdUrlRef.current = null;
      }
      prevSourceRef.current = null;
    };
  }, []);

  // Load image when isOpen and imageSrc are valid
  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setImageElement(null);
      setLoadedUrl(null);
      setIsImageLoaded(false);
      isInitializedRef.current = false;
      return;
    }

    let active = true;
    let urlToLoad = "";

    if (typeof imageSrc === "string") {
      // If switching from File/Blob to string, clean up previously created object URL
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
        createdUrlRef.current = null;
      }
      if (prevSourceRef.current !== imageSrc) {
        isInitializedRef.current = false;
      }
      prevSourceRef.current = imageSrc;

      if (
        imageSrc.startsWith("blob:") ||
        imageSrc.startsWith("data:") ||
        imageSrc.startsWith("http://") ||
        imageSrc.startsWith("https://") ||
        imageSrc.startsWith("/")
      ) {
        urlToLoad = imageSrc;
      } else {
        urlToLoad = resolveImage(imageSrc, ImageType.PlanCover);
      }
    } else if (
      imageSrc instanceof Blob ||
      (typeof imageSrc === "object" && imageSrc !== null)
    ) {
      // If source changed to a different File/Blob, revoke the old one and create new
      if (prevSourceRef.current !== imageSrc) {
        if (createdUrlRef.current) {
          URL.revokeObjectURL(createdUrlRef.current);
          createdUrlRef.current = null;
        }
        prevSourceRef.current = imageSrc;
        createdUrlRef.current = URL.createObjectURL(imageSrc as Blob);
        isInitializedRef.current = false;
      } else if (!createdUrlRef.current) {
        createdUrlRef.current = URL.createObjectURL(imageSrc as Blob);
      }
      urlToLoad = createdUrlRef.current;
    }

    if (!urlToLoad) return;

    const img = new Image();
    // Only set crossOrigin for remote HTTP/HTTPS images to avoid CORS origin errors on blob:/data: URIs
    if (urlToLoad.startsWith("http://") || urlToLoad.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      if (!active) return;
      isInitializedRef.current = false;
      setImageElement(img);
      setLoadedUrl(urlToLoad);
      setIsImageLoaded(true);

      // Centered translation initially
      setTranslateX(0);
      setTranslateY(0);
    };

    img.onerror = (err) => {
      if (!active) return;
      console.error("[PlanImageEditorModal] Failed to load image source:", err, urlToLoad);
      setIsImageLoaded(false);
    };

    img.src = urlToLoad;

    return () => {
      active = false;
      // NOTE: Do NOT synchronously revoke createdUrlRef.current here!
      // In React 18 Strict Mode and effect re-runs, revoking here destroys
      // the URL while the browser is asynchronously decoding it.
      // Revocation is handled safely on source change or modal close/unmount above.
    };
  }, [isOpen, imageSrc]);

  // Adjust scale whenever imageElement or viewport dimensions change
  useEffect(() => {
    if (!imageElement || viewportWidth <= 0 || viewportHeight <= 0) return;

    const scaleX = viewportWidth / imageElement.naturalWidth;
    const scaleY = viewportHeight / imageElement.naturalHeight;
    const calculatedMinScale = Math.max(scaleX, scaleY);
    const calculatedMaxScale = calculatedMinScale * 4;

    setMinScale(calculatedMinScale);
    setMaxScale(calculatedMaxScale);

    if (!isInitializedRef.current) {
      // First initialization for this image / open session:
      // Always start at minimum supported zoom level (showing maximum image content)
      // or at restored initialScale if explicitly passed from a previous edit.
      const startingScale =
        initialScale != null && !isNaN(initialScale)
          ? Math.max(calculatedMinScale, Math.min(calculatedMaxScale, initialScale))
          : calculatedMinScale;

      const startingX = initialTranslateX ?? 0;
      const startingY = initialTranslateY ?? 0;

      const clamped = clampTranslation(
        startingX,
        startingY,
        startingScale,
        imageElement.naturalWidth,
        imageElement.naturalHeight
      );

      setScale(startingScale);
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
      isInitializedRef.current = true;
    } else {
      // Viewport dimensions resized while already initialized:
      // Clamp scale to the new [calculatedMinScale, calculatedMaxScale] range
      setScale((prevScale) => {
        // If user was at or near minScale, keep locked to the new minimum scale
        if (prevScale <= calculatedMinScale || Math.abs(prevScale - minScale) < 0.001) {
          return calculatedMinScale;
        }
        return Math.max(calculatedMinScale, Math.min(calculatedMaxScale, prevScale));
      });

      setTranslateX((prevX) => {
        const clamped = clampTranslation(
          prevX,
          translateY,
          scale,
          imageElement.naturalWidth,
          imageElement.naturalHeight
        );
        return clamped.x;
      });
      setTranslateY((prevY) => {
        const clamped = clampTranslation(
          translateX,
          prevY,
          scale,
          imageElement.naturalWidth,
          imageElement.naturalHeight
        );
        return clamped.y;
      });
    }
  }, [
    imageElement,
    viewportWidth,
    viewportHeight,
    initialScale,
    initialTranslateX,
    initialTranslateY,
    clampTranslation,
  ]);

  // Pointer event handlers for Pan
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageElement || isSaving) return;

    // Only initiate single-finger/mouse drag if not multi-touch
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: translateX,
      ty: translateY,
    };

    if (e.currentTarget) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !imageElement || isSaving) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    const targetX = dragStartRef.current.tx + deltaX;
    const targetY = dragStartRef.current.ty + deltaY;

    const clamped = clampTranslation(targetX, targetY, scale, imageElement.naturalWidth, imageElement.naturalHeight);
    setTranslateX(clamped.x);
    setTranslateY(clamped.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    touchDistanceRef.current = null;
    try {
      if (e.currentTarget) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore pointer capture release error if already released
    }
  };

  // Touch handlers for dual-finger Pinch-to-Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      touchDistanceRef.current = distance;
      initialPinchScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null && imageElement) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const ratio = currentDistance / touchDistanceRef.current;
      const newScale = Math.max(minScale, Math.min(maxScale, initialPinchScaleRef.current * ratio));

      setScale(newScale);

      // Re-clamp translation with the new scale
      const clamped = clampTranslation(translateX, translateY, newScale, imageElement.naturalWidth, imageElement.naturalHeight);
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      touchDistanceRef.current = null;
    }
  };

  const gestureAreaRef = useRef<HTMLDivElement>(null);

  // Sync refs for gesture calculations without re-registering listeners on every render
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const minScaleRef = useRef(minScale);
  useEffect(() => { minScaleRef.current = minScale; }, [minScale]);

  const maxScaleRef = useRef(maxScale);
  useEffect(() => { maxScaleRef.current = maxScale; }, [maxScale]);

  const translateXRef = useRef(translateX);
  useEffect(() => { translateXRef.current = translateX; }, [translateX]);

  const translateYRef = useRef(translateY);
  useEffect(() => { translateYRef.current = translateY; }, [translateY]);

  const imageElementRef = useRef(imageElement);
  useEffect(() => { imageElementRef.current = imageElement; }, [imageElement]);

  const isSavingRef = useRef(isSaving);
  useEffect(() => { isSavingRef.current = isSaving; }, [isSaving]);

  // Native non-passive wheel listener on the gesture container
  useEffect(() => {
    const el = gestureAreaRef.current;
    if (!el || !isOpen) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (!imageElementRef.current || isSavingRef.current) return;
      e.preventDefault();

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const currentScale = scaleRef.current;
      const newScale = Math.max(minScaleRef.current, Math.min(maxScaleRef.current, currentScale * zoomFactor));

      setScale(newScale);

      const clamped = clampTranslation(
        translateXRef.current,
        translateYRef.current,
        newScale,
        imageElementRef.current.naturalWidth,
        imageElementRef.current.naturalHeight
      );
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
    };

    el.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheelNative);
    };
  }, [isOpen, clampTranslation]);

  // Slider change handler
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!imageElement || isSaving) return;
    const newScale = parseFloat(e.target.value);
    setScale(newScale);

    const clamped = clampTranslation(translateX, translateY, newScale, imageElement.naturalWidth, imageElement.naturalHeight);
    setTranslateX(clamped.x);
    setTranslateY(clamped.y);
  };

  // Step zoom in/out with Zoom buttons
  const handleZoomOutStep = () => {
    if (!imageElement || isSaving) return;
    const step = (maxScale - minScale) / 10;
    const newScale = Math.max(minScale, scale - step);
    setScale(newScale);

    const clamped = clampTranslation(translateX, translateY, newScale, imageElement.naturalWidth, imageElement.naturalHeight);
    setTranslateX(clamped.x);
    setTranslateY(clamped.y);
  };

  const handleZoomInStep = () => {
    if (!imageElement || isSaving) return;
    const step = (maxScale - minScale) / 10;
    const newScale = Math.min(maxScale, scale + step);
    setScale(newScale);

    const clamped = clampTranslation(translateX, translateY, newScale, imageElement.naturalWidth, imageElement.naturalHeight);
    setTranslateX(clamped.x);
    setTranslateY(clamped.y);
  };

  // Save current crop to canvas & output WebP blob
  const handleSave = async () => {
    if (!imageElement || isSaving) return;
    setIsSaving(true);

    try {
      // High-res output dimensions matching context (512x512 for circle avatar, 1080x1920 for portrait card)
      const targetOutputWidth = outputWidth || (isCircle ? 512 : 1080);
      const targetOutputHeight = outputHeight || (isCircle ? 512 : 1920);

      const canvas = document.createElement("canvas");
      canvas.width = targetOutputWidth;
      canvas.height = targetOutputHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to obtain canvas 2D context");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Calculate mapping from viewport coordinates to source image pixels
      const imgWidth = imageElement.naturalWidth;
      const imgHeight = imageElement.naturalHeight;

      // Center of crop box on the natural image:
      const centerOnImageX = imgWidth / 2 - translateX / scale;
      const centerOnImageY = imgHeight / 2 - translateY / scale;

      const sourceCropWidth = viewportWidth / scale;
      const sourceCropHeight = viewportHeight / scale;

      const sourceX = centerOnImageX - sourceCropWidth / 2;
      const sourceY = centerOnImageY - sourceCropHeight / 2;

      // Safe bounds clamping to prevent floating-point rounding errors outside source dimensions
      const safeSourceX = Math.max(0, Math.min(imgWidth - sourceCropWidth, sourceX));
      const safeSourceY = Math.max(0, Math.min(imgHeight - sourceCropHeight, sourceY));
      const safeSourceWidth = Math.min(imgWidth - safeSourceX, sourceCropWidth);
      const safeSourceHeight = Math.min(imgHeight - safeSourceY, sourceCropHeight);

      ctx.drawImage(
        imageElement,
        safeSourceX,
        safeSourceY,
        safeSourceWidth,
        safeSourceHeight,
        0,
        0,
        targetOutputWidth,
        targetOutputHeight
      );

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            console.error('[PlanImageEditorModal] Failed to generate WebP blob');
            setIsSaving(false);
            return;
          }

          const previewUrl = URL.createObjectURL(blob);

          // Capture original image blob for the Plan Preview / Hero (cover_image)
          const capturedSrc = imageSrc;
          let originalBlob: Blob | null = null;
          let originalPreviewUrl = '';
          if (capturedSrc instanceof Blob) {
            // File extends Blob, so this covers both File and Blob
            originalBlob = capturedSrc;
            originalPreviewUrl = URL.createObjectURL(capturedSrc);
          } else if (typeof capturedSrc === 'string') {
            // For string URLs (e.g. editing existing remote image), original blob unavailable
            // The caller already has the cover_image path — pass null so caller skips re-upload
            originalBlob = null;
            originalPreviewUrl = capturedSrc;
          }

          try {
            await onSave({
              previewUrl,
              blob,
              originalBlob,
              originalPreviewUrl,
              width: targetOutputWidth,
              height: targetOutputHeight,
            });
          } catch (saveErr) {
            console.error('[PlanImageEditorModal] onSave error:', saveErr);
          } finally {
            setIsSaving(false);
          }
        },
        'image/webp',
        0.88
      );
    } catch (err) {
      console.error("[PlanImageEditorModal] Error rendering crop canvas:", err);
      setIsSaving(false);
    }
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-[#000000] flex flex-col justify-between select-none overflow-hidden touch-none"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── TOP APP BAR ── */}
      <div className="w-full flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3 z-30 bg-gradient-to-b from-black/90 to-transparent">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="flex items-center gap-1 text-white/90 hover:text-white active:scale-95 transition-all text-sm font-medium cursor-pointer p-2 -ml-2"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Cancel</span>
        </button>

        <h1 className="text-[16px] font-semibold text-white tracking-tight">
          {title || (isCircle ? "Move and Scale" : "Crop for Home Card")}
        </h1>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isImageLoaded}
          className="px-4 py-1.5 rounded-full bg-white text-black font-semibold text-sm hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50 cursor-pointer shadow-md flex items-center gap-1.5"
        >
          {isSaving ? (
            <span className="text-xs">Saving...</span>
          ) : (
            <>
              <Check className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Save</span>
            </>
          )}
        </button>
      </div>

      {/* ── CENTER CROP VIEWPORT AREA ── */}
      <div
        ref={gestureAreaRef}
        className="relative flex-1 w-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Rendered Movable / Scalable Image */}
        {isImageLoaded && imageElement && (
          <div
            className="absolute pointer-events-none transition-transform duration-75 ease-out"
            style={{
              width: `${imageElement.naturalWidth}px`,
              height: `${imageElement.naturalHeight}px`,
              transform: `translate3d(${translateX}px, ${translateY}px, 0px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            <img
              src={loadedUrl || (typeof imageSrc === "string" ? imageSrc : "")}
              alt="Crop preview"
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>
        )}

        {/* ── Fixed Mask Overlay Outside Crop Viewport ── */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {/* Crop Viewport Box */}
          <div
            className={`relative ${
              isCircle ? "rounded-full" : "rounded-[28px]"
            } border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.75)] overflow-hidden`}
            style={{
              width: `${viewportWidth}px`,
              height: `${viewportHeight}px`,
            }}
          >
            {/* Subtle Rule-of-Thirds Grid */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
              <div className="border-r border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-white" />
              <div className="border-r border-white" />
              <div />
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CONTROLS ── */}
      <div className="w-full flex flex-col items-center justify-center px-6 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <p className="text-[12px] text-white/50 mb-3 tracking-wide select-none">
          {subtitle || (isCircle ? "Drag to position, pinch or slide to zoom" : "Position how this photo appears on your Home card")}
        </p>

        {/* Zoom Slider */}
        <div className="w-full max-w-[280px] flex items-center gap-3">
          <button
            type="button"
            onClick={handleZoomOutStep}
            disabled={isSaving || !isImageLoaded || scale <= minScale}
            className="text-white/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition p-1 cursor-pointer shrink-0"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={(maxScale - minScale) / 100}
            value={scale}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <button
            type="button"
            onClick={handleZoomInStep}
            disabled={isSaving || !isImageLoaded || scale >= maxScale}
            className="text-white/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition p-1 cursor-pointer shrink-0"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
