// Supabase（クラウドデータベース）へ、アプリの状態をまるごと1行のJSONとして
// アップロード（push）／ダウンロード（pull）するだけのシンプルな同期モジュールです。
// リアルタイムではなく、「同期ボタン」を押した時だけ通信します。

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

module.exports = { pushState, pullState, isConfigured };
