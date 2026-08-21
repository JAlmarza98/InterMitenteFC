import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { Player, PlayersService } from '../../../core/services/players.service';
import { PlayerFormDialogComponent } from '../player-form-dialog/player-form-dialog.component';
import { IconComponent } from '../../../shared/icon/icon.component';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatSnackBarModule, MatProgressSpinnerModule, IconComponent],
  templateUrl: './player-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './player-list.component.scss',
})
export class PlayerListComponent {
  private readonly playersService = inject(PlayersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly canManage = this.auth.canManage;

  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly showInactive = signal(false);

  // Always fetched with inactive players included — the mockup's header
  // ("18 jugadores · 17 activos") needs both the total and the active-only
  // count at once, so "Mostrar inactivos" just toggles a client-side filter
  // over the one fetched list instead of triggering a network round trip.
  private readonly allPlayers = signal<Player[]>([]);

  readonly totalCount = computed(() => this.allPlayers().length);
  readonly activeCount = computed(() => this.allPlayers().filter((p) => p.active).length);

  readonly players = computed(() => {
    if (this.canManage() && this.showInactive()) return this.allPlayers();
    return this.allPlayers().filter((p) => p.active);
  });

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.loadError.set(false);
    this.playersService.list(true).subscribe({
      next: (res) => {
        this.allPlayers.set(res.players);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(true);
        this.showError(err, 'No se pudo cargar la plantilla');
      },
    });
  }

  toggleShowInactive() {
    this.showInactive.set(!this.showInactive());
  }

  positionLabel(player: Player): string {
    const base = player.position ?? '—';
    return player.secondaryPosition ? `${base} / ${player.secondaryPosition}` : base;
  }

  private showError(err: unknown, fallback: string) {
    const message = (err as { error?: { error?: string } })?.error?.error ?? fallback;
    this.snackBar.open(message, 'Cerrar', { duration: 3000 });
  }

  openCreate() {
    const ref = this.dialog.open(PlayerFormDialogComponent, { data: { player: null }, width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.playersService.create(result).subscribe({
        next: () => {
          this.snackBar.open('Jugador creado', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => this.showError(err, 'No se pudo crear el jugador'),
      });
    });
  }

  openEdit(player: Player) {
    const ref = this.dialog.open(PlayerFormDialogComponent, { data: { player }, width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.playersService.update(player.id, result).subscribe({
        next: () => {
          this.snackBar.open('Jugador actualizado', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => this.showError(err, 'No se pudo actualizar el jugador'),
      });
    });
  }

  toggleActive(player: Player) {
    this.playersService.update(player.id, { active: !player.active }).subscribe({
      next: () => {
        this.snackBar.open(player.active ? 'Jugador desactivado' : 'Jugador activado', 'Cerrar', {
          duration: 3000,
        });
        this.load();
      },
      error: (err) => this.showError(err, 'No se pudo actualizar el estado del jugador'),
    });
  }
}
