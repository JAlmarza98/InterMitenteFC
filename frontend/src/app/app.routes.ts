import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { PendingApprovalComponent } from './features/auth/pending-approval/pending-approval.component';
import { UserApprovalComponent } from './features/admin/user-approval/user-approval.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'pending-approval', component: PendingApprovalComponent },
  {
    path: 'admin/users',
    component: UserApprovalComponent,
    canActivate: [authGuard, roleGuard('admin')],
  },
  { path: '**', redirectTo: '' },
];
