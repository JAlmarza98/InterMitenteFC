import { Component, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { Player, PlayersService } from '../../../core/services/players.service';
import { PlayerFormDialogComponent } from '../player-form-dialog/player-form-dialog.component';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './player-list.component.html',
  styleUrl: './player-list.component.scss',
})
export class PlayerListComponent {
  private readonly playersService = inject(PlayersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly canManage = this.auth.canManage;
  readonly displayedColumns = ['jerseyNumber', 'name', 'position', 'status', 'actions'];

  readonly players = signal<Player[]>([]);
  readonly loading = signal(false);
  readonly showInactive = signal(false);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.playersService.list(this.showInactive()).subscribe({
      next: (res) => {
        this.players.set(res.players);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleShowInactive() {
    this.showInactive.set(!this.showInactive());
    this.load();
  }

  openCreate() {
    const ref = this.dialog.open(PlayerFormDialogComponent, { data: { player: null }, width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.playersService.create(result).subscribe(() => {
        this.snackBar.open('Jugador creado', 'Cerrar', { duration: 3000 });
        this.load();
      });
    });
  }

  openEdit(player: Player) {
    const ref = this.dialog.open(PlayerFormDialogComponent, { data: { player }, width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.playersService.update(player.id, result).subscribe(() => {
        this.snackBar.open('Jugador actualizado', 'Cerrar', { duration: 3000 });
        this.load();
      });
    });
  }

  toggleActive(player: Player) {
    this.playersService.update(player.id, { active: !player.active }).subscribe(() => {
      this.snackBar.open(player.active ? 'Jugador desactivado' : 'Jugador activado', 'Cerrar', {
        duration: 3000,
      });
      this.load();
    });
  }
}
