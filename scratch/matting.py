import cv2
import numpy as np

img = cv2.imread('apps/app/src/assets/Onboarding_cups.png', cv2.IMREAD_COLOR)
h, w = img.shape[:2]

# 1. Detect background:
# Pure white background
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# White mask: high threshold for true background seeds
seed_white = (img[:, :, 0] >= 240) & (img[:, :, 1] >= 240) & (img[:, :, 2] >= 240)
seed_white_u8 = seed_white.astype(np.uint8) * 255

num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(seed_white_u8)

bg_mask = np.zeros((h, w), dtype=np.uint8)
for i in range(1, num_labels):
    area = stats[i, cv2.CC_STAT_AREA]
    x, y, bw, bh = stats[i, :4]
    touches_border = (x == 0) or (y == 0) or (x + bw >= w) or (y + bh >= h)
    if touches_border or area > 15:
        bg_mask[labels == i] = 255

# fg_mask: 255 for foreground, 0 for background
fg_mask = cv2.bitwise_not(bg_mask)

# Erode foreground mask slightly to find the definite foreground core
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
fg_core = cv2.erode(fg_mask, kernel, iterations=1)

# Transition band (unknown region)
unknown = cv2.bitwise_xor(fg_mask, fg_core)
# Expand unknown band by 1-2 pixels into background to catch the anti-aliased edge
kernel5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
dilated_fg = cv2.dilate(fg_mask, kernel5, iterations=1)
unknown = cv2.bitwise_and(dilated_fg, cv2.bitwise_not(fg_core))

# Alpha initialization
alpha = np.zeros((h, w), dtype=np.float32)
alpha[fg_core == 255] = 1.0

# In the unknown band, calculate alpha based on distance from white (255, 255, 255)
# For white background, (255 - max(R,G,B)) is 0.
# The darker or more saturated the pixel, the higher the alpha.
# Specifically, max difference from white:
diff_from_white = 255.0 - np.min(img.astype(np.float32), axis=2) # 0 at white, up to 255 at black

# For pixels in the unknown region:
# If diff_from_white is very small (< 10), it's background (alpha = 0)
# Otherwise alpha ramps up smoothly
band_indices = unknown == 255
# Estimate local foreground color from nearest fg_core pixel or local color
# For black ink strokes (which are the majority of outlines):
# diff_from_white / 255 gives the exact alpha for black ink!
# For colored regions (orange, beige), diff_from_white is around 40-200.
# Normalize alpha in band:
alpha_band = np.clip((diff_from_white - 8.0) / (240.0 - 8.0), 0.0, 1.0)
# Use a smooth curve:
alpha_band = np.power(alpha_band, 0.85)

alpha[band_indices] = alpha_band[band_indices]
# Outside dilated fg, ensure strictly 0
alpha[dilated_fg == 0] = 0.0

# Smooth alpha slightly along edges
alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
alpha[fg_core == 255] = 1.0
alpha[dilated_fg == 0] = 0.0

# Now Defringing:
# C = alpha * F + (1 - alpha) * 255
# F = (C - (1 - alpha) * 255) / alpha
# When rendered on black background B=0:
# Final = alpha * F = C - (1 - alpha) * 255
result = np.zeros((h, w, 4), dtype=np.uint8)
img_f = img.astype(np.float32)

for c in range(3):
    # defringed foreground:
    f_c = np.where(alpha > 0.01, (img_f[:, :, c] - (1.0 - alpha) * 255.0) / np.maximum(alpha, 0.01), 0.0)
    f_c = np.clip(f_c, 0.0, 255.0)
    result[:, :, c] = f_c.astype(np.uint8)

result[:, :, 3] = (np.clip(alpha, 0.0, 1.0) * 255.0).astype(np.uint8)

# Save transparent result
cv2.imwrite('scratch/cups_clean.png', result)

# Save on black background
black_bg = np.zeros((h, w, 3), dtype=np.uint8)
alpha_3 = np.dstack([alpha, alpha, alpha])
comp_black = np.clip(result[:, :, :3].astype(np.float32) * alpha_3, 0, 255).astype(np.uint8)
cv2.imwrite('scratch/cups_clean_on_black.png', comp_black)

print("Saved scratch/cups_clean.png and scratch/cups_clean_on_black.png")
