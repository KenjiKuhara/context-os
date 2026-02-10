/**
 * Phase6-A: ダッシュボード用ツリー構築
 * nodes + node_children から表示用ツリーを組み立てる。
 * 真実: node_children を優先、parent_id は fallback。循環検知・深さ制限あり。
 */

export interface NodeChildLink {
  parent_id: string;
  child_id: string;
  created_at?: string;
}

export interface TreeNode {
  id: string;
  node: Record<string, unknown>;
  children: TreeNode[];
  depth: number;
  /** 循環により打ち切った場合 true */
  cycleDetected?: boolean;
}

const MAX_DEPTH = 5;

/**
 * 親→子のマップを構築する。
 * 優先: node_children。無い場合は nodes の parent_id から補完。
 */
function buildParentToChildren(
  nodeIds: Set<string>,
  nodeChildren: NodeChildLink[],
  nodes: Array<{ id: string; parent_id?: string | null }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // node_children を優先（明示的な親子リンク）
  for (const link of nodeChildren) {
    if (!nodeIds.has(link.parent_id) || !nodeIds.has(link.child_id)) continue;
    const list = map.get(link.parent_id) ?? [];
    if (!list.includes(link.child_id)) list.push(link.child_id);
    map.set(link.parent_id, list);
  }

  // parent_id を fallback（node_children に無い親子を補完）
  for (const n of nodes) {
    const parentId = n.parent_id?.trim();
    if (!parentId || !nodeIds.has(parentId) || parentId === n.id) continue;
    const list = map.get(parentId) ?? [];
    if (!list.includes(n.id)) list.push(n.id);
    map.set(parentId, list);
  }

  return map;
}

/**
 * ルート ID のリスト（一覧内で「誰の子でもない」ノード = 表示ルート）
 */
function findRootIds(
  nodes: Array<{ id: string }>,
  parentToChildren: Map<string, string[]>
): string[] {
  const hasParentInSet = new Set<string>();
  for (const childIds of parentToChildren.values()) {
    for (const cid of childIds) hasParentInSet.add(cid);
  }
  const rootSet = new Set<string>();
  for (const n of nodes) {
    if (!hasParentInSet.has(n.id)) rootSet.add(n.id);
  }
  return rootSet.size > 0 ? [...rootSet] : nodes.map((n) => n.id);
}

/**
 * 再帰でツリーノードを構築。循環検知（visited）・深さ制限（MAX_DEPTH）。
 */
function buildTreeRec(
  nodeId: string,
  nodeMap: Map<string, Record<string, unknown>>,
  parentToChildren: Map<string, string[]>,
  visited: Set<string>,
  depth: number
): TreeNode {
  const node = nodeMap.get(nodeId);
  const children: TreeNode[] = [];

  if (depth >= MAX_DEPTH) {
    return {
      id: nodeId,
      node: node ?? { id: nodeId },
      children: [],
      depth,
    };
  }

  if (visited.has(nodeId)) {
    return {
      id: nodeId,
      node: node ?? { id: nodeId },
      children: [],
      depth,
      cycleDetected: true,
    };
  }

  const childIds = parentToChildren.get(nodeId) ?? [];
  if (childIds.length > 0) {
    visited.add(nodeId);
    for (const cid of childIds) {
      children.push(
        buildTreeRec(cid, nodeMap, parentToChildren, visited, depth + 1)
      );
    }
    visited.delete(nodeId);
  }

  return {
    id: nodeId,
    node: node ?? { id: nodeId },
    children,
    depth,
  };
}

/**
 * 表示用ツリーを組み立てる。
 * @param nodes - 表示対象ノード一覧（トレーでフィルタ済み想定）
 * @param nodeChildren - API から返る node_children（parent_id, child_id, created_at）
 * @returns ルートから並んだ TreeNode の配列。循環は検知して打ち切り。
 */
export function buildTree(
  nodes: Array<Record<string, unknown> & { id: string; parent_id?: string | null }>,
  nodeChildren: NodeChildLink[]
): TreeNode[] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const parentToChildren = buildParentToChildren(
    nodeIds,
    nodeChildren,
    nodes as Array<{ id: string; parent_id?: string | null }>
  );

  const rootIds = findRootIds(
    nodes as Array<{ id: string; parent_id?: string | null }>,
    parentToChildren
  );

  const visited = new Set<string>();
  const result: TreeNode[] = [];

  for (const rid of rootIds) {
    if (!nodeIds.has(rid)) continue;
    result.push(
      buildTreeRec(rid, nodeMap, parentToChildren, visited, 0)
    );
  }

  return result;
}
