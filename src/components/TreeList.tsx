"use client";

/**
 * Phase6-A: ツリー表示リスト
 * buildTree で組み立てた TreeNode を開閉付きで表示。詳細パネル連携用に onSelectNode を呼ぶ。
 * キーボード: → で展開、← で閉じる（選択中ノードにのみ反応、ツリー領域フォーカス時のみ）。
 */

import { useMemo, useCallback, useState } from "react";
import type { TreeNode } from "@/lib/dashboardTree";

const INDENT_PX = 20;
const GUIDE_COLOR = "rgba(0,0,0,0.08)";

function walkTree(
  roots: TreeNode[],
  visit: (tn: TreeNode, parentId: string | null) => void,
  parentId: string | null = null
) {
  for (const tn of roots) {
    visit(tn, parentId);
    walkTree(tn.children, visit, tn.id);
  }
}

/** roots から parentById と treeNodeById を構築（キーボードナビ用・表示順がソース） */
function buildTreeMaps(roots: TreeNode[]): {
  parentById: Map<string, string>;
  treeNodeById: Map<string, TreeNode>;
} {
  const parentById = new Map<string, string>();
  const treeNodeById = new Map<string, TreeNode>();
  walkTree(roots, (tn, parentId) => {
    if (parentId != null) parentById.set(tn.id, parentId);
    treeNodeById.set(tn.id, tn);
  });
  return { parentById, treeNodeById };
}

/**
 * 現在画面に表示されているノード ID を、描画順（DFS・展開状態に従う）で返す。
 * TreeList の表示順と一致させる。
 */
function buildVisibleIds(
  roots: TreeNode[],
  expandedSet: Set<string>
): string[] {
  const out: string[] = [];
  function walk(nodes: TreeNode[]) {
    for (const tn of nodes) {
      out.push(tn.id);
      if (expandedSet.has(tn.id) && tn.children.length > 0) {
        for (const c of tn.children) {
          if (!c.cycleDetected) walk([c]);
        }
      }
    }
  }
  walk(roots);
  return out;
}

/** rootId の配下の全子孫 ID を DFS で収集（ArrowLeft でサブツリー閉じる用） */
function collectDescendantIds(
  rootId: string,
  treeNodeById: Map<string, TreeNode>
): string[] {
  const out: string[] = [];
  const root = treeNodeById.get(rootId);
  if (!root) return out;
  function walk(tn: TreeNode) {
    for (const c of tn.children) {
      out.push(c.id);
      walk(c);
    }
  }
  walk(root);
  return out;
}

export interface TreeListProps {
  roots: TreeNode[];
  expandedSet: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  /** キーボード → 用: 指定ノードを展開する */
  onExpand?: (nodeId: string) => void;
  /** キーボード ← 用: 指定ノードを閉じる */
  onCollapse?: (nodeId: string) => void;
  /** キーボード ← 用: 複数 ID をまとめて閉じる（サブツリー閉じ） */
  onCollapseIds?: (ids: string[]) => void;
  onSelectNode: (node: Record<string, unknown>) => void;
  selectedId: string | null;
  getNodeTitle: (node: Record<string, unknown>) => string;
  getNodeSubtext: (node: Record<string, unknown>) => string;
}

function TreeRow({
  node,
  depth,
  isExpanded,
  hasChildren,
  childCount,
  onToggle,
  onSelect,
  isSelected,
  getTitle,
  getSubtext,
}: {
  node: Record<string, unknown>;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  childCount: number;
  onToggle: () => void;
  onSelect: () => void;
  isSelected: boolean;
  getTitle: (n: Record<string, unknown>) => string;
  getSubtext: (n: Record<string, unknown>) => string;
}) {
  const nodeId = node.id as string;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 4,
        paddingLeft: depth * INDENT_PX,
        paddingRight: 12,
        paddingTop: 8,
        paddingBottom: 8,
        borderTop: "1px solid #eee",
        background: isSelected ? "#f5f7ff" : "white",
        cursor: "pointer",
        borderLeft: depth > 0 ? `2px solid ${GUIDE_COLOR}` : undefined,
        marginLeft: depth > 0 ? 0 : undefined,
      }}
      onClick={onSelect}
    >
      <button
        type="button"
        aria-label={isExpanded ? "閉じる" : "開く"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          width: 22,
          height: 22,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: hasChildren ? "pointer" : "default",
          color: hasChildren ? "#333" : "#ccc",
          flexShrink: 0,
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasChildren ? (isExpanded ? "▼" : "▶") : "·"}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {getTitle(node)}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {getSubtext(node) || "（途中内容なし）"}
        </div>
        {hasChildren && (
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            子{childCount}件
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#333", whiteSpace: "nowrap" }}>
        {(node.status as string) ?? ""}
      </div>
    </div>
  );
}

function renderNode(
  tn: TreeNode,
  props: TreeListProps,
  depth: number
): React.ReactNode {
  const id = tn.id;
  const hasChildren = tn.children.length > 0;
  const isExpanded = props.expandedSet.has(id);

  return (
    <div key={id}>
      <TreeRow
        node={tn.node}
        depth={depth}
        isExpanded={isExpanded}
        hasChildren={hasChildren}
        childCount={tn.children.length}
        onToggle={() => props.onToggleExpand(id)}
        onSelect={() => props.onSelectNode(tn.node)}
        isSelected={props.selectedId === id}
        getTitle={props.getNodeTitle}
        getSubtext={props.getNodeSubtext}
      />
      {hasChildren && isExpanded && (
        <div>
          {tn.children.map((c) =>
            c.cycleDetected ? (
              <div
                key={c.id}
                style={{
                  paddingLeft: (depth + 1) * INDENT_PX + 22,
                  paddingTop: 4,
                  paddingBottom: 4,
                  fontSize: 12,
                  color: "#c62828",
                }}
              >
                （循環のため表示を打ち切り）
              </div>
            ) : (
              renderNode(c, props, depth + 1)
            )
          )}
        </div>
      )}
    </div>
  );
}

export function TreeList(props: TreeListProps) {
  const { parentById, treeNodeById } = useMemo(
    () => buildTreeMaps(props.roots),
    [props.roots]
  );

  const visibleIds = useMemo(
    () => buildVisibleIds(props.roots, props.expandedSet),
    [props.roots, props.expandedSet]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName?.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      ) {
        return;
      }

      const {
        selectedId,
        expandedSet,
        onExpand,
        onCollapse,
        onCollapseIds,
        onSelectNode,
      } = props;
      if (!selectedId) return;

      if (e.key === "ArrowRight") {
        const current = treeNodeById.get(selectedId);
        if (current && current.children.length > 0) {
          if (!expandedSet.has(selectedId) && onExpand) {
            onExpand(selectedId);
          }
          const firstChild = current.children[0];
          if (firstChild && !firstChild.cycleDetected) {
            onSelectNode(firstChild.node);
          }
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        const parentId = parentById.get(selectedId);
        const current = treeNodeById.get(selectedId);
        const hasChildren = (current?.children.length ?? 0) > 0;

        if (parentId != null && expandedSet.has(parentId)) {
          // CHILD selected: collapse parent, select parent
          if (onCollapse) onCollapse(parentId);
          const parentNode = treeNodeById.get(parentId);
          if (parentNode) onSelectNode(parentNode.node);
          e.preventDefault();
          return;
        }

        if (hasChildren) {
          // PARENT selected: collapse self and all descendants, keep selection
          const descendantIds = collectDescendantIds(selectedId, treeNodeById);
          const toCollapse = [selectedId, ...descendantIds];
          if (onCollapseIds) {
            onCollapseIds(toCollapse);
          } else if (onCollapse) {
            toCollapse.forEach((id) => onCollapse(id));
          }
          e.preventDefault();
        }
      }

      if (e.key === "ArrowDown") {
        const idx = visibleIds.indexOf(selectedId);
        if (idx >= 0 && idx < visibleIds.length - 1) {
          const nextNode = treeNodeById.get(visibleIds[idx + 1]);
          if (nextNode) onSelectNode(nextNode.node);
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowUp") {
        const idx = visibleIds.indexOf(selectedId);
        if (idx > 0) {
          const prevNode = treeNodeById.get(visibleIds[idx - 1]);
          if (prevNode) onSelectNode(prevNode.node);
          e.preventDefault();
        }
      }
    },
    [props, parentById, treeNodeById, visibleIds]
  );

  if (props.roots.length === 0) {
    return (
      <div style={{ padding: 12, color: "#666" }}>
        対象のノードがありません
      </div>
    );
  }

  const [focused, setFocused] = useState(false);

  return (
    <div
      tabIndex={0}
      role="tree"
      aria-label="ノードツリー"
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        outline: "none",
        borderRadius: 4,
        boxShadow: focused
          ? "inset 0 0 0 1px rgba(85, 103, 255, 0.35)"
          : undefined,
      }}
    >
      {props.roots.map((root) => renderNode(root, props, 0))}
    </div>
  );
}
