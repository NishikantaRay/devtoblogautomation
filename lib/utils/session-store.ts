import type { BatchItem, ConversionResult } from "@/lib/types";

/**
 * Session persistence so a page refresh restores the current view instead of
 * dropping back to the landing page. sessionStorage: survives refresh,
 * scoped to the tab, gone when the tab closes.
 */
const STATE_KEY = "blog2dev-session";
const DRAFT_PREFIX = "blog2dev-draft:";

export interface PersistedState {
  result: ConversionResult | null;
  batch: BatchItem[] | null;
  editIndex: number | null;
}

export function loadSessionState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      result: parsed.result ?? null,
      batch: Array.isArray(parsed.batch) ? parsed.batch : null,
      editIndex: typeof parsed.editIndex === "number" ? parsed.editIndex : null,
    };
  } catch {
    return null;
  }
}

export function saveSessionState(state: PersistedState): void {
  try {
    if (!state.result && !state.batch) {
      sessionStorage.removeItem(STATE_KEY);
      return;
    }
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded (very large batches) — refresh will fall back to home.
  }
}

/** Storage key for an in-progress editor draft. */
export function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

export function loadDraft(id: string): string | null {
  try {
    return sessionStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}

export function saveDraft(id: string, text: string | null): void {
  try {
    if (text === null) sessionStorage.removeItem(draftKey(id));
    else sessionStorage.setItem(draftKey(id), text);
  } catch {
    // ignore
  }
}

export function clearAllDrafts(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
}
