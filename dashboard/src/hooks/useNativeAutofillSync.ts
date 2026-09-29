import { useLayoutEffect, useRef } from 'react';
import type { FieldValues, Path, UseFormSetValue } from 'react-hook-form';

import { setFormValuesFromNativeForm } from '@/lib/syncNativeFormInputs';

/**
 * Nach Mount / spätem Autofill: DOM-Werte in RHF übernehmen (z. B. Safari Passwort speichern).
 */
export function useNativeAutofillSync<T extends FieldValues>(
  formId: string,
  fieldNames: readonly Path<T>[],
  setValue: UseFormSetValue<T>,
): void {
  const namesRef = useRef(fieldNames);
  namesRef.current = fieldNames;

  useLayoutEffect(() => {
    const sync = () => {
      const el = document.getElementById(formId);
      if (el instanceof HTMLFormElement) {
        setFormValuesFromNativeForm(el, namesRef.current, setValue);
      }
    };
    // Doppeltes rAF: Autofill erscheint oft einen Tick nach dem ersten Paint
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(sync);
    });
    const t = window.setTimeout(sync, 50);
    const t2 = window.setTimeout(sync, 300);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [formId, setValue]);
}
