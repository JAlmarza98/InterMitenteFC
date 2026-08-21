import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FlashOnChangeDirective } from './flash-on-change.directive';

@Component({
  standalone: true,
  imports: [FlashOnChangeDirective],
  template: `<span [appFlashOnChange]="value()">{{ value() }}</span>`,
})
class HostComponent {
  readonly value = signal(0);
}

describe('FlashOnChangeDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement.querySelector('span');
  });

  it('does not flash on the initial value', () => {
    expect(el.classList.contains('flash-pulse')).toBe(false);
  });

  it('adds flash-pulse when the bound value changes', () => {
    host.value.set(1);
    fixture.detectChanges();

    expect(el.classList.contains('flash-pulse')).toBe(true);
  });

  it('does not re-flash when set to the same value', () => {
    host.value.set(1);
    fixture.detectChanges();
    el.classList.remove('flash-pulse');

    host.value.set(1);
    fixture.detectChanges();

    expect(el.classList.contains('flash-pulse')).toBe(false);
  });

  it('removes flash-pulse after the animation window', fakeAsync(() => {
    host.value.set(1);
    fixture.detectChanges();
    expect(el.classList.contains('flash-pulse')).toBe(true);

    tick(900);

    expect(el.classList.contains('flash-pulse')).toBe(false);
  }));
});
