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

/** roots から childrenById と parentById を構築（キーボード開閉用） */
function buildTreeMaps(roots: TreeNode[]): {
  childrenById: Map<string, string[]>;
  parentById: Map<string, string>;
} {
  const childrenById = new Map<string, string[]>();
  const parentById = new Map<string, string>();
  walkTree(roots, (tn, parentId) => {
    if (parentId != null) parentById.set(tn.id, parentId);
    if (tn.children.length > 0) {
      childrenById.set(tn.id, tn.children.map((c) => c.id));
    }
  });
  return { childrenById, parentById };
}

export interface TreeListProps {
  roots: TreeNode[];
  expandedSet: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  /** キーボード → 用: 指定ノードを展開する */
  onExpand?: (nodeId: string) => void;
  /** キーボード ← 用: 指定ノードを閉じる */
  onCollapse?: (nodeId: string) => void;
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
  const { childrenById, parentById } = useMemo(
    () => buildTreeMaps(props.roots),
    [props.roots]
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

      const { selectedId, expandedSet, onExpand, onCollapse } = props;
      if (!selectedId) return;

      if (e.key === "ArrowRight") {
        const childIds = childrenById.get(selectedId);
        if (
          childIds &&
          childIds.length > 0 &&
          !expandedSet.has(selectedId) &&
          onExpand
        ) {
          onExpand(selectedId);
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        if (expandedSet.has(selectedId) && onCollapse) {
          onCollapse(selectedId);
          e.preventDefault();
          return;
        }
        const parentId = parentById.get(selectedId);
        if (parentId != null && onCollapse) {
          onCollapse(parentId);
          e.preventDefault();
        }
      }
    },
    [props, childrenById, parentById]
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
