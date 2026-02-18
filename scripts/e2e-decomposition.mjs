#!/usr/bin/env node
/**
 * Phase 5-C decomposition 手動 E2E（API 経由）
 * 65 §5 チェックリストに沿い、organizer/run → confirmations → apply → DB 確認まで実行する。
 *
 * 前提: npm run dev が localhost:3000 で起動していること。dashboard に Node が 1 件以上あること（親とする）。
 * 実行: node scripts/e2e-decomposition.mjs
 * Apply のみ検証（LLM スキップ）: E2E_SKIP_ORGANIZER=1 node scripts/e2e-decomposition.mjs
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  console.log("[E2E] 1. GET /api/dashboard");
  const dashRes = await fetchJson(`${BASE}/api/dashboard`);
  if (!dashRes.ok || !dashRes.body.trays) {
    console.error("dashboard 取得失敗:", dashRes.body);
    process.exit(1);
  }
  const dashboard = { trays: dashRes.body.trays };
  const flatNodes = Object.values(dashboard.trays).flat();
  const nodeIds = [...new Set(flatNodes.filter((n) => n?.id).map((n) => n.id))];
  console.log(`  → Node 数: ${nodeIds.length}`);

  if (nodeIds.length < 1) {
    console.error("親とする Node が 1 件以上必要です。");
    process.exit(1);
  }

  const parentNodeId = nodeIds[0];
  let decompositionDiffs;

  if (process.env.E2E_SKIP_ORGANIZER === "1") {
    console.log("[E2E] 2. (スキップ) E2E_SKIP_ORGANIZER=1: fixture で decomposition を使用");
    decompositionDiffs = [
      {
        type: "decomposition",
        diff_id: "e2e-decomposition-fixture-" + Date.now(),
        target_node_id: parentNodeId,
        change: {
          parent_node_id: parentNodeId,
          add_children: [
            { title: "E2E子1", context: "E2E検証用" },
            { title: "E2E子2", context: "E2E検証用" },
          ],
        },
        reason: "E2E検証用",
        generated_from: { organizer_run_id: "e2e-fixture" },
      },
    ];
  } else {
    console.log("[E2E] 2. POST /api/organizer/run");
    const runRes = await fetchJson(`${BASE}/api/organizer/run`, {
      method: "POST",
      body: JSON.stringify({ dashboard }),
    });
    if (!runRes.ok) {
      console.error("organizer/run 失敗:", runRes.body);
      process.exit(1);
    }
    decompositionDiffs = (runRes.body.diffs || []).filter((d) => d.type === "decomposition");
    if (decompositionDiffs.length === 0) {
      console.error("diffs に decomposition が含まれていません。LLM が decomposition_proposals を返していない可能性があります。");
      console.error("Apply のみ検証: E2E_SKIP_ORGANIZER=1 node scripts/e2e-decomposition.mjs");
      process.exit(1);
    }
  }
  console.log(`  → decomposition ${decompositionDiffs.length} 件`);

  const diff = decompositionDiffs[0];
  const { parent_node_id, add_children } = diff.change;
  console.log(`  → 親: ${parent_node_id}, 子: ${add_children.length} 件`);

  console.log("[E2E] 3. POST /api/confirmations (decomposition)");
  const confRes = await fetchJson(`${BASE}/api/confirmations`, {
    method: "POST",
    body: JSON.stringify({
      node_id: parent_node_id,
      ui_action: "organizer_decomposition_apply",
      proposed_change: {
        type: "decomposition",
        diff_id: diff.diff_id,
        parent_node_id,
        add_children,
      },
    }),
  });
  if (!confRes.ok || !confRes.body.confirmation?.confirmation_id) {
    console.error("confirmations 失敗:", confRes.body);
    process.exit(1);
  }
  const confirmationId = confRes.body.confirmation.confirmation_id;
  console.log(`  → confirmation_id: ${confirmationId}`);

  console.log("[E2E] 4. POST /api/diffs/decomposition/apply");
  const applyRes = await fetchJson(`${BASE}/api/diffs/decomposition/apply`, {
    method: "POST",
    body: JSON.stringify({ confirmation_id: confirmationId }),
  });
  if (!applyRes.ok) {
    console.error("apply 失敗:", applyRes.body);
    process.exit(1);
  }
  if (!applyRes.body.applied || !Array.isArray(applyRes.body.created_children)) {
    console.error("apply レスポンス不正:", applyRes.body);
    process.exit(1);
  }
  console.log(`  → applied: true, created_children: ${applyRes.body.created_children.length} 件`);

  console.log("[E2E] 5. GET /api/e2e-verify/decomposition (DB 確認)");
  const verifyRes = await fetchJson(`${BASE}/api/e2e-verify/decomposition`);
  if (!verifyRes.ok) {
    console.error("e2e-verify/decomposition 失敗:", verifyRes.body);
    process.exit(1);
  }
  const { nodesCount, nodeChildrenCount } = verifyRes.body;
  console.log(`  → nodes: ${nodesCount} 行, node_children: ${nodeChildrenCount} 行`);

  if (nodeChildrenCount < add_children.length) {
    console.error(`node_children に少なくとも ${add_children.length} 行あることを期待しました。`);
    process.exit(1);
  }

  console.log("\n[E2E] 全ての確認が完了しました（65 §5 チェックリスト相当）。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
