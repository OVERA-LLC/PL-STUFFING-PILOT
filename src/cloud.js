// Supabase（クラウドデータベース）との通信モジュール（SaaS対応版）
// ---------------------------------------------------------------
// 従来の「匿名キーで誰でも読み書き」から、「メール＋パスワードでログインした
// ユーザーだけが、自分の所属施設のデータを読み書きできる」方式に変更したもの。
//
// ・login / logout / getSessionUser … 認証まわり
// ・pushState / pullState          … 手動ボタン・起動時取得用（従来と同じ役割）
// ・subscribeToChanges / unsubscribeFromChanges … Realtime購読（自動反映用）
//
// ログイン状態（セッション）はuserDataフォルダ内のファイルに保存されるため、
// アプリを再起動しても再ログインは不要（トークンは自動更新される）。

const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const fs = require("fs");
const path = require("path");
const CONFIG = require("./cloud-config");

let SESSION_FILE = null; // main.jsのinit()でuserDataフォルダ配下のパスが渡される
let supabaseClient = null;

function isConfigured() {
  return (
    CONFIG.SUPABASE_URL &&
    !CONFIG.SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
    CONFIG.SUPABASE_ANON_KEY &&
    !CONFIG.SUPABASE_ANON_KEY.includes("YOUR_ANON_PUBLIC_KEY")
  );
}

// 最初に必ず呼ぶ。セッション保存ファイルの置き場所（userDataフォルダ）を決める。
function init(userDataDir) {
  SESSION_FILE = path.join(userDataDir, "supabase-session.json");
}

// supabase-jsにセッションの保存先として渡す、ファイルベースの簡易ストレージ。
// （Node.js環境にはlocalStorageが無いため、自前で用意する必要がある）
function fileStorage() {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    } catch (e) {
      return {};
    }
  };
  return {
    getItem: (key) => {
      const d = read();
      return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : null;
    },
    setItem: (key, value) => {
      const d = read();
      d[key] = value;
      try { fs.writeFileSync(SESSION_FILE, JSON.stringify(d), "utf-8"); } catch (e) {}
    },
    removeItem: (key) => {
      const d = read();
      delete d[key];
      try { fs.writeFileSync(SESSION_FILE, JSON.stringify(d), "utf-8"); } catch (e) {}
    },
  };
}

function getClient() {
  if (!isConfigured()) return null;
  if (!SESSION_FILE) throw new Error("cloud.init() が呼ばれていません（保存先未設定）");
  if (!supabaseClient) {
    supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      // ElectronのメインプロセスにはWebSocketが無いため明示的に渡す
      realtime: { transport: ws },
      auth: {
        storage: fileStorage(),
        persistSession: true,     // セッションをファイルに保存して再起動後も維持
        autoRefreshToken: true,   // トークンの期限切れ前に自動更新
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseClient;
}

/* ===================== 認証 ===================== */

// Supabaseのエラーメッセージを、現場の人が読める日本語に変換する
function toJapaneseAuthError(error) {
  const msg = String((error && error.message) || error || "");
  if (msg.includes("Invalid login credentials")) return "メールアドレスまたはパスワードが違います";
  if (msg.includes("Email not confirmed")) return "メールアドレスの確認が完了していません";
  if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) return "通信エラーです。インターネット接続を確認してください";
  return "ログインに失敗しました（" + msg + "）";
}

async function login(email, password) {
  const client = getClient();
  if (!client) throw new Error("クラウド同期の設定が完了していません（src/cloud-config.js を確認してください）");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(toJapaneseAuthError(error));
  return { email: data.user.email };
}

async function logout() {
  const client = getClient();
  if (!client) return;
  try { await client.auth.signOut(); } catch (e) {}
}

// 保存済みセッションからログイン状態を復元して返す（未ログインならnull）
async function getSessionUser() {
  const client = getClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data && data.session ? { email: data.session.user.email } : null;
  } catch (e) {
    return null;
  }
}

/* ===================== データ同期（push / pull） ===================== */

// RLS（行レベルセキュリティ）に弾かれた時のメッセージを分かりやすくする
function toJapaneseDataError(error, operation) {
  const msg = String((error && error.message) || error || "");
  if (msg.includes("row-level security") || (error && error.code === "42501")) {
    return `${operation}が許可されませんでした。ログインしているアカウントが、この施設コードのメンバーとして登録されているか確認してください`;
  }
  return `${operation}に失敗しました: ${msg}`;
}

async function pushState(payload, facilityCode) {
  const client = getClient();
  if (!client) throw new Error("クラウド同期の設定が完了していません（src/cloud-config.js を確認してください）");
  if (!facilityCode) throw new Error("施設コードが設定されていません");
  const user = await getSessionUser();
  if (!user) throw new Error("クラウドへの保存にはログインが必要です");

  const { error } = await client
    .from("app_state")
    .upsert(
      { facility_code: facilityCode, payload, updated_at: new Date().toISOString() },
      { onConflict: "facility_code" }
    );
  if (error) throw new Error(toJapaneseDataError(error, "アップロード"));
}

async function pullState(facilityCode) {
  const client = getClient();
  if (!client) throw new Error("クラウド同期の設定が完了していません（src/cloud-config.js を確認してください）");
  if (!facilityCode) throw new Error("施設コードが設定されていません");
  const user = await getSessionUser();
  if (!user) throw new Error("クラウドからの取得にはログインが必要です");

  const { data, error } = await client
    .from("app_state")
    .select("payload,updated_at")
    .eq("facility_code", facilityCode);
  if (error) throw new Error(toJapaneseDataError(error, "ダウンロード"));
  if (!data || !data.length) return null;
  return data[0]; // { payload, updated_at }
}

/* ===================== Realtime購読（自動反映用） ===================== */

let realtimeChannel = null;

// onChange({payload, updated_at}) が、同じ施設コードの他端末がapp_stateを更新するたびに呼ばれる
function subscribeToChanges(onChange, onStatusChange, facilityCode) {
  const client = getClient();
  if (!client) {
    if (onStatusChange) onStatusChange("NOT_CONFIGURED", null);
    return;
  }
  if (!facilityCode) {
    if (onStatusChange) onStatusChange("NOT_CONFIGURED", "施設コードが未設定です");
    return;
  }
  if (realtimeChannel) return; // すでに購読中（切り替え時は先にunsubscribeFromChangesを呼ぶこと）
  realtimeChannel = client
    .channel("app_state_changes_" + facilityCode)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_state",
        filter: `facility_code=eq.${facilityCode}`,
      },
      (payload) => {
        console.log("[Realtime] change received:", payload.eventType, "updated_at=", payload.new && payload.new.updated_at);
        const row = payload.new;
        if (row && row.payload) {
          onChange({ payload: row.payload, updated_at: row.updated_at });
        }
      }
    )
    .subscribe((status, err) => {
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
  init,
  isConfigured,
  login,
  logout,
  getSessionUser,
  pushState,
  pullState,
  subscribeToChanges,
  unsubscribeFromChanges,
};
