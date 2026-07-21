// SQLiteを使ったデータ保存モジュール。
// 画面側（シフト表・予約状況サマリー等）の状態はすべて1つのJSONにまとめて、
// 「app_state」という1つのテーブルの1行に丸ごと保存する、シンプルな方式にしています。
// （複雑な集計・数式は画面側のJavaScriptがそのまま担当し、SQLiteは「保存ファイル」の役割です）

const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");

const dbPath = path.join(app.getPath("userData"), "fukubikiya.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function getData() {
  const row = db.prepare("SELECT payload FROM app_state WHERE id = 1").get();
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch (e) {
    return null;
  }
}

function saveData(jsonState) {
  const payload = JSON.stringify(jsonState);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).run(payload, now);
}

module.exports = { getData, saveData };
