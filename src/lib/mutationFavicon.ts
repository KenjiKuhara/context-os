/**
 * 書き込み系 API 実行時にファビコンで「更新中」を表示するためのラッパー。
 * 呼び出し元は withMutation で Promise を返す処理を包む。
 */

import { increment, decrement } from "./mutationFaviconStore";

/**
 * fn を実行し、開始時に increment、解決/拒否時に decrement(success/false) する。
 * 返す Promise は元の fn の結果をそのまま伝播する（catch は呼び出し元で使える）。
 */
export function withMutation<T>(fn: () => Promise<T>): Promise<T> {
  increment();
  const p = fn();
  return p.then(
    (value) => {
      decrement(true);
      return value;
    },
    (reason) => {
      decrement(false);
      throw reason;
    }
  );
}
