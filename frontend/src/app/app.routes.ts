import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'pending-approval',
    loadComponent: () =>
      import('./features/auth/pending-approval/pending-approval.component').then(
        (m) => m.PendingApprovalComponent
      ),
  },
  {
    path: 'players',
    loadComponent: () =>
      import('./features/players/player-list/player-list.component').then((m) => m.PlayerListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'matches',
    loadComponent: () =>
      import('./features/matches/match-list/match-list.component').then((m) => m.MatchListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'matches/:id',
    loadComponent: () =>
      import('./features/matches/match-detail/match-detail.component').then((m) => m.MatchDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'matches/:id/live',
    loadComponent: () => import('./features/live-match/live-match.component').then((m) => m.LiveMatchComponent),
    canActivate: [authGuard, roleGuard('admin', 'coach')],
  },
  {
    path: 'matches/:id/stats',
    loadComponent: () =>
      import('./features/matches/match-stats/match-stats.component').then((m) => m.MatchStatsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'stats',
    loadComponent: () =>
      import('./features/stats/season-stats/season-stats.component').then((m) => m.SeasonStatsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin/users',
    loadComponent: () =>
      import('./features/admin/user-approval/user-approval.component').then((m) => m.UserApprovalComponent),
    canActivate: [authGuard, roleGuard('admin')],
  },
  {
    path: 'admin/seasons',
    loadComponent: () =>
      import('./features/admin/season-list/season-list.component').then((m) => m.SeasonListComponent),
    canActivate: [authGuard, roleGuard('admin')],
  },
  { path: '**', redirectTo: '' },
];
