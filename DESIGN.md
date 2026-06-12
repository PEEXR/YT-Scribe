# Design System Specification: NEO-UI

NEO-UI is a utility-first, copy-and-paste component library designed to bring the **Neo-Brutalism** aesthetic to modern web applications. This document defines the core principles, visual language, and structural patterns used across the library.

---

## 1. Core Philosophy
Neo-Brutalism in digital design is defined by its refusal to blend in. It prioritizes "raw" functionality and visual impact over traditional minimalist "soft" UI.

*   **High Contrast:** Every element should stand out. We prioritize stark blacks against bright, saturated backgrounds.
*   **Bold Geometrics:** Rectangles, squares, and hard edges. Avoid excessive border-radius; prefer structural integrity over "glassmorphism" softness.
*   **Tactile Feedback:** Interaction is represented by hard, offset shadows rather than subtle color shifts or blurs.
*   **Accessibility:** By keeping contrast high, the design remains readable and distinct.

---

## 2. Design Tokens
The following tokens form the base layer of the library. They should be applied consistently to maintain the library's identity.

### A. Color Palette
*   **Strokes/Borders:** Always use `border-black` (or `#000000`).
*   **Shadows:** Use solid, non-blurred offsets: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]` or similar.
*   **Backgrounds:** High-saturation, vibrant colors or clean white (`bg-white`) for base layers.

### B. Typography
*   **Weight:** Sans-serif fonts with heavy, distinct line weights.
*   **Alignment:** Generally flush-left to maintain a grid-aligned, rigid structure.

### C. The "Neo" Interaction (The Hover Effect)
The library’s signature interaction is the "Button Pop."
*   **Default State:** `border-2 border-black` with no shadow or a minimal 2px offset.
*   **Active/Hover State:** `shadow-[8px_8px_0px_rgba(0,0,0,1)]` or `translate-x-[2px] translate-y-[2px]`.
*   *Principle:* The element should feel like a physical, movable block that slides along the screen plane.

---

## 3. Structural Patterns
NEO-UI components are built using **Tailwind CSS** utilities to ensure ease of copying and customization.

### Component Anatomy
1.  **Container:** `border-2 border-black` is mandatory for all primary containers (Cards, Inputs).
2.  **Elevation:** No `box-shadow` blurs (e.g., `shadow-lg` is forbidden). Use custom utilities that generate solid, hard-edged box shadows.
3.  **Spacing:** Generous padding within the hard borders to allow content to "breathe" despite the heavy framing.

---

## 4. Component Implementation Guide
When contributing or extending the library, follow these structural guidelines:

*   **Buttons:** Must have a `border-2 border-black` base. Hover state should trigger a solid shadow shift.
*   **Cards:** Use `border-2 border-black` for the outer shell. If there is a header/footer, use `border-b-2 border-black` for internal separators.
*   **Inputs:** Keep the border thickness identical to the button components to maintain visual unity. Avoid standard browser focus rings; use hard black focus borders instead.

---

## 5. Usage Guidelines
*   **Copy-Paste Philosophy:** Components are not intended to be installed as an NPM package. They are atomic blocks designed to be copied directly into the `components/` directory of a project.
*   **Customization:** Users are encouraged to modify the colors in the Tailwind utility classes to match their brand, provided they maintain the **Border + Solid Shadow** pattern.
*   **Constraint:** Do not mix "soft" UI elements (rounded corners > 12px, soft drop shadows, or gradients) into this library. Keep it raw, hard, and high-contrast.

---

*Documentation generated for NEO-UI.*