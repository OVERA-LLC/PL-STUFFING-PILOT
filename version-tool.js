// package.json の version を読み書きするための小さな補助スクリプト
// バッチファイルの中に直接JSを書くと、Windowsのコマンド解析（クォートの扱い）と衝突するため、
// このファイルに分離しています。
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

const cmd = process.argv[2];

if (cmd === "get") {
  console.log(pkg.version);
} else if (cmd === "set") {
  const newVersion = process.argv[3];
  if (!newVersion) {
    console.error("バージョン番号が指定されていません");
    process.exit(1);
  }
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log("OK");
} else {
  console.error("使い方: node version-tool.js get | set <新しいバージョン>");
  process.exit(1);
}
