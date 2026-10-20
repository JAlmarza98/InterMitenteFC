/** Fútbol-7 formation presets: shape + pitch layout for the formation-plan
 * dialog and the generated callup image. `id`s and slot `key`s here MUST
 * match backend/src/modules/matches/formationPresets.ts exactly — kept in
 * sync by hand, there's no shared package between frontend and backend in
 * this repo. */
export type FormationColorGroup = 'portero' | 'defensa' | 'medio' | 'delantero';

export interface FormationSlotDef {
  key: string;
  label: string;
  colorGroup: FormationColorGroup;
  /** Normalized pitch position, 0..1. x: left-to-right. y: 0 = attacking
   * third (top of the generated image), 1 = own goal (bottom). */
  x: number;
  y: number;
}

export interface FormationPreset {
  id: string;
  label: string;
  slots: FormationSlotDef[];
}

export const FORMATION_PRESETS: FormationPreset[] = [
  {
    id: '1-2-3-1',
    label: '1-2-3-1',
    slots: [
      { key: 'gk', label: 'Portero', colorGroup: 'portero', x: 0.5, y: 0.88 },
      { key: 'd1', label: 'Lateral izquierdo', colorGroup: 'defensa', x: 0.22, y: 0.63 },
      { key: 'd2', label: 'Lateral derecho', colorGroup: 'defensa', x: 0.78, y: 0.63 },
      { key: 'm1', label: 'Extremo izquierdo', colorGroup: 'medio', x: 0.15, y: 0.37 },
      { key: 'm2', label: 'Centrocampista', colorGroup: 'medio', x: 0.5, y: 0.37 },
      { key: 'm3', label: 'Extremo derecho', colorGroup: 'medio', x: 0.85, y: 0.37 },
      { key: 'f1', label: 'Delantero', colorGroup: 'delantero', x: 0.5, y: 0.12 },
    ],
  },
  {
    id: '1-3-2-1',
    label: '1-3-2-1',
    slots: [
      { key: 'gk', label: 'Portero', colorGroup: 'portero', x: 0.5, y: 0.88 },
      { key: 'd1', label: 'Lateral izquierdo', colorGroup: 'defensa', x: 0.15, y: 0.63 },
      { key: 'd2', label: 'Defensa central', colorGroup: 'defensa', x: 0.5, y: 0.63 },
      { key: 'd3', label: 'Lateral derecho', colorGroup: 'defensa', x: 0.85, y: 0.63 },
      { key: 'm1', label: 'Centrocampista', colorGroup: 'medio', x: 0.22, y: 0.37 },
      { key: 'm2', label: 'Centrocampista', colorGroup: 'medio', x: 0.78, y: 0.37 },
      { key: 'f1', label: 'Delantero', colorGroup: 'delantero', x: 0.5, y: 0.12 },
    ],
  },
  {
    id: '1-3-1-2',
    label: '1-3-1-2',
    slots: [
      { key: 'gk', label: 'Portero', colorGroup: 'portero', x: 0.5, y: 0.88 },
      { key: 'd1', label: 'Lateral izquierdo', colorGroup: 'defensa', x: 0.15, y: 0.63 },
      { key: 'd2', label: 'Defensa central', colorGroup: 'defensa', x: 0.5, y: 0.63 },
      { key: 'd3', label: 'Lateral derecho', colorGroup: 'defensa', x: 0.85, y: 0.63 },
      { key: 'm1', label: 'Centrocampista', colorGroup: 'medio', x: 0.5, y: 0.37 },
      { key: 'f1', label: 'Delantero', colorGroup: 'delantero', x: 0.22, y: 0.12 },
      { key: 'f2', label: 'Delantero', colorGroup: 'delantero', x: 0.78, y: 0.12 },
    ],
  },
  {
    id: '1-2-2-2',
    label: '1-2-2-2',
    slots: [
      { key: 'gk', label: 'Portero', colorGroup: 'portero', x: 0.5, y: 0.88 },
      { key: 'd1', label: 'Lateral izquierdo', colorGroup: 'defensa', x: 0.22, y: 0.63 },
      { key: 'd2', label: 'Lateral derecho', colorGroup: 'defensa', x: 0.78, y: 0.63 },
      { key: 'm1', label: 'Centrocampista', colorGroup: 'medio', x: 0.22, y: 0.37 },
      { key: 'm2', label: 'Centrocampista', colorGroup: 'medio', x: 0.78, y: 0.37 },
      { key: 'f1', label: 'Delantero', colorGroup: 'delantero', x: 0.22, y: 0.12 },
      { key: 'f2', label: 'Delantero', colorGroup: 'delantero', x: 0.78, y: 0.12 },
    ],
  },
];
