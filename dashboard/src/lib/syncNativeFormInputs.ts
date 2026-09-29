import type { FieldValues, Path, PathValue, UseFormSetValue } from 'react-hook-form';

/**
 * Browser-Autofill (Safari, Chrome, Passwort-Manager) setzt oft nur den DOM-Wert,
 * ohne input/change-Events — dann bleibt react-hook-form leer und die Validierung scheitert.
 */
export function setFormValuesFromNativeForm<T extends FieldValues>(
  formEl: HTMLFormElement,
  fieldNames: readonly Path<T>[],
  setValue: UseFormSetValue<T>,
): void {
  for (const name of fieldNames) {
    const key = String(name);
    const el = formEl.elements.namedItem(key);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setValue(name, el.value as PathValue<T, typeof name>, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
    }
  }
}
