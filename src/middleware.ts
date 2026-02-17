/**
 * Next.js が読み込む middleware のエントリ。
 * 認証は proxy に委譲し、matcher で /dashboard と /login のみ対象にする。
 * /next.svg 等の静的アセットは proxy 内で早期 return するため 401 にならない。
 */
import { proxy, config } from "./proxy";

export const middleware = proxy;
export { config };
