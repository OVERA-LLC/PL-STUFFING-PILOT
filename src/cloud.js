// Supabase（クラウドデータベース）へ、アプリの状態をまるごと1行のJSONとして
// アップロード（push）／ダウンロード（pull）する同期モジュールです。
// pushState/pullStateは今まで通り（手動ボタン用）、
// subscribeToChanges/unsubscribeFromChangesはRealtime購読（自動反映用）です。

const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const CONFIG = require("./cloud-config");

function isConfigured() {
  return (
    CONFIG.SUPABASE_URL &&
    !CONFIG.SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
    CONFIG.SUPABASE_ANON_KEY &&
    !CONFIG.SUPABASE_ANON_KEY.includes("YOUR_ANON_PUBLIC_KEY")
  );
}

async function pushState(payload) {
  if (!isConfigured()) {
    throw new Error(
      "クラウド同期の設定がまだ完了していません（src/cloud-config.js を確認してください）"
    );
  }
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_state`, {
    method: "POST",
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: 1,
      payload,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`アップロードに失敗しました（${res.status}）: ${text}`);
  }
}

async function pullState() {
  if (!isConfigured()) {
    throw new Error(
      "クラウド同期の設定がまだ完了していません（src/cloud-config.js を確認してください）"
    );
  }
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/app_state?id=eq.1&select=payload,updated_at`,
    {
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ダウンロードに失敗しました（${res.status}）: ${text}`);
  }
  const rows = await res.json();
  if (!rows.length) return null;
  return rows[0]; // { payload, updated_at }
}

/* ===================== Realtime購読（自動反映用） ===================== */
let supabaseClient = null;
function getClient() {
  if (!isConfigured()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      // ElectronのメインプロセスはNode.js 22未満のため、WebSocketの実装を明示的に渡す必要がある
      realtime: { transport: ws },
    });
  }
  return supabaseClient;
}

let realtimeChannel = null;

// onChange({payload, updated_at}) が、他の端末がapp_stateを更新するたびに呼ばれる
function subscribeToChanges(onChange, onStatusChange) {
  const client = getClient();
  if (!client) {
    if (onStatusChange) onStatusChange("NOT_CONFIGURED", null);
    return;
  }
  if (realtimeChannel) return; // すでに購読中なら何もしない
  realtimeChannel = client
    .channel("app_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state" },
      (payload) => {
        const row = payload.new;
        if (row && row.payload) {
          onChange({ payload: row.payload, updated_at: row.updated_at });
        }
      }
    )
    .subscribe((status, err) => {
      // status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" など
      console.log("[Realtime] status:", status, err ? String(err) : "");
      if (onStatusChange) onStatusChange(status, err ? String(err) : null);
    });
}

function unsubscribeFromChanges() {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }
}

module.exports = {
  pushState,
  pullState,
  isConfigured,
  subscribeToChanges,
  unsubscribeFromChanges,
};
