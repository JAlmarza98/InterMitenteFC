import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home',
  standalone: true,
  template: `
    <h1>Inter Mitente</h1>
    <p>Estado de la API: {{ apiStatus() }}</p>
  `,
})
export class HomeComponent {
  private readonly http = inject(HttpClient);
  readonly apiStatus = signal('comprobando...');

  constructor() {
    this.http.get<{ status: string }>('/api/health').subscribe({
      next: (res) => this.apiStatus.set(res.status),
      error: () => this.apiStatus.set('no disponible'),
    });
  }
}
