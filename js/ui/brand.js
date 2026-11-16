// The app's name and its turkey logo.
import { el } from "./dom.js";

export const BRAND = "BirdBrain";

// A turkey with a tail of autumn leaves. Drawn here as SVG so there is no image file to load.
// index.html has a second copy for the header; change both together.
const TURKEY_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BirdBrain turkey logo">
  <g transform="translate(32 40)">
    <ellipse rx="6" ry="20" fill="#8f1f2e" transform="rotate(-72) translate(0 -14)"/>
    <ellipse rx="6" ry="20" fill="#b8480f" transform="rotate(-36) translate(0 -14)"/>
    <ellipse rx="6" ry="20" fill="#e3a21a" transform="translate(0 -14)"/>
    <ellipse rx="6" ry="20" fill="#5b7c3a" transform="rotate(36) translate(0 -14)"/>
    <ellipse rx="6" ry="20" fill="#b8480f" transform="rotate(72) translate(0 -14)"/>
  </g>
  <circle cx="32" cy="42" r="13" fill="#6b3f22"/>
  <circle cx="32" cy="27" r="8" fill="#7d4a2a"/>
  <path d="M29 29 L35 29 L32 35 Z" fill="#f2b632"/>
  <ellipse cx="32.5" cy="36" rx="2" ry="3" fill="#c8202f"/>
  <circle cx="29" cy="25" r="1.4" fill="#fff"/><circle cx="35" cy="25" r="1.4" fill="#fff"/>
  <circle cx="29" cy="25" r=".7" fill="#222"/><circle cx="35" cy="25" r=".7" fill="#222"/>
  <g stroke="#ffe08a" stroke-width="2" stroke-linecap="round"><path d="M32 12 V8"/><path d="M24 15 L21 12"/><path d="M40 15 L43 12"/></g>
</svg>`;

/** The turkey mark as a DOM element. `size` is the CSS size, like "40px". */
export function logo(size = "40px") {
  const holder = el("span", { class: "brand-logo", "aria-hidden": "true" });
  holder.style.width = size;
  holder.style.height = size;
  holder.innerHTML = TURKEY_SVG; // fixed text above, never user data
  return holder;
}
