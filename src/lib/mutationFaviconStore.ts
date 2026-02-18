/**
 * ファビコン用: 書き込み系 API の pending カウンタと最後の成否。
 * グローバルに 1 つだけ持ち、increment/decrement で購読者に通知する。
 */

let pendingCount = 0;
let lastFailure = false;
const listeners = new Set<() => void>();

/** useSyncExternalStore は参照が同じなら「変更なし」とみなすため、同じ値のときは同じ配列を返す */
let cachedSnapshot: [number, boolean] = [0, false];

function notify() {
  listeners.forEach((cb) => cb());
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot(): [number, boolean] {
  if (typeof window === "undefined") return [0, false];
  if (cachedSnapshot[0] === pendingCount && cachedSnapshot[1] === lastFailure) {
    return cachedSnapshot;
  }
  cachedSnapshot = [pendingCount, lastFailure];
  return cachedSnapshot;
}

export function increment(): void {
  pendingCount += 1;
  lastFailure = false;
  notify();
}

export function decrement(success: boolean): void {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount === 0) {
    lastFailure = !success;
  }
  notify();
}

/** 失敗表示を消したあとに lastFailure をリセットする用（FaviconUpdater のタイマーから呼ぶ） */
export function clearFailure(): void {
  if (lastFailure) {
    lastFailure = false;
    notify();
  }
}
