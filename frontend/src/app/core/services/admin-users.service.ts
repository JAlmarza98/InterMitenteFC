import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CurrentUser, UserRole, UserStatus } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  list(status?: UserStatus) {
    const params: Record<string, string> = status ? { status } : {};
    return this.http.get<{ users: CurrentUser[] }>('/api/admin/users', { params });
  }

  approve(id: string) {
    return this.http.patch<{ user: CurrentUser }>(`/api/admin/users/${id}/approve`, {});
  }

  reject(id: string) {
    return this.http.patch<{ user: CurrentUser }>(`/api/admin/users/${id}/reject`, {});
  }

  updateRole(id: string, role: UserRole) {
    return this.http.patch<{ user: CurrentUser }>(`/api/admin/users/${id}/role`, { role });
  }
}
