/**
 * PL STUFFING PILOT 連携用 ローカルサーバー
 * ---------------------------------------------------------------
 * inntoのブックマークレットから送られてくる集計データを受け取って保存し、
 * PL STUFFING PILOT側からいつでも取りに来られるようにする、小さな中継サーバーです。
 *
 * 【使い方】
 * 1. Node.jsがインストールされていることを確認する（コマンドプロンプトで `node -v`）
 * 2. このファイルをどこか分かりやすい場所（例：デスクトップの innto_bridge フォルダ）に保存
 * 3. コマンドプロンプト（またはGit Bash）でそのフォルダに移動し、次を実行して起動
 *      node local_server.js
 * 4. 「起動しました」というメッセージが出たら、そのまま最小化して常時起動しておく
 *    （PCを再起動したら、また同じコマンドで起動し直してください）
 *
 * このサーバーは自分のPCの中だけ（http://localhost:8791）で動くもので、
 * インターネットには一切公開されません。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8791;
// PL STUFFING PILOTから自動起動された場合は、INNTO_BRIDGE_DATA_DIR環境変数で
// 書き込み可能な保存先（アプリのuserDataフォルダ）が渡される。
// 単独で `node local_server.js` を実行した場合は、これまで通りこのファイルの隣にdataフォルダを作る。
const DATA_DIR = process.env.INNTO_BRIDGE_DATA_DIR
  ? process.env.INNTO_BRIDGE_DATA_DIR
  : path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function dataFilePath(type) {
  const safe = String(type || "default").replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // CORS プリフライト対応
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // データ受信（innto側のブックマークレットから）
  if (req.method === "POST" && url.pathname === "/ingest") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const type = payload.type || "default";
        const record = {
          type,
          receivedAt: new Date().toISOString(),
          source: payload.source || null,
          rows: payload.rows || null,
          meta: payload.meta || null,
        };
        fs.writeFileSync(dataFilePath(type), JSON.stringify(record, null, 1), "utf-8");
        console.log(`[受信] type=${type} rows=${(payload.rows || []).length}件 (${new Date().toLocaleString("ja-JP")})`);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error("受信データの処理に失敗:", e);
        sendJson(res, 400, { ok: false, error: String(e) });
      }
    });
    return;
  }

  // データ取得（PL STUFFING PILOT側から）
  if (req.method === "GET" && url.pathname === "/latest") {
    const type = url.searchParams.get("type") || "default";
    const fp = dataFilePath(type);
    if (!fs.existsSync(fp)) {
      sendJson(res, 404, { ok: false, error: "まだデータがありません。inntoでブックマークレットを1回実行してください。" });
      return;
    }
    try {
      const record = JSON.parse(fs.readFileSync(fp, "utf-8"));
      sendJson(res, 200, { ok: true, ...record });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: String(e) });
    }
    return;
  }

  // 動作確認用
  if (req.method === "GET" && url.pathname === "/") {
    sendJson(res, 200, { ok: true, message: "innto連携サーバーは起動しています。", port: PORT });
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`ポート${PORT}はすでに使用中です。おそらく別の場所ですでに起動しています（問題ありません）。`);
  } else {
    console.error("サーバーエラー:", err);
  }
});

server.listen(PORT, () => {
  console.log(`起動しました。 http://localhost:${PORT} で待機しています。`);
  console.log(`このウィンドウは閉じずに、そのまま最小化しておいてください。`);
});
