/**
 * Generates a consistent color for a species based on its ID
 * Uses HSL color space to ensure good visibility and distinctiveness
 */
export function getSpeciesColor(speciesId: string): string {
  // Create a simple hash from the species ID
  let hash = 0;
  for (let i = 0; i < speciesId.length; i++) {
    const char = speciesId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert hash to a hue value (0-360)
  const hue = Math.abs(hash % 360);

  // Use high saturation and medium lightness for visibility
  const saturation = 70 + (Math.abs(hash) % 20); // 70-90%
  const lightness = 45 + (Math.abs(hash) % 15); // 45-60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Gets a semi-transparent version of the species color for fills
 */
export function getSpeciesColorWithAlpha(speciesId: string, alpha: number = 0.6): string {
  const color = getSpeciesColor(speciesId);
  // Convert HSL to HSLA
  return color.replace("hsl", "hsla").replace(")", `, ${alpha})`);
}
