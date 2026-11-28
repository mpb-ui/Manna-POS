const selectFields = 'code, product_id AS "productId", target_key AS "targetKey", kind';

export async function initializePosBarcodes(client, restored = []) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pos_product_barcodes (
      code TEXT PRIMARY KEY CHECK (length(code) BETWEEN 1 AND 128),
      product_id TEXT NOT NULL,
      target_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('FACTORY', 'INTERNAL')),
      CHECK (code !~* '^(MAT|CMD|QTY)[[:space:]]*:'),
      CHECK ((kind = 'INTERNAL') = (code ~* '^MPP[0-9]{8}$'))
    )
  `);
  await client.query("CREATE INDEX IF NOT EXISTS pos_product_barcodes_target ON pos_product_barcodes (product_id, target_key)");
  await client.query("CREATE UNIQUE INDEX IF NOT EXISTS pos_product_barcodes_internal ON pos_product_barcodes (product_id, target_key) WHERE kind = 'INTERNAL'");
  if (restored.length) {
    await client.query(`
      INSERT INTO pos_product_barcodes (code, product_id, target_key, kind)
      SELECT code, "productId", "targetKey", kind
      FROM jsonb_to_recordset($1::jsonb) AS b(code text, "productId" text, "targetKey" text, kind text)
    `, [JSON.stringify(restored)]);
  }
}

export async function barcodeBackupState(store) {
  if (!store.pool) return structuredClone(store.memory);
  const result = await store.pool.query(`
    SELECT data || COALESCE(
      (SELECT jsonb_build_object('posBarcodeRegistry', jsonb_agg(row_to_json(b) ORDER BY code))
       FROM (SELECT ${selectFields} FROM pos_product_barcodes) AS b HAVING count(*) > 0),
      '{}'::jsonb
    ) AS data FROM app_state WHERE id = 'main'
  `);
  return result.rows[0].data;
}

export async function barcodeCodes(store) {
  if (!store.pool) return (store.memory.posBarcodeRegistry || []).map(row => row.code);
  const result = await store.pool.query("SELECT code FROM pos_product_barcodes");
  return result.rows.map(row => row.code);
}

export async function readBarcodeCatalog(store, productId = null) {
  if (!store.pool) {
    return structuredClone({
      catalogOptions: store.memory.catalogOptions,
      products: store.memory.products.filter(product => !productId || product.id === productId),
      mappings: (store.memory.posBarcodeRegistry || []).filter(row => !productId || row.productId === productId)
    });
  }
  // One statement keeps the product configuration and the registry on the same snapshot.
  const result = await store.pool.query(`
    SELECT
      data->'catalogOptions' AS "catalogOptions",
      (SELECT COALESCE(jsonb_agg(product), '[]'::jsonb) FROM jsonb_array_elements(data->'products') product
       WHERE $1::text IS NULL OR product->>'id' = $1) AS products,
      (SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb) FROM
        (SELECT ${selectFields} FROM pos_product_barcodes WHERE $1::text IS NULL OR product_id = $1) b) AS mappings
    FROM app_state WHERE id = 'main'
  `, [productId]);
  return result.rows[0];
}

export async function lookupBarcode(store, code, equivalent) {
  if (!store.pool) {
    const registry = store.memory.posBarcodeRegistry || [];
    const mapping = registry.find(row => row.code === code) || registry.find(row => row.code === equivalent);
    const product = mapping && store.memory.products.find(row => row.id === mapping.productId);
    return structuredClone({ enabled: store.memory.posBarcodeEnabled === true, mapping, product });
  }
  const result = await store.pool.query(`
    SELECT data->'posBarcodeEnabled' AS enabled, row_to_json(mapping) AS mapping, product
    FROM app_state
    LEFT JOIN LATERAL (
      SELECT ${selectFields} FROM pos_product_barcodes
      WHERE code IN ($1, $2) ORDER BY code = $1 DESC LIMIT 1
    ) mapping ON TRUE
    LEFT JOIN LATERAL (SELECT p AS product FROM jsonb_array_elements(data->'products') p
      WHERE p->>'id' = mapping."productId" LIMIT 1) p ON TRUE
    WHERE app_state.id = 'main'
  `, [code, equivalent]);
  return result.rows[0];
}

export function barcodeMutations(state, client) {
  const memory = client ? null : (state.posBarcodeRegistry ||= []);
  return {
    async find(code) {
      if (memory) return memory.find(row => row.code === code);
      const { rows } = await client.query(`SELECT ${selectFields} FROM pos_product_barcodes WHERE code = $1`, [code]);
      return rows[0];
    },
    async forTarget(productId, targetKey) {
      if (memory) return memory.filter(row => row.productId === productId && row.targetKey === targetKey);
      const { rows } = await client.query(`SELECT ${selectFields} FROM pos_product_barcodes WHERE product_id = $1 AND target_key = $2`, [productId, targetKey]);
      return rows;
    },
    async insert(row) {
      if (memory) {
        if (memory.some(item => item.code === row.code)) return false;
        memory.push(row);
        return true;
      }
      const result = await client.query(`
        INSERT INTO pos_product_barcodes (code, product_id, target_key, kind)
        VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING
      `, [row.code, row.productId, row.targetKey, row.kind]);
      return result.rowCount === 1;
    },
    async remove(code) {
      if (memory) memory.splice(memory.findIndex(row => row.code === code), 1);
      else await client.query("DELETE FROM pos_product_barcodes WHERE code = $1", [code]);
    }
  };
}
