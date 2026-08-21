import { Directive, DestroyRef, ElementRef, inject, input, effect } from '@angular/core';

/** Briefly washes the host element in the amber accent whenever the bound
 * value changes — a live score updating from a push notification (or
 * anyone else's action) is easy to miss as a silent DOM update; this gives
 * it the same "something just happened" language as the live-status pulse
 * elsewhere in the app, without needing every consumer to hand-roll its
 * own timer. Skips the very first value (mount shouldn't flash), and
 * restarts cleanly if the value changes again before the previous flash
 * finished. `background-color` only, deliberately — it's the one visual
 * property that behaves identically on a `<span>`, a `<div>` and an
 * `<input>` alike, so this one class works on every element it's applied
 * to below without needing a `display` override that could disturb that
 * element's own layout. */
@Directive({
  selector: '[appFlashOnChange]',
  standalone: true,
})
export class FlashOnChangeDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly appFlashOnChange = input<unknown>();

  private previous: unknown;
  private isFirstValue = true;
  private clearHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const value = this.appFlashOnChange();

      if (this.isFirstValue) {
        this.isFirstValue = false;
        this.previous = value;
        return;
      }
      if (value === this.previous) return;
      this.previous = value;

      const classList = this.el.nativeElement.classList;
      classList.remove('flash-pulse');
      void this.el.nativeElement.offsetWidth; // force reflow so the class re-triggers the animation
      classList.add('flash-pulse');

      if (this.clearHandle) clearTimeout(this.clearHandle);
      this.clearHandle = setTimeout(() => classList.remove('flash-pulse'), 900);
    });

    this.destroyRef.onDestroy(() => {
      if (this.clearHandle) clearTimeout(this.clearHandle);
    });
  }
}
