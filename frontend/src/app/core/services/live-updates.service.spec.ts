import { TestBed } from '@angular/core/testing';
import { LiveUpdatesService } from './live-updates.service';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(
    public url: string,
    public init?: EventSourceInit
  ) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe('LiveUpdatesService', () => {
  let service: LiveUpdatesService;
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = window.EventSource;
    FakeEventSource.instances = [];
    (window as unknown as { EventSource: typeof EventSource }).EventSource =
      FakeEventSource as unknown as typeof EventSource;

    TestBed.configureTestingModule({});
    service = TestBed.inject(LiveUpdatesService);
  });

  afterEach(() => {
    (window as unknown as { EventSource: typeof EventSource }).EventSource = originalEventSource;
  });

  it('connect() opens exactly one EventSource with credentials, to the shared endpoint', () => {
    service.connect();
    service.connect(); // a second call must not open a second connection

    expect(FakeEventSource.instances.length).toBe(1);
    const instance = FakeEventSource.instances[0];
    expect(instance.url).toBe('/api/live-updates');
    expect(instance.init).toEqual({ withCredentials: true });
  });

  it('forwards parsed messages on updates$', () => {
    service.connect();
    const received: unknown[] = [];
    service.updates$.subscribe((update) => received.push(update));

    const instance = FakeEventSource.instances[0] as unknown as FakeEventSource;
    instance.emit({ matchId: 'match-1', at: '2026-08-21T10:00:00.000Z' });

    expect(received).toEqual([{ matchId: 'match-1', at: '2026-08-21T10:00:00.000Z' }]);
  });

  it('disconnect() closes the connection and allows reconnecting', () => {
    service.connect();
    const first = FakeEventSource.instances[0];
    service.disconnect();
    expect(first.closed).toBe(true);

    service.connect();
    expect(FakeEventSource.instances.length).toBe(2);
  });
});
