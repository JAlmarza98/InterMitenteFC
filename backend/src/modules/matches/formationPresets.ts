/** Minimal server-side formation registry: just enough to validate a
 * PUT /formation payload's shape (slot count/keys). Rendering data
 * (coordinates, colors, position labels) lives only in the frontend's
 * mirror of this file (frontend/src/app/features/matches/formation/
 * formation-presets.ts) — keep the `id`s and `slotKeys` in both files in
 * sync by hand; there's no shared package between frontend and backend
 * in this repo to enforce it automatically. */
export interface FormationPresetDef {
  id: string;
  slotKeys: string[];
}

export const FORMATION_PRESETS: Record<string, FormationPresetDef> = {
  "1-2-3-1": { id: "1-2-3-1", slotKeys: ["gk", "d1", "d2", "m1", "m2", "m3", "f1"] },
  "1-3-2-1": { id: "1-3-2-1", slotKeys: ["gk", "d1", "d2", "d3", "m1", "m2", "f1"] },
  "1-3-1-2": { id: "1-3-1-2", slotKeys: ["gk", "d1", "d2", "d3", "m1", "f1", "f2"] },
  "1-2-2-2": { id: "1-2-2-2", slotKeys: ["gk", "d1", "d2", "m1", "m2", "f1", "f2"] },
};
