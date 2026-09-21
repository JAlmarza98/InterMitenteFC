import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Group-level check shared by the reset and change password forms: the
 * confirmation field must equal the new password. */
export function passwordsMatch(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null =>
    group.get(passwordKey)?.value === group.get(confirmKey)?.value ? null : { passwordsMismatch: true };
}
