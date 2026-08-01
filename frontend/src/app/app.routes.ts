import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { PendingApprovalComponent } from './features/auth/pending-approval/pending-approval.component';
import { UserApprovalComponent } from './features/admin/user-approval/user-approval.component';
import { SeasonListComponent } from './features/admin/season-list/season-list.component';
import { PlayerListComponent } from './features/players/player-list/player-list.component';
import { MatchListComponent } from './features/matches/match-list/match-list.component';
import { MatchDetailComponent } from './features/matches/match-detail/match-detail.component';
import { LiveMatchComponent } from './features/live-match/live-match.component';
import { MatchStatsComponent } from './features/matches/match-stats/match-stats.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'pending-approval', component: PendingApprovalComponent },
  { path: 'players', component: PlayerListComponent, canActivate: [authGuard] },
  { path: 'matches', component: MatchListComponent, canActivate: [authGuard] },
  { path: 'matches/:id', component: MatchDetailComponent, canActivate: [authGuard] },
  {
    path: 'matches/:id/live',
    component: LiveMatchComponent,
    canActivate: [authGuard, roleGuard('admin', 'coach')],
  },
  { path: 'matches/:id/stats', component: MatchStatsComponent, canActivate: [authGuard] },
  {
    path: 'admin/users',
    component: UserApprovalComponent,
    canActivate: [authGuard, roleGuard('admin')],
  },
  {
    path: 'admin/seasons',
    component: SeasonListComponent,
    canActivate: [authGuard, roleGuard('admin')],
  },
  { path: '**', redirectTo: '' },
];
