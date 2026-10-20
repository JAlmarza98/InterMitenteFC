/** Whether the current browser can share this file via the native OS share
 * sheet (where WhatsApp typically shows up as a target on mobile). */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

export type ShareResult = 'shared' | 'cancelled' | 'error';

export async function shareCallup(file: File, text: string, title: string): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], text, title });
    return 'shared';
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError' ? 'cancelled' : 'error';
  }
}

/** Native anchor-download — no library needed for a data: URL. */
export function downloadImage(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function copyCallupText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
