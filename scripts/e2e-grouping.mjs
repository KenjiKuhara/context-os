#!/usr/bin/env node
/**
 * Phase 5-B grouping 手動 E2E（API 経由）
 * 61 §5 チェックリストに沿い、organizer/run → confirmations → apply → DB 確認まで実行する。
 *
 * 前提: npm run dev が localhost:3000 で起動していること。dashboard に Node が 2 件以上あること。
 * 実行: node scripts/e2e-grouping.mjs
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

  let groupingDiffs;
  if (process.env.E2E_SKIP_ORGANIZER === "1" && nodeIds.length >= 2) {
    console.log("[E2E] 2. (スキップ) E2E_SKIP_ORGANIZER=1: fixture で grouping を使用");
    groupingDiffs = [
      {
        type: "grouping",
        diff_id: "e2e-fixture-" + Date.now(),
        change: { group_label: "E2E検証用グループ", node_ids: nodeIds.slice(0, 2) },
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
    groupingDiffs = (runRes.body.diffs || []).filter((d) => d.type === "grouping");
    if (groupingDiffs.length === 0) {
      console.error("diffs に grouping が含まれていません。LLM が grouping_proposals を返していない可能性があります。");
      console.error("Apply のみ検証: E2E_SKIP_ORGANIZER=1 node scripts/e2e-grouping.mjs");
      process.exit(1);
    }
  }
  console.log(`  → grouping ${groupingDiffs.length} 件`);

  const diff = groupingDiffs[0];
  const { group_label, node_ids } = diff.change;
  console.log(`  → 対象: "${group_label}", node_ids: ${node_ids.length} 件`);

  console.log("[E2E] 3. POST /api/confirmations (grouping)");
  const confRes = await fetchJson(`${BASE}/api/confirmations`, {
    method: "POST",
    body: JSON.stringify({
      ui_action: "organizer_grouping_apply",
      proposed_change: {
        type: "grouping",
        diff_id: diff.diff_id,
        group_label,
        node_ids,
      },
    }),
  });
  if (!confRes.ok || !confRes.body.confirmation?.confirmation_id) {
    console.error("confirmations 失敗:", confRes.body);
    process.exit(1);
  }
  const confirmationId = confRes.body.confirmation.confirmation_id;
  console.log(`  → confirmation_id: ${confirmationId}`);

  console.log("[E2E] 4. POST /api/diffs/grouping/apply");
  const applyRes = await fetchJson(`${BASE}/api/diffs/grouping/apply`, {
    method: "POST",
    body: JSON.stringify({ confirmation_id: confirmationId }),
  });
  if (!applyRes.ok) {
    console.error("apply 失敗:", applyRes.body);
    process.exit(1);
  }
  if (!applyRes.body.group_id || !applyRes.body.applied) {
    console.error("apply レスポンス不正:", applyRes.body);
    process.exit(1);
  }
  console.log(`  → group_id: ${applyRes.body.group_id}, applied: true`);

  console.log("[E2E] 5. GET /api/e2e-verify/groups (DB 確認)");
  const verifyRes = await fetchJson(`${BASE}/api/e2e-verify/groups`);
  if (!verifyRes.ok) {
    console.error("e2e-verify/groups 失敗:", verifyRes.body);
    process.exit(1);
  }
  const { groupsCount, groupMembersCount } = verifyRes.body;
  console.log(`  → groups: ${groupsCount} 行, group_members: ${groupMembersCount} 行`);

  if (groupsCount < 1) {
    console.error("groups に 1 行以上あることを期待しました。");
    process.exit(1);
  }
  if (groupMembersCount < node_ids.length) {
    console.error(`group_members に少なくとも ${node_ids.length} 行あることを期待しました。`);
    process.exit(1);
  }

  console.log("\n[E2E] 全ての確認が完了しました（61 §5 チェックリスト相当）。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
