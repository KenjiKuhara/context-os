/**
 * status 候補の UI 用エントリポイント。
 * 定義は stateMachine に集約し、ここから re-export する。
 */

import {
  type Status,
  STATUS_LABELS,
  getValidTransitions,
  isValidStatus,
} from "@/lib/stateMachine";

export type { Status };
export { STATUS_LABELS, getValidTransitions, isValidStatus };
