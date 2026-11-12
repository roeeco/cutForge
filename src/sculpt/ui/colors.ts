// Colours of solid shapes, by their place among the top-level shapes (no three.js here).
const COLORS = ['#e8a33d', '#4f9fd9', '#d9655b', '#5bb07a', '#a77bd1', '#e0c040', '#4fbdb5', '#d57ba8'];
export const shapeColor = (i: number) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];
