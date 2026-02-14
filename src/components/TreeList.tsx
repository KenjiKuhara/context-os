"use client";

/**
 * Phase6-A: ツリー表示リスト
 * buildTree で組み立てた TreeNode を開閉付きで表示。詳細パネル連携用に onSelectNode を呼ぶ。
 * キーボード: → で展開、← で閉じる（選択中ノードにのみ反応、ツリー領域フォーカス時のみ）。
 * Tree D&D: オプションで onTreeMove を渡すとドラッグ＆ドロップで並び替え・親変更・ルート化。
 */

import { useMemo, useCallback, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDndContext } from "@dnd-kit/core";
import type { TreeNode } from "@/lib/dashboardTree";

const INDENT_PX = 20;
/** B2: 階層のガイド線（インデント）はトークンで theme に追従 */
const GUIDE_BORDER = "var(--border-subtle)";

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
  orderedChildrenByParentId: Map<string | null, string[]>;
} {
  const parentById = new Map<string, string>();
  const treeNodeById = new Map<string, TreeNode>();
  const orderedChildrenByParentId = new Map<string | null, string[]>();
  orderedChildrenByParentId.set(null, roots.map((r) => r.id));
  walkTree(roots, (tn, parentId) => {
    if (parentId != null) parentById.set(tn.id, parentId);
    treeNodeById.set(tn.id, tn);
    orderedChildrenByParentId.set(tn.id, tn.children.map((c) => c.id));
  });
  return { parentById, treeNodeById, orderedChildrenByParentId };
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
  /** Phase11-B: 行内状態表示用。未指定時は raw status を表示しない（空またはラベル未定義時は —） */
  getStatusLabel?: (node: Record<string, unknown>) => string;
  /** Phase9-A: 履歴クリック連動でハイライトするノード ID の集合 */
  highlightIds?: Set<string> | null;
  /** Tree D&D: 移動完了時。movedNodeId, newParentId (null=ルート), orderedSiblingIds */
  onTreeMove?: (movedNodeId: string, newParentId: string | null, orderedSiblingIds: string[]) => void;
}

const DROP_ID_PREFIX = "drop-";
const NEST_DROP_PREFIX = "drop-nest-";
const ROOT_KEY = "root";

function parseDropId(id: string): { parentId: string | null; siblingIndex: number } | null {
  if (!id.startsWith(DROP_ID_PREFIX)) return null;
  const rest = id.slice(DROP_ID_PREFIX.length);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash < 0) return null;
  const parentKey = rest.slice(0, lastDash);
  const index = parseInt(rest.slice(lastDash + 1), 10);
  if (Number.isNaN(index) || index < 0) return null;
  return { parentId: parentKey === ROOT_KEY ? null : parentKey, siblingIndex: index };
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
  isHighlighted,
  getTitle,
  getSubtext,
  statusLabel,
  dragHandleProps,
}: {
  node: Record<string, unknown>;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  childCount: number;
  onToggle: () => void;
  onSelect: () => void;
  isSelected: boolean;
  isHighlighted: boolean;
  getTitle: (n: Record<string, unknown>) => string;
  getSubtext: (n: Record<string, unknown>) => string;
  statusLabel: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const nodeId = node.id as string;
  const bg = isHighlighted ? "var(--bg-highlight)" : isSelected ? "var(--bg-selected)" : "var(--bg-card)";
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
        borderTop: "1px solid var(--border-subtle)",
        background: bg,
        cursor: "pointer",
        borderLeft: depth > 0 ? `2px solid ${GUIDE_BORDER}` : undefined,
        marginLeft: depth > 0 ? 0 : undefined,
      }}
      onClick={onSelect}
      {...dragHandleProps}
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
          color: hasChildren ? "var(--text-primary)" : "var(--text-muted)",
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
            color: "var(--text-secondary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {getSubtext(node) || "（途中内容なし）"}
        </div>
        {hasChildren && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            子タスク {childCount} 件
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
        {statusLabel || "—"}
      </div>
    </div>
  );
}

function DropSlot({
  parentId,
  siblingIndex,
  canDrop,
  activeId,
  children,
}: {
  parentId: string | null;
  siblingIndex: number;
  canDrop: (movedId: string, targetParentId: string | null) => boolean;
  activeId: string | null;
  children: React.ReactNode;
}) {
  const parentKey = parentId ?? ROOT_KEY;
  const dropId = `${DROP_ID_PREFIX}${parentKey}-${siblingIndex}`;
  const allowed = !activeId || canDrop(activeId, parentId);
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { parentId, siblingIndex }, disabled: !allowed });
  const showLine = isOver && allowed;
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "relative",
        minHeight: 4,
        ...(showLine && { backgroundColor: "rgba(255, 140, 0, 0.05)" }),
      }}
    >
      {showLine && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background: "var(--color-insertion-line, hsl(25, 90%, 55%))",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </div>
  );
}

/** 行の右20%ゾーン。ここにドロップすると target の子になる（nest） */
function NestDropZone({
  nodeId,
  canDrop,
  activeId,
}: {
  nodeId: string;
  canDrop: (movedId: string, targetParentId: string | null) => boolean;
  activeId: string | null;
}) {
  const allowed = !activeId || canDrop(activeId, nodeId);
  const { setNodeRef } = useDroppable({
    id: `${NEST_DROP_PREFIX}${nodeId}`,
    data: { nodeId },
    disabled: !allowed,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: "20%",
        pointerEvents: "auto",
      }}
    />
  );
}

function DraggableTreeRow({
  nodeId,
  tn,
  props,
  depth,
  parentId,
  siblingIndex,
  orderedChildrenByParentId,
  descendantIdsOfDragged,
  activeDragId,
  nestOverNodeId,
  canDrop,
}: {
  nodeId: string;
  tn: TreeNode;
  props: TreeListProps;
  depth: number;
  parentId: string | null;
  siblingIndex: number;
  orderedChildrenByParentId: Map<string | null, string[]>;
  descendantIdsOfDragged: (id: string) => Set<string>;
  activeDragId: string | null;
  nestOverNodeId: string | null;
  canDrop: (movedId: string, targetParentId: string | null) => boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: nodeId,
    data: { nodeId },
  });
  const hasChildren = tn.children.length > 0;
  const isExpanded = props.expandedSet.has(nodeId);
  const isHighlighted = (props.highlightIds?.has(nodeId)) ?? false;
  const statusLabel = props.getStatusLabel ? props.getStatusLabel(tn.node) : "";
  const showNestBar = nestOverNodeId === nodeId;
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "relative",
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div>
        <TreeRow
          node={tn.node}
          depth={depth}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          childCount={tn.children.length}
          onToggle={() => props.onToggleExpand(nodeId)}
          onSelect={() => props.onSelectNode(tn.node)}
          isSelected={props.selectedId === nodeId}
          isHighlighted={isHighlighted}
          getTitle={props.getNodeTitle}
          getSubtext={props.getNodeSubtext}
          statusLabel={statusLabel}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
        {hasChildren && isExpanded && (
          <div>
            {tn.children.map((c, i) =>
              c.cycleDetected ? (
                <div
                  key={c.id}
                  style={{
                    paddingLeft: (depth + 1) * INDENT_PX + 22,
                    paddingTop: 4,
                    paddingBottom: 4,
                    fontSize: 12,
                    color: "var(--text-danger)",
                  }}
                >
                  （循環のため表示を打ち切り）
                </div>
              ) : (
                renderNodeInner(c, props, depth + 1, tn.id, i, orderedChildrenByParentId, descendantIdsOfDragged, activeDragId, nestOverNodeId)
              )
            )}
          </div>
        )}
      </div>
      {props.onTreeMove && (
        <NestDropZone nodeId={nodeId} canDrop={canDrop} activeId={activeDragId} />
      )}
      {showNestBar && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: "var(--color-nest-indicator, hsl(260, 70%, 55%))",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function renderNodeInner(
  tn: TreeNode,
  props: TreeListProps,
  depth: number,
  parentId: string | null,
  siblingIndex: number,
  orderedChildrenByParentId: Map<string | null, string[]>,
  descendantIdsOfDragged: (id: string) => Set<string>,
  activeDragId: string | null,
  nestOverNodeId: string | null
): React.ReactNode {
  const id = tn.id;
  const hasChildren = tn.children.length > 0;
  const isExpanded = props.expandedSet.has(id);
  const isHighlighted = (props.highlightIds?.has(id)) ?? false;
  const statusLabel = props.getStatusLabel ? props.getStatusLabel(tn.node) : "";
  const canDrop = (movedId: string, targetParentId: string | null) => {
    if (targetParentId === movedId) return false;
    const descendants = descendantIdsOfDragged(movedId);
    return !descendants.has(targetParentId ?? "");
  };
  if (props.onTreeMove) {
    return (
      <div key={id}>
        <DropSlot
          parentId={parentId}
          siblingIndex={siblingIndex}
          canDrop={canDrop}
          activeId={activeDragId}
        >
          <DraggableTreeRow
            nodeId={id}
            tn={tn}
            props={props}
            depth={depth}
            parentId={parentId}
            siblingIndex={siblingIndex}
            orderedChildrenByParentId={orderedChildrenByParentId}
            descendantIdsOfDragged={descendantIdsOfDragged}
            activeDragId={activeDragId}
            nestOverNodeId={nestOverNodeId}
            canDrop={canDrop}
          />
        </DropSlot>
      </div>
    );
  }
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
        isHighlighted={isHighlighted}
        getTitle={props.getNodeTitle}
        getSubtext={props.getNodeSubtext}
        statusLabel={statusLabel}
      />
      {hasChildren && isExpanded && (
        <div>
          {tn.children.map((c, i) =>
            c.cycleDetected ? (
              <div
                key={c.id}
                style={{
                  paddingLeft: (depth + 1) * INDENT_PX + 22,
                  paddingTop: 4,
                  paddingBottom: 4,
                  fontSize: 12,
                  color: "var(--text-danger)",
                }}
              >
                （循環のため表示を打ち切り）
              </div>
            ) : (
              renderNodeInner(c, props, depth + 1, tn.id, i, orderedChildrenByParentId, descendantIdsOfDragged, activeDragId, nestOverNodeId)
            )
          )}
        </div>
      )}
    </div>
  );
}

function renderNode(
  tn: TreeNode,
  props: TreeListProps,
  depth: number,
  parentId: string | null,
  siblingIndex: number,
  orderedChildrenByParentId: Map<string | null, string[]>,
  descendantIdsOfDragged: (id: string) => Set<string>,
  activeDragId: string | null,
  nestOverNodeId: string | null
): React.ReactNode {
  return renderNodeInner(tn, props, depth, parentId, siblingIndex, orderedChildrenByParentId, descendantIdsOfDragged, activeDragId, nestOverNodeId);
}

/** DndContext の子で over を参照し、nestOverNodeId を renderNode に渡してツリーを描画する */
function TreeBody({
  roots,
  treeListProps: props,
  orderedChildrenByParentId,
  descendantIdsOfDragged,
  activeDragId,
  onKeyDown,
  focused,
  onFocusChange,
}: {
  roots: TreeNode[];
  treeListProps: TreeListProps;
  orderedChildrenByParentId: Map<string | null, string[]>;
  descendantIdsOfDragged: (id: string) => Set<string>;
  activeDragId: string | null;
  onKeyDown: (e: React.KeyboardEvent) => void;
  focused: boolean;
  onFocusChange: (focused: boolean) => void;
}) {
  const { over } = useDndContext();
  const nestOverNodeId =
    over?.id != null && String(over.id).startsWith(NEST_DROP_PREFIX)
      ? String(over.id).slice(NEST_DROP_PREFIX.length)
      : null;
  return (
    <div
      tabIndex={0}
      role="tree"
      aria-label="タスクツリー"
      onKeyDown={onKeyDown}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      style={{
        outline: "none",
        borderRadius: 4,
        background: "var(--bg-panel)",
        boxShadow: focused ? "inset 0 0 0 1px var(--focus-ring)" : undefined,
      }}
    >
      {roots.map((root, i) =>
        renderNode(root, props, 0, null, i, orderedChildrenByParentId, descendantIdsOfDragged, activeDragId, nestOverNodeId)
      )}
    </div>
  );
}

export function TreeList(props: TreeListProps) {
  const { parentById, treeNodeById, orderedChildrenByParentId } = useMemo(
    () => buildTreeMaps(props.roots),
    [props.roots]
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const descendantIdsOfDragged = useCallback(
    (id: string) => new Set(collectDescendantIds(id, treeNodeById)),
    [treeNodeById]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || !props.onTreeMove) return;
      const movedNodeId = active.id as string;
      const overId = String(over.id);
      if (overId.startsWith(NEST_DROP_PREFIX)) {
        const targetNodeId = overId.slice(NEST_DROP_PREFIX.length);
        const children = orderedChildrenByParentId.get(targetNodeId) ?? [];
        const orderedSiblingIds = [...children.filter((id) => id !== movedNodeId), movedNodeId];
        props.onTreeMove(movedNodeId, targetNodeId, orderedSiblingIds);
        return;
      }
      const parsed = parseDropId(overId);
      if (!parsed) return;
      const { parentId, siblingIndex } = parsed;
      const siblings = orderedChildrenByParentId.get(parentId) ?? [];
      const without = siblings.filter((id) => id !== movedNodeId);
      const orderedSiblingIds = [...without.slice(0, siblingIndex), movedNodeId, ...without.slice(siblingIndex)];
      props.onTreeMove(movedNodeId, parentId, orderedSiblingIds);
    },
    [props.onTreeMove, orderedChildrenByParentId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const collisionDetection = useCallback(
    (args: Parameters<typeof pointerWithin>[0]) => {
      const pointer = pointerWithin(args);
      if (pointer.length > 0) return pointer;
      return rectIntersection(args);
    },
    []
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
      <div style={{ padding: 12, color: "var(--text-secondary)" }}>
        対象のタスクがありません
      </div>
    );
  }

  const [focused, setFocused] = useState(false);

  const treeContent = (
    <div
      tabIndex={0}
      role="tree"
      aria-label="タスクツリー"
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        outline: "none",
        borderRadius: 4,
        background: "var(--bg-panel)",
        boxShadow: focused ? "inset 0 0 0 1px var(--focus-ring)" : undefined,
      }}
    >
      {props.roots.map((root, i) =>
        renderNode(root, props, 0, null, i, orderedChildrenByParentId, descendantIdsOfDragged, activeDragId, null)
      )}
    </div>
  );

  if (props.onTreeMove) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={({ active }) => setActiveDragId(active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <TreeBody
          roots={props.roots}
          treeListProps={props}
          orderedChildrenByParentId={orderedChildrenByParentId}
          descendantIdsOfDragged={descendantIdsOfDragged}
          activeDragId={activeDragId}
          onKeyDown={handleKeyDown}
          focused={focused}
          onFocusChange={setFocused}
        />
      </DndContext>
    );
  }
  return treeContent;
}
