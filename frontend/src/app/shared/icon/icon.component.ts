import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// Rebrand (2026): hand-drawn stroke icons replacing the Material Icons font,
// ported from the approved design mockups so every screen keeps the exact
// glyphs already signed off — not a generic icon pack. Grown incrementally
// as each phase of the rebrand migrates its own templates off <mat-icon>;
// `<mat-icon>` and this component are meant to coexist meanwhile (see the
// migration note on ICONS below).
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  matches: '<circle cx="12" cy="12" r="9"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  players:
    '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M14.5 14.2c2.6.4 4.5 2.7 4.5 5.3"/>',
  stats: '<path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  'user-add':
    '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"/><path d="M18 8v6M15 11h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  delete: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3 2-1 3h-4l-1-3z"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  hourglass: '<path d="M6 2h12M6 22h12"/><path d="M6 2c0 6 6 6 6 10s-6 4-6 10M18 2c0 6-6 6-6 10s6 4 6 10"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
  star: '<path d="M12 2l2.6 5.8L21 9l-4.5 4.2L17.6 20 12 16.8 6.4 20l1.1-6.8L3 9l6.4-1.2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
  assist: '<path d="M7 12a5 5 0 0 1 10 0"/><circle cx="12" cy="6" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  standalone: true,
  // Size is set via an inline `width: var(--icon-size, Npx)` style, not just
  // the SVG width/height attributes — Angular Material's own icon-button CSS
  // targets a bare `svg` selector to force Material Icons' usual 24px, which
  // has higher specificity than a plain component stylesheet rule and was
  // silently overriding our `size` input for icons inside mat-icon-button
  // (e.g. the header logout button always rendered at 24px regardless of
  // `[size]="18"`). An inline style always beats that, `!important` or not —
  // but routing it through a custom property (rather than a plain px value)
  // means an ordinary ancestor rule can still resize it per breakpoint by
  // setting --icon-size, e.g. `.shortcut-card { --icon-size: 20px }` /
  // `@media (min-width:768px) { --icon-size: 22px }`, without that override
  // losing to Material the same way a direct `app-icon svg { width }` rule
  // would. `display:block` on the svg avoids the separate inline-baseline
  // gap that made it sit off-center vertically inside flex-centered buttons
  // even when sized correctly.
  template: `<svg
    [attr.width]="size"
    [attr.height]="size"
    [style.width]="'var(--icon-size, ' + size + 'px)'"
    [style.height]="'var(--icon-size, ' + size + 'px)'"
    style="display: block"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    [innerHTML]="paths"
  ></svg>`,
  host: { style: 'display: inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  @Input({ required: true }) name!: IconName;
  @Input() size = 24;
  // 1.75 matches every mockup icon except the active bottom-nav "Inicio"
  // glyph and the hero card's calendar icon, both drawn at 1.9 — pass
  // [strokeWidth]="1.9" explicitly at those two call sites.
  @Input() strokeWidth = 1.75;

  get paths(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name]);
  }
}
