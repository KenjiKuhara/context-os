/**
 * Phase 4: dashboard 入力の型と validNodeIds 抽出。
 * クライアントに validNodeIds を渡させず、サーバーで dashboard から抽出する。
 */

export type DashboardTrays = Record<
  string,
  Array<{ id?: string; title?: string; status?: string; [k: string]: unknown }>
>;

export interface RunInputDashboard {
  trays: DashboardTrays;
}

/**
 * dashboard.trays を flatten し、id が存在する Node の id 一覧を返す。
 */
export function extractValidNodeIds(dashboard: RunInputDashboard): string[] {
  const ids: string[] = [];
  if (!dashboard?.trays || typeof dashboard.trays !== "object") return ids;
  for (const arr of Object.values(dashboard.trays)) {
    if (!Array.isArray(arr)) continue;
    for (const n of arr) {
      if (n && typeof n.id === "string" && n.id.trim()) ids.push(n.id.trim());
    }
  }
  return [...new Set(ids)];
}

/**
 * focusNodeId または trays から 1 件取得。Advisor の対象 Node を決める。
 */
export function resolveFocusNode(
  dashboard: RunInputDashboard,
  focusNodeId?: string | null
): { id: string; title?: string; status?: string } | null {
  if (!dashboard?.trays || typeof dashboard.trays !== "object") return null;
  const flat = Object.values(dashboard.trays).flat();
  if (focusNodeId) {
    const found = flat.find((n) => n?.id === focusNodeId);
    return found && typeof found.id === "string" ? { id: found.id, title: String(found.title ?? ""), status: String(found.status ?? "") } : null;
  }
  const first = flat.find((n) => n?.id);
  return first && typeof first.id === "string" ? { id: first.id, title: String(first.title ?? ""), status: String(first.status ?? "") } : null;
}
