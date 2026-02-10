"use client";

/**
 * Phase6-A: ツリー表示リスト
 * buildTree で組み立てた TreeNode を開閉付きで表示。詳細パネル連携用に onSelectNode を呼ぶ。
 */

import type { TreeNode } from "@/lib/dashboardTree";

const INDENT_PX = 20;
const GUIDE_COLOR = "rgba(0,0,0,0.08)";

export interface TreeListProps {
  roots: TreeNode[];
  expandedSet: Set<string>;
  onToggleExpand: (nodeId: string) => void;
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
  if (props.roots.length === 0) {
    return (
      <div style={{ padding: 12, color: "#666" }}>
        対象のノードがありません
      </div>
    );
  }

  return (
    <div>
      {props.roots.map((root) => renderNode(root, props, 0))}
    </div>
  );
}
