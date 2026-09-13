import cv2
import numpy as np

# Load original
img = cv2.imread('apps/app/src/assets/Onboarding_cups.png', cv2.IMREAD_COLOR)
h, w = img.shape[:2]

# Detect white/near-white background
# Check all channels: background is nearly pure white (typically R,G,B >= 246)
is_white = (img[:, :, 0] >= 244) & (img[:, :, 1] >= 244) & (img[:, :, 2] >= 244)

# Create binary mask: 255 for white, 0 for drawing
white_mask = (is_white.astype(np.uint8)) * 255

# Connected components of white
num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(white_mask)

# Component 1 (largest) is the main outer background
bg_mask = np.zeros((h, w), dtype=np.uint8)

# The outer background is definitely connected to borders
# We can find all white components that touch borders OR have large area in the gaps
for i in range(1, num_labels):
    area = stats[i, cv2.CC_STAT_AREA]
    x, y, bw, bh = stats[i, :4]
    
    # Check if touches border
    touches_border = (x == 0) or (y == 0) or (x + bw >= w) or (y + bh >= h)
    
    # Holes like between cups, arms:
    # They are also background if they are purely white (>244)
    # Let's check if area > 20
    if touches_border or area > 20:
        bg_mask[labels == i] = 255

print(f"Total bg pixels: {np.sum(bg_mask == 255)} / {w*h} ({np.sum(bg_mask == 255)/(w*h)*100:.1f}%)")

# Save a preview on black background to check
fg_mask = cv2.bitwise_not(bg_mask)

# For alpha channel:
# Start with fg_mask (255 inside, 0 outside)
alpha = fg_mask.astype(np.float32) / 255.0

# Edge smoothing & defringing for dark background:
# Blur the mask slightly at edges for anti-aliasing
alpha_blur = cv2.GaussianBlur(alpha, (3, 3), 0)

# Unmultiply white background at the edges so no white fringe on black background
# Where C = alpha * F + (1 - alpha) * 255
# F = (C - (1 - alpha) * 255) / max(alpha, 0.01)
result = np.zeros((h, w, 4), dtype=np.uint8)
img_f = img.astype(np.float32)

for c in range(3):
    # defringe: subtract white background contribution near boundaries
    f_chan = np.clip((img_f[:, :, c] - (1.0 - alpha_blur) * 255.0) / np.maximum(alpha_blur, 0.001), 0, 255)
    # in solid interior, keep original pixel
    f_chan = np.where(alpha > 0.98, img_f[:, :, c], f_chan)
    result[:, :, c] = f_chan.astype(np.uint8)

result[:, :, 3] = (alpha_blur * 255).astype(np.uint8)

# Save result
cv2.imwrite('scratch/cups_transparent.png', result)

# Create a composite on black background to inspect quality
black_bg = np.zeros((h, w, 3), dtype=np.uint8)
alpha_3 = np.dstack([alpha_blur, alpha_blur, alpha_blur])
comp_black = (result[:, :, :3].astype(np.float32) * alpha_3).astype(np.uint8)
cv2.imwrite('scratch/cups_on_black.png', comp_black)

print("Saved scratch/cups_transparent.png and scratch/cups_on_black.png")
