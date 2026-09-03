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

interface PlanImageEditorModalProps {
  imageSrc: string | File | Blob | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: { previewUrl: string; blob: Blob; width: number; height: number }) => Promise<void> | void;
}

export const PlanImageEditorModal: React.FC<PlanImageEditorModalProps> = ({
  imageSrc,
  isOpen,
  onClose,
  onSave,
}) => {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Viewport dimensions (in px) — dynamically calculated for mobile portrait Home card (9:16)
  const [viewportWidth, setViewportWidth] = useState(270);
  const [viewportHeight, setViewportHeight] = useState(480);

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

  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive portrait viewport size calculation (9:16 aspect ratio)
  useEffect(() => {
    const updateViewport = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Available space between top nav (~70px) and bottom controls (~110px)
      const maxAvailableHeight = Math.max(200, windowHeight - 190);
      const maxAvailableWidth = Math.max(150, windowWidth - 48);

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
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

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
      imageSrc instanceof File ||
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
    if (!imageElement) return;

    const scaleX = viewportWidth / imageElement.naturalWidth;
    const scaleY = viewportHeight / imageElement.naturalHeight;
    const calculatedMinScale = Math.max(scaleX, scaleY);
    const calculatedMaxScale = calculatedMinScale * 4;

    setMinScale(calculatedMinScale);
    setMaxScale(calculatedMaxScale);

    setScale((prevScale) => {
      if (prevScale < calculatedMinScale || prevScale === 1) {
        return calculatedMinScale;
      }
      return Math.min(calculatedMaxScale, prevScale);
    });
  }, [imageElement, viewportWidth, viewportHeight]);

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

  // Save current crop to canvas & output WebP blob
  const handleSave = async () => {
    if (!imageElement || isSaving) return;
    setIsSaving(true);

    try {
      // High-res mobile portrait output dimensions matching Home screen card (9:16 ratio)
      const outputWidth = 1080;
      const outputHeight = 1920;

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;

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

      ctx.drawImage(
        imageElement,
        sourceX,
        sourceY,
        sourceCropWidth,
        sourceCropHeight,
        0,
        0,
        outputWidth,
        outputHeight
      );

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            console.error("[PlanImageEditorModal] Failed to generate WebP blob");
            setIsSaving(false);
            return;
          }

          const previewUrl = URL.createObjectURL(blob);
          try {
            await onSave({
              previewUrl,
              blob,
              width: outputWidth,
              height: outputHeight,
            });
          } catch (saveErr) {
            console.error("[PlanImageEditorModal] onSave error:", saveErr);
          } finally {
            setIsSaving(false);
          }
        },
        "image/webp",
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
          Edit Plan Image
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
          {/* Portrait Crop Viewport Box */}
          <div
            className="relative rounded-[28px] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.75)] overflow-hidden"
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
          Pinch or drag to position photo for Home screen
        </p>

        {/* Zoom Slider */}
        <div className="w-full max-w-[280px] flex items-center gap-3">
          <ZoomOut className="w-4 h-4 text-white/50 shrink-0" />
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={(maxScale - minScale) / 100}
            value={scale}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <ZoomIn className="w-4 h-4 text-white/50 shrink-0" />
        </div>
      </div>
    </div>
  );
};
