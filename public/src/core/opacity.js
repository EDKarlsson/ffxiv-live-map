// Opacity helpers shared by the overlay settings UI. Opacities are stored as
// fractions in [0, 1] (what Electron's setOpacity wants) but shown to the user
// as whole percentages. Kept pure + dependency-free so it's unit-testable.
export const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
export const fracToPct = (f) => Math.round(clamp01(f) * 100);
export const pctToFrac = (p) => clamp01(Number(p) / 100);
