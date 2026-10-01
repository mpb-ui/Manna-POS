import crypto from "node:crypto";

const slug = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clean = (value) => String(value || "").trim();
const liveOrder = (order) => !["SELESAI", "DIAMBIL"].includes(order.status);

export function categoryKey(options, label, kind = "products") {
  return options[kind === "products" ? "categoryKeys" : "materialCategoryKeys"]?.[label] || slug(label);
}

export function initializeCatalogSettings(state) {
  const options = state.catalogOptions;
  options.materialCategories ||= ["Lainnya"];
  for (const material of state.materials || []) {
    const label = material.category || "Lainnya";
    if (!options.materialCategories.includes(label)) options.materialCategories.push(label);
  }
  for (const [list, keys] of [["categories", "categoryKeys"], ["materialCategories", "materialCategoryKeys"]]) {
    options[keys] ||= {};
    for (const label of options[list]) {
      if (!Object.hasOwn(options[keys], label)) {
        const proposed = slug(label);
        options[keys][label] = Object.values(options[keys]).includes(proposed) ? `cat-${crypto.randomUUID()}` : proposed;
      }
    }
  }
  if (!Array.isArray(state.pics)) {
    const names = [...new Set(["Gema", "Qori", "Cc/Ko", ...(state.orders || []).map((order) => order.designPic).filter(Boolean)])];
    state.pics = names.map((name) => ({ id: `pic-${crypto.randomUUID()}`, name, active: true }));
  }
  for (const order of state.orders || []) {
    if (order.designPic && !order.designPicId) order.designPicId = state.pics.find((pic) => pic.name === order.designPic)?.id || "";
  }
}

function categoryList(state, kind) {
  if (!["products", "materials"].includes(kind)) throw new Error("Jenis kategori tidak valid");
  return state.catalogOptions[kind === "products" ? "categories" : "materialCategories"];
}

export function addCategory(state, kind, input) {
  const name = clean(input);
  const list = categoryList(state, kind);
  if (!name || name.length > 100) throw new Error("Nama kategori wajib diisi (maksimal 100 karakter)");
  if (list.some((label) => label.toLowerCase() === name.toLowerCase())) throw new Error("Kategori sudah tersedia");
  list.push(name);
  state.catalogOptions[kind === "products" ? "categoryKeys" : "materialCategoryKeys"][name] = `cat-${crypto.randomUUID()}`;
  return name;
}

function moveCategoryReferences(state, kind, source, target) {
  if (kind === "products") {
    state.products.forEach((product) => { if (product.category === source) product.category = target; });
    state.finishings.forEach((finish) => { finish.categories = [...new Set((finish.categories || []).map((label) => label === source ? target : label))]; });
  } else {
    state.materials.forEach((material) => { if (material.category === source) material.category = target; });
    state.inventory.forEach((row) => { if (row.category === source) row.category = target; });
  }
}

export function renameCategory(state, kind, source, input) {
  const list = categoryList(state, kind);
  const index = list.indexOf(source); const name = clean(input);
  if (index < 0) throw new Error("Kategori tidak ditemukan");
  if (!name || name.length > 100) throw new Error("Nama kategori wajib diisi (maksimal 100 karakter)");
  if (list.some((label) => label !== source && label.toLowerCase() === name.toLowerCase())) throw new Error("Kategori sudah tersedia");
  const keys = state.catalogOptions[kind === "products" ? "categoryKeys" : "materialCategoryKeys"];
  const id = categoryKey(state.catalogOptions, source, kind);
  moveCategoryReferences(state, kind, source, name);
  list[index] = name;
  delete keys[source]; keys[name] = id;
  return name;
}

export function deleteCategory(state, kind, source, replacement) {
  const list = categoryList(state, kind);
  if (!list.includes(source)) throw new Error("Kategori tidak ditemukan");
  if (!replacement || replacement === source || !list.includes(replacement)) throw new Error("Pilih kategori pengganti sebelum menghapus kategori");
  moveCategoryReferences(state, kind, source, replacement);
  list.splice(list.indexOf(source), 1);
  delete state.catalogOptions[kind === "products" ? "categoryKeys" : "materialCategoryKeys"][source];
}

export function reorderCategories(state, names) {
  const current = state.catalogOptions.categories;
  if (!Array.isArray(names) || names.length !== current.length || new Set(names).size !== current.length || names.some((name) => !current.includes(name))) throw new Error("Daftar kategori berubah. Muat ulang pengaturan tab.");
  state.catalogOptions.categories = [...names];
}

export function savePic(state, input, id = null) {
  const name = clean(input);
  if (!name || name.length > 100) throw new Error("Nama PIC wajib diisi (maksimal 100 karakter)");
  if (state.pics.some((pic) => pic.id !== id && pic.name.toLowerCase() === name.toLowerCase())) throw new Error("Nama PIC sudah digunakan");
  if (!id) { const pic = { id: `pic-${crypto.randomUUID()}`, name, active: true }; state.pics.push(pic); return pic; }
  const pic = state.pics.find((item) => item.id === id && !item.deletedAt);
  if (!pic) throw new Error("PIC tidak ditemukan");
  state.orders.forEach((order) => { if (liveOrder(order) && order.designPicId === id) order.designPic = name; });
  pic.name = name;
  return pic;
}

export function deletePic(state, id) {
  const pic = state.pics.find((item) => item.id === id && !item.deletedAt);
  if (!pic) throw new Error("PIC tidak ditemukan");
  pic.active = false; pic.deletedAt = new Date().toISOString();
}
