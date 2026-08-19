import { ErrorHandler, Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Angular's default ErrorHandler just logs to the console — an uncaught
 * error anywhere in the app (a bad template expression, a rejected promise
 * with no .catch, an RxJS pipe that forgot an error handler) leaves the
 * user staring at a screen that silently stopped working, with no signal
 * anything went wrong. This keeps the console log (still useful for
 * debugging) and adds the one thing that was missing: telling the user.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly snackBar = inject(MatSnackBar);
  private lastShownAt = 0;

  handleError(error: unknown): void {
    console.error(error);

    // A single bug can throw repeatedly (e.g. on every change-detection
    // cycle) — avoid stacking a toast per throw.
    const now = Date.now();
    if (now - this.lastShownAt < 5000) return;
    this.lastShownAt = now;

    this.snackBar.open('Ha ocurrido un error inesperado. Si persiste, recarga la página.', 'Cerrar', {
      duration: 5000,
    });
  }
}
