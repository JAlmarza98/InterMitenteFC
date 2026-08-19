import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  beforeEach(() => {
    snackBarSpy = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler, { provide: MatSnackBar, useValue: snackBarSpy }],
    });
    handler = TestBed.inject(GlobalErrorHandler);
    spyOn(console, 'error');
  });

  it('logs the error and shows a generic snackbar', () => {
    handler.handleError(new Error('boom'));

    expect(console.error).toHaveBeenCalledWith(jasmine.any(Error));
    expect(snackBarSpy.open).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second toast for an error thrown right after the first', () => {
    handler.handleError(new Error('first'));
    handler.handleError(new Error('second'));

    expect(snackBarSpy.open).toHaveBeenCalledTimes(1);
  });
});
