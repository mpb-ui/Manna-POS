export const PERMISSIONS = [
  ["pos.view", "Buka POS", "POS"],
  ["pos.create", "Buat pesanan", "POS"],
  ["pos.edit", "Edit draft pesanan", "POS"],
  ["pos.payment", "Terima pembayaran", "POS"],
  ["projects.orders", "Lihat tab Order", "Project Management"],
  ["projects.waiting", "Lihat Menunggu Pembayaran", "Project Management"],
  ["projects.money", "Lihat nilai pesanan", "Project Management"],
  ["projects.assign", "Pilih dan ubah PIC", "Project Management"],
  ["projects.status", "Ubah status pekerjaan", "Project Management"],
  ["stock.view", "Lihat stok bahan", "Stok"],
  ["stock.value", "Lihat harga dan nilai stok", "Stok"],
  ["stock.adjust", "Tambah atau sesuaikan stok", "Stok"],
  ["reports.view", "Buka Laporan", "Laporan"],
  ["reports.money", "Lihat omzet dan pembayaran", "Laporan"],
  ["reports.cost", "Lihat HPP, laba, dan margin", "Laporan"],
  ["reports.export", "Download laporan", "Laporan"],
  ["reports.print", "Print laporan", "Laporan"],
  ["master.view", "Buka Master Data", "Master Data"],
  ["master.products", "Kelola produk dan harga", "Master Data"],
  ["master.materials", "Kelola bahan", "Master Data"],
  ["master.finishings", "Kelola finishing", "Master Data"],
  ["master.machines", "Kelola mesin", "Master Data"],
  ["users.manage", "Kelola user dan akses", "User & Akses"],
  ["audit.view", "Lihat audit log", "User & Akses"]
].map(([id, label, group]) => ({ id, label, group }));

const ALL = PERMISSIONS.map((item) => item.id);

export const ROLE_PRESETS = {
  OWNER: { label: "Owner", permissions: ALL, reportScope: "all" },
  ADMIN: { label: "Admin", permissions: ALL.filter((id) => id !== "audit.view"), reportScope: "all" },
  CASHIER: {
    label: "Kasir",
    permissions: ["pos.view", "pos.create", "pos.edit", "pos.payment", "projects.orders", "projects.waiting", "projects.money", "projects.assign", "reports.view", "reports.money", "reports.export", "reports.print"],
    reportScope: "all"
  },
  DESIGN: {
    label: "Operator Design",
    permissions: ["projects.orders", "projects.assign", "projects.status"],
    reportScope: "own"
  },
  PRINT: {
    label: "Operator Cetak",
    permissions: ["projects.orders", "projects.status"],
    reportScope: "own"
  },
  WAREHOUSE: {
    label: "Staff Gudang",
    permissions: ["stock.view", "stock.adjust", "reports.view", "reports.export", "reports.print"],
    reportScope: "today"
  }
};

export function effectivePermissions(user) {
  if (!user) return [];
  return [...new Set(Array.isArray(user.permissions) ? user.permissions : ROLE_PRESETS[user.role]?.permissions || [])]
    .filter((id) => PERMISSIONS.some((item) => item.id === id));
}

export function hasPermission(user, permission) {
  return effectivePermissions(user).includes(permission);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    roleLabel: ROLE_PRESETS[user.role]?.label || user.role,
    permissions: effectivePermissions(user),
    reportScope: user.reportScope || ROLE_PRESETS[user.role]?.reportScope || "all",
    active: user.active !== false,
    lastLoginAt: user.lastLoginAt || null
  };
}

export function orderVisibleToUser(order, user) {
  if (!user) return false;
  if (order.status === "MENUNGGU_PEMBAYARAN") return hasPermission(user, "projects.waiting");
  return hasPermission(user, "projects.orders");
}

export function allowedStatusForRole(role, current, target) {
  if (["OWNER", "ADMIN", "CASHIER"].includes(role)) return true;
  if (role === "DESIGN") return current === "DESAIN" && target === "CETAK";
  if (role === "PRINT") return ["CETAK", "FINISHING"].includes(current) && ["FINISHING", "SELESAI"].includes(target);
  return false;
}
