import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} harus tersedia`);
  assert.notEqual(end, -1, `${nextName} harus tersedia setelah ${name}`);
  return source.slice(start, end);
}

test("form Finishing tidak merujuk variabel Produk di luar scope", () => {
  const body = functionSource("openFinishingForm", "openMachineForm");
  assert.doesNotMatch(body, /product\?\./);
  assert.match(body, /moneyField\("price"/);
  assert.match(body, /bindMoneyInputs\(detail\)/);
  assert.match(body, /price: parseMoney\(values\.price\)/);
});
