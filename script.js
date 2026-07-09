// ============================================
//   script.js
// ============================================

// ===== データ =====
const DEFAULT_ITEMS = [
  {
    id: 1, name: "商品A", sku: "SKU-001", category: "グッズ", stock: 10,
    priceOriginal: 3000, priceSell: 2800, priceDiscount: 2000,
    customFields: [
      { label: "生産国", value: "日本" },
      { label: "素材",   value: "コットン100%" },
    ]
  },
  {
    id: 2, name: "商品B", sku: "SKU-002", category: "グッズ", stock: 2,
    priceOriginal: 1500, priceSell: 1500, priceDiscount: null,
    customFields: []
  },
  {
    id: 3, name: "商品C", sku: "SKU-003", category: "アパレル", stock: 5,
    priceOriginal: 8000, priceSell: 7500, priceDiscount: 5000,
    customFields: [{ label: "カラー", value: "ネイビー" }]
  },
];

const saved = localStorage.getItem("inventory_items");
let items = saved ? JSON.parse(saved) : DEFAULT_ITEMS;

function saveItems() {
  localStorage.setItem("inventory_items", JSON.stringify(items));
}

// ===== 履歴データ =====
let inventoryHistory = JSON.parse(localStorage.getItem("inventory_history") || "[]");

function saveHistory() {
  localStorage.setItem("inventory_history", JSON.stringify(inventoryHistory));
}

// 履歴を1件追加
// stock_changeは2分以内の同じ商品への操作をまとめる
const MERGE_MINUTES = 1;

function addHistory(type, itemName, detail) {
  if (type === "stock_change") {
    const now     = Date.now();
    const cutoff  = now - MERGE_MINUTES * 60 * 1000;
    const last    = inventoryHistory[0];

    // 直前の履歴が同じ商品のstock_changeで2分以内なら合算
    if (
      last &&
      last.type     === "stock_change" &&
      last.itemName === itemName &&
      new Date(last.date).getTime() > cutoff
    ) {
      const prev  = parseInt(last.detail);  // 例: "+3" → 3
      const added = parseInt(detail);       // 例: "+1" → 1
      const total = prev + added;
      last.detail = (total >= 0 ? "+" : "") + total;
      last.date   = new Date().toISOString(); // 最終操作時刻に更新
      saveHistory();
      return;
    }
  }

  // まとめられない場合は新規追加
  inventoryHistory.unshift({
    id:       Date.now(),
    type,
    itemName,
    detail,
    date:     new Date().toISOString(),
  });

  // 最大1000件で自動トリム
  if (inventoryHistory.length > 1000) inventoryHistory = inventoryHistory.slice(0, 1000);
  saveHistory();
}

const LOW = 3;

// ===== 表示モード =====
let currentView    = localStorage.getItem("viewMode") || "list";
let currentSort    = "default";
let currentFilters = []; // 複数選択対応（空=すべて）
let currentPrice   = "all";

function setView(mode) {
  currentView = mode;
  localStorage.setItem("viewMode", mode);

  // タブのアクティブ状態を切り替え
  ["list","grid2","grid3"].forEach(m => {
    document.getElementById("tab-" + m).classList.toggle("active", m === mode);
  });

  renderList();
}

// ============================================
//   並び替え・フィルター
// ============================================

const SORT_LABELS = {
  default:    "登録順",
  name_asc:   "商品名順",
  stock_desc: "在庫多い順",
  stock_asc:  "在庫少ない順",
  price_desc: "価格高い順",
  price_asc:  "価格安い順",
  date_desc:  "新しい順",
  date_asc:   "古い順",
};

const FILTER_LABELS = {
  all:           "すべて",
  in_stock:      "在庫あり",
  low_stock:     "残りわずか",
  out_of_stock:  "在庫切れ",
};

const PRICE_LABELS = {
  all:         "すべて",
  under_1000:  "〜¥1,000",
  "1000_5000": "¥1,000〜¥5,000",
  over_5000:   "¥5,000〜",
};

function setSort(sort) {
  currentSort = sort;
  document.getElementById("sortLabel").textContent = SORT_LABELS[sort] || sort;
  closeAllDropdowns();
  updateActiveTags();
  updateDropdownHighlight();
  renderList();
}

function setFilter(filter) {
  if (filter === "all") {
    // 「すべて」を選んだらリセット
    currentFilters = [];
  } else {
    // すでに選択中なら解除、そうでなければ追加
    const idx = currentFilters.indexOf(filter);
    if (idx >= 0) {
      currentFilters.splice(idx, 1);
    } else {
      currentFilters.push(filter);
    }
  }

  // ボタンラベルを更新
  const label = currentFilters.length === 0 ? "すべて"
    : currentFilters.length === 1
      ? (FILTER_LABELS[currentFilters[0]] || currentFilters[0].replace("cat:", ""))
      : `${currentFilters.length}件選択中`;
  document.getElementById("filterLabel").textContent = label;

  updateActiveTags();
  updateDropdownHighlight();
  renderList();
}

function setPriceFilter(price) {
  currentPrice = price;
  closeAllDropdowns();
  updateActiveTags();
  updateDropdownHighlight();
  renderList();
}

// カテゴリフィルターメニューを動的生成
function updateCategoryFilter() {
  const cats = [...new Set(items.map(i => i.category).filter(Boolean))];
  const container = document.getElementById("categoryFilterItems");
  if (!container) return;
  container.innerHTML = cats.map(cat =>
    `<div class="dropdown-item ${currentFilter === 'cat:' + cat ? 'selected' : ''}" onclick="setFilter('cat:${cat}')">
      <span class="dropdown-check">${currentFilter === 'cat:' + cat ? '✓' : ''}</span>${cat}
    </div>`
  ).join("");
}

// ドロップダウンの選択中アイテムをハイライト
function updateDropdownHighlight() {
  // 並び替えメニュー
  document.querySelectorAll("#sortMenu .dropdown-item").forEach(el => {
    const match = (el.getAttribute("onclick") || "").match(/setSort\('(.+?)'\)/);
    if (!match) return;
    const val = match[1];
    el.classList.toggle("selected", val === currentSort);
    const check = el.querySelector(".dropdown-check");
    if (check) check.textContent = val === currentSort ? "✓" : "";
  });

  // フィルターメニュー
  document.querySelectorAll("#filterMenu .dropdown-item").forEach(el => {
    const onclick = el.getAttribute("onclick") || "";
    const filterMatch = onclick.match(/setFilter\('(.+?)'\)/);
    const priceMatch  = onclick.match(/setPriceFilter\('(.+?)'\)/);
    const check = el.querySelector(".dropdown-check");

    if (filterMatch) {
      const val = filterMatch[1];
      const isSelected = val === "all"
        ? currentFilters.length === 0
        : currentFilters.includes(val);
      el.classList.toggle("selected", isSelected);
      if (check) check.textContent = isSelected ? "✓" : "";
    }
    if (priceMatch) {
      const val = priceMatch[1];
      el.classList.toggle("selected", val === currentPrice);
      if (check) check.textContent = val === currentPrice ? "✓" : "";
    }
  });

  // カテゴリフィルターも更新
  updateCategoryFilter();
}

// アクティブフィルタータグを更新
function updateActiveTags() {
  const tags = [];
  if (currentSort !== "default") {
    tags.push({ label: SORT_LABELS[currentSort], clear: () => setSort("default") });
  }
  currentFilters.forEach(f => {
    const label = FILTER_LABELS[f] || f.replace("cat:", "");
    tags.push({ label, clear: () => setFilter(f) });
  });
  if (currentPrice !== "all") {
    tags.push({ label: PRICE_LABELS[currentPrice], clear: () => setPriceFilter("all") });
  }

  const el = document.getElementById("activeTags");
  if (!el) return;
  el.innerHTML = tags.map((t, i) => `
    <span class="active-tag" onclick="clearTag(${i})">
      ${t.label} ✕
    </span>
  `).join("");
  el._tags = tags;
}

function clearTag(i) {
  const el = document.getElementById("activeTags");
  if (el && el._tags && el._tags[i]) el._tags[i].clear();
}

// ドロップダウンの開閉
function toggleDropdown(id) {
  const menu = document.getElementById(id);
  const isOpen = menu.classList.contains("open");
  closeAllDropdowns();
  if (!isOpen) menu.classList.add("open");
}

function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu").forEach(m => m.classList.remove("open"));
}

// 外クリックで閉じる
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown-wrap")) closeAllDropdowns();
});

// ページ読み込み時にタブの初期状態を即時反映
function initViewTabs() {
  ["list","grid2","grid3"].forEach(m => {
    const tab = document.getElementById("tab-" + m);
    if (tab) tab.classList.toggle("active", m === currentView);
  });
}

// ===== 金額フォーマット =====
function yen(val) {
  if (!val && val !== 0) return null;
  return "¥" + Number(val).toLocaleString();
}

// ===== 画面を更新 =====
function renderList() {
  const search = document.getElementById("searchInput").value;
  const listEl = document.getElementById("itemList");

  // 検索フィルター
  let filtered = items.filter(item =>
    item.name.includes(search) ||
    (item.sku || "").includes(search) ||
    (item.category || "").includes(search)
  );

  // 在庫状況・カテゴリフィルター（複数選択対応）
  if (currentFilters.length > 0) {
    filtered = filtered.filter(item => {
      return currentFilters.some(f => {
        if (f === "in_stock")     return item.stock > LOW;
        if (f === "low_stock")    return item.stock > 0 && item.stock <= LOW;
        if (f === "out_of_stock") return item.stock === 0;
        if (f.startsWith("cat:")) return (item.category || "") === f.slice(4);
        return true;
      });
    });
  }

  // 価格帯フィルター
  if (currentPrice === "under_1000")  filtered = filtered.filter(i => i.priceSell && i.priceSell < 1000);
  else if (currentPrice === "1000_5000") filtered = filtered.filter(i => i.priceSell && i.priceSell >= 1000 && i.priceSell <= 5000);
  else if (currentPrice === "over_5000") filtered = filtered.filter(i => i.priceSell && i.priceSell > 5000);

  // 並び替え
  filtered = [...filtered].sort((a, b) => {
    switch (currentSort) {
      case "name_asc":   return a.name.localeCompare(b.name, "ja");
      case "stock_desc": return b.stock - a.stock;
      case "stock_asc":  return a.stock - b.stock;
      case "price_desc": return (b.priceSell || 0) - (a.priceSell || 0);
      case "price_asc":  return (a.priceSell || 0) - (b.priceSell || 0);
      case "date_desc":  return b.id - a.id;
      case "date_asc":   return a.id - b.id;
      default:           return 0;
    }
  });

  // カテゴリフィルターメニューを動的生成
  updateCategoryFilter();

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">商品が見つかりません</div>';
    listEl.className = "";
    updateSummary();
    return;
  }

  // リスト表示
  if (currentView === "list") {
    listEl.className = "view-list";
    listEl.innerHTML = filtered.map(item => {
      let cardClass = "";
      let badge = '<span class="badge green">在庫あり</span>';
      if (item.stock === 0)       { cardClass = "empty"; badge = '<span class="badge red">在庫切れ</span>'; }
      else if (item.stock <= LOW) { cardClass = "low";   badge = '<span class="badge yellow">残りわずか</span>'; }
      const stockBoxClass = item.stock === 0 ? "card-stock-display empty"
        : item.stock <= LOW ? "card-stock-display low"
        : "card-stock-display";
      const numClass = item.stock === 0 ? "stock-num empty"
        : item.stock <= LOW ? "stock-num low"
        : "stock-num";
      const listPhoto = item.photo
        ? `<img src="${item.photo}" class="list-card-photo" alt="${item.name}" />`
        : `<div class="list-card-photo list-card-nophoto">NO<br>IMAGE</div>`;
      return `
        <div class="item-card ${cardClass}" onclick="openDetail(${item.id})" style="cursor:pointer;">
          ${listPhoto}
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-meta">
              ${item.sku ? "SKU: " + item.sku : ""}
              ${item.category ? "　" + item.category : ""}
            </div>
            ${badge}
          </div>
          <div class="card-price-col">
            ${item.priceSell ? `<span class="card-price">${yen(item.priceSell)}</span>` : `<span class="card-price-empty">-</span>`}
          </div>
          <div class="${stockBoxClass}">
            <span class="card-stock-label">在庫</span>
            <span class="${numClass}">${item.stock}</span>
          </div>
        </div>`;
    }).join("");

  // グリッド表示（2列・3列共通）
  } else {
    listEl.className = currentView === "grid2" ? "view-grid2" : "view-grid3";
    listEl.innerHTML = filtered.map(item => {
      let cardClass = "";
      let badge = '<span class="badge green">在庫あり</span>';
      if (item.stock === 0)       { cardClass = "empty"; badge = '<span class="badge red">在庫切れ</span>'; }
      else if (item.stock <= LOW) { cardClass = "low";   badge = '<span class="badge yellow">残りわずか</span>'; }
      const stockBoxClass = item.stock === 0 ? "card-stock-display empty"
        : item.stock <= LOW ? "card-stock-display low"
        : "card-stock-display";
      const numClass = item.stock === 0 ? "stock-num empty" : item.stock <= LOW ? "stock-num low" : "stock-num";
      const photoHtml = item.photo
        ? `<img src="${item.photo}" class="grid-photo" alt="${item.name}" />`
        : `<div class="grid-photo-placeholder">NO IMAGE</div>`;
      return `
        <div class="grid-card ${cardClass}" onclick="openDetail(${item.id})" style="cursor:pointer;">
          ${photoHtml}
          <div class="grid-body">
            <div class="grid-name">${item.name}</div>
            <div class="grid-meta">${item.category || "　"}</div>
            <div class="grid-price-row">
              ${item.priceSell ? `<span class="grid-price">${yen(item.priceSell)}</span>` : `<span class="grid-price-empty">-</span>`}
            </div>
            <div class="grid-footer">
              ${badge}
              <div class="${stockBoxClass}" style="padding:4px 8px;">
                <span class="card-stock-label">在庫</span>
                <span class="${numClass}" style="font-size:15px;">${item.stock}</span>
              </div>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  updateSummary();
}

// ===== サマリー更新 =====
function updateSummary() {
  const total = items.reduce((sum, i) => sum + i.stock, 0);
  const low   = items.filter(i => i.stock > 0 && i.stock <= LOW).length;
  const empty = items.filter(i => i.stock === 0).length;
  document.getElementById("totalStock").textContent = total + " 点";
  document.getElementById("lowCount").textContent   = low  + " 品目";
  document.getElementById("emptyCount").textContent = empty + " 品目";
}

// ===== 在庫増減 =====
// recordHistory: trueのときだけ履歴に記録（まとめて増減のときのみ）
function changeStock(id, delta, recordHistory = false) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (delta < 0 && item.stock === 0) { showToast("在庫がすでに0です", "#b71c1c"); return; }
  item.stock = Math.max(0, item.stock + delta);
  saveItems();
  if (recordHistory) {
    addHistory("stock_change", item.name, (delta > 0 ? "+" : "") + delta);
  }
  showToast(delta > 0 ? `+${delta} 増やしました` : `${delta} 減らしました`, delta > 0 ? "#1a4fa0" : "#b07800");
  renderList();
  if (currentDetailId === id) refreshDetail();
}

// ===== 商品削除 =====
function deleteItem(id) {
  if (!confirm("この商品を削除しますか？")) return;
  const target = items.find(i => i.id === id);
  if (target) addHistory("item_delete", target.name, "削除");
  items = items.filter(i => i.id !== id);
  saveItems();
  showToast("商品を削除しました", "#b71c1c");
  renderList();
  closeDetail();
}

// ===== トースト =====
let toastTimer = null;
function showToast(msg, color = "#1a7a45") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.background = color;
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = "none"; }, 2000);
}

initViewTabs();
renderList();


// ============================================
//   商品追加・編集フォーム
// ============================================

let editingId = null; // null=新規追加、id=編集中

// ===== モーダルを開く（新規） =====
function openModal() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "商品を追加";
  document.getElementById("modalSubmitBtn").textContent = "追加する";

  // フォームリセット
  ["inputName","inputSku","inputCategory","inputStock",
   "inputPriceOriginal","inputPriceSell","inputPriceDiscount"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("customFields").innerHTML = "";
  resetPhotoPreview();
  document.getElementById("modalOverlay").classList.add("active");
}

// ===== モーダルを開く（編集） =====
function openEditModal() {
  const item = items.find(i => i.id === currentDetailId);
  if (!item) return;

  editingId = item.id;
  document.getElementById("modalTitle").textContent = "商品を編集";
  document.getElementById("modalSubmitBtn").textContent = "保存する";

  document.getElementById("inputName").value          = item.name || "";
  document.getElementById("inputSku").value           = item.sku || "";
  document.getElementById("inputCategory").value      = item.category || "";
  document.getElementById("inputStock").value         = item.stock ?? "";
  document.getElementById("inputPriceOriginal").value = item.priceOriginal ?? "";
  document.getElementById("inputPriceSell").value     = item.priceSell ?? "";
  document.getElementById("inputPriceDiscount").value = item.priceDiscount ?? "";

  // カスタムフィールドを復元
  document.getElementById("customFields").innerHTML = "";
  (item.customFields || []).forEach(f => addCustomField(f.label, f.value));

  // 写真を復元
  if (item.photo) {
    setPhotoPreview(item.photo);
  } else {
    resetPhotoPreview();
  }

  document.getElementById("detailOverlay").classList.remove("active");
  document.getElementById("modalOverlay").classList.add("active");
}

// ===== フォーム送信（追加 or 編集） =====
function submitModal() {
  const name          = document.getElementById("inputName").value.trim();
  const sku           = document.getElementById("inputSku").value.trim();
  const category      = document.getElementById("inputCategory").value.trim();
  const stock         = parseInt(document.getElementById("inputStock").value) || 0;
  const priceOriginal = parseFloat(document.getElementById("inputPriceOriginal").value) || null;
  const priceSell     = parseFloat(document.getElementById("inputPriceSell").value) || null;
  const priceDiscount = parseFloat(document.getElementById("inputPriceDiscount").value) || null;

  if (!name) { alert("商品名を入力してください"); return; }

  // カスタムフィールドを収集
  const customFields = [];
  document.querySelectorAll(".custom-field-row").forEach(row => {
    const label = row.querySelector(".cf-label").value.trim();
    const value = row.querySelector(".cf-value").value.trim();
    if (label || value) customFields.push({ label, value });
  });

  if (editingId === null) {
    // 新規追加
    items.push({ id: Date.now(), name, sku, category, stock, priceOriginal, priceSell, priceDiscount, customFields, photo: currentPhoto });
    addHistory("item_add", name, "新規追加");
    showToast("商品を追加しました");
  } else {
    // 編集保存：変更前の状態を記録してから更新
    const item = items.find(i => i.id === editingId);
    if (item) {
      // 変更された項目を検出
      const changes = [];

      const fieldLabels = {
        name:          "商品名",
        sku:           "SKU",
        category:      "カテゴリ",
        stock:         "在庫数",
        priceOriginal: "定価",
        priceSell:     "販売価格",
        priceDiscount: "割引価格",
      };

      // 基本フィールドの差分チェック
      const priceFields = ["priceOriginal", "priceSell", "priceDiscount"];
      const newValues = { name, sku, category, stock, priceOriginal, priceSell, priceDiscount };
      Object.entries(fieldLabels).forEach(([key, label]) => {
        const oldVal = item[key] ?? "";
        const newVal = newValues[key] ?? "";
        if (String(oldVal) !== String(newVal)) {
          if (priceFields.includes(key)) {
            // 価格のみ変更前後を表示
            const oldDisplay = oldVal ? "¥" + Number(oldVal).toLocaleString() : "(未設定)";
            const newDisplay = newVal ? "¥" + Number(newVal).toLocaleString() : "(削除)";
            changes.push(`${label}: ${oldDisplay} → ${newDisplay}`);
          } else {
            const displayVal = newVal || "(削除)";
            changes.push(`${label}: ${displayVal} に変更`);
          }
        }
      });

      // カスタムフィールドの差分チェック
      const oldCF = (item.customFields || []).reduce((acc, f) => { acc[f.label] = f.value; return acc; }, {});
      const newCF = customFields.reduce((acc, f) => { acc[f.label] = f.value; return acc; }, {});

      // 新規追加・変更されたフィールド
      Object.entries(newCF).forEach(([label, value]) => {
        if (oldCF[label] !== value) {
          changes.push(`${label}: ${value} に変更`);
        }
      });

      // 削除されたフィールド
      Object.keys(oldCF).forEach(label => {
        if (!(label in newCF)) {
          changes.push(`${label}: (削除)`);
        }
      });

      // 写真の変更
      if ((item.photo || null) !== (currentPhoto || null)) {
        changes.push(currentPhoto ? "写真: 更新" : "写真: 削除");
      }

      // 変更があれば履歴に記録
      if (changes.length > 0) {
        addHistory("item_edit", name, changes);
      }

      // 実際に更新
      item.name          = name;
      item.sku           = sku;
      item.category      = category;
      item.stock         = stock;
      item.priceOriginal = priceOriginal;
      item.priceSell     = priceSell;
      item.priceDiscount = priceDiscount;
      item.customFields  = customFields;
      item.photo         = currentPhoto;
    }
    showToast("変更を保存しました");
    setTimeout(() => { openDetail(editingId); }, 100);
  }

  saveItems();
  closeModal();
  renderList();
}

// ===== モーダルを閉じる =====
function closeModal(event) {
  if (event && event.target !== document.getElementById("modalOverlay")) return;
  document.getElementById("modalOverlay").classList.remove("active");
}

// ===== カスタムフィールドを1行追加 =====
function addCustomField(label = "", value = "") {
  const container = document.getElementById("customFields");
  const row = document.createElement("div");
  row.className = "custom-field-row";
  row.innerHTML = `
    <input class="cf-label" type="text" placeholder="項目名（例: 素材）" value="${label}" />
    <input class="cf-value" type="text" placeholder="内容（例: コットン100%）" value="${value}" />
    <button class="cf-remove" onclick="this.parentElement.remove()" title="削除">✕</button>
  `;
  container.appendChild(row);
  row.querySelector(".cf-label").focus();
}


// ============================================
//   商品詳細モーダル
// ============================================

let currentDetailId = null;

function openDetail(id) {
  currentDetailId = id;
  refreshDetail();
  document.getElementById("manualInput").value = "";
  document.getElementById("detailOverlay").classList.add("active");
}

function refreshDetail() {
  const item = items.find(i => i.id === currentDetailId);
  if (!item) return;

  document.getElementById("detailName").textContent = item.name;
  document.getElementById("detailMeta").textContent =
    [item.sku ? "SKU: " + item.sku : "", item.category].filter(Boolean).join("　");

  // 写真
  const photoWrap = document.getElementById("detailPhotoWrap");
  const photoImg  = document.getElementById("detailPhoto");
  if (item.photo) {
    photoImg.src = item.photo;
    photoWrap.style.display = "block";
  } else {
    photoImg.src = "";
    photoWrap.style.display = "none";
  }

  // バッジ
  let badgeHtml = '<span class="badge green">在庫あり</span>';
  if (item.stock === 0)       badgeHtml = '<span class="badge red">在庫切れ</span>';
  else if (item.stock <= LOW) badgeHtml = '<span class="badge yellow">残りわずか</span>';
  document.getElementById("detailBadge").innerHTML = badgeHtml;

  // 価格
  const prices = [
    { label: "定価",     value: item.priceOriginal, style: "original" },
    { label: "販売価格", value: item.priceSell,     style: "sell"     },
    { label: "割引価格", value: item.priceDiscount, style: "discount" },
  ].filter(p => p.value);

  document.getElementById("detailPrices").innerHTML = prices.length
    ? `<div class="price-row">${prices.map(p =>
        `<div class="price-item ${p.style}">
          <div class="price-label">${p.label}</div>
          <div class="price-value">${yen(p.value)}</div>
        </div>`
      ).join("")}</div>`
    : "";

  // 在庫数
  const numEl = document.getElementById("detailStockNum");
  numEl.textContent = item.stock;
  numEl.className = "detail-stock-num";
  if (item.stock === 0)       numEl.classList.add("empty");
  else if (item.stock <= LOW) numEl.classList.add("low");

  // カスタムフィールド
  const cf = item.customFields || [];
  document.getElementById("detailCustomFields").innerHTML = cf.length
    ? `<hr class="detail-divider" />
       <div class="cf-display">
         ${cf.map(f => `
           <div class="cf-display-row">
             <span class="cf-display-label">${f.label}</span>
             <span class="cf-display-value">${f.value}</span>
           </div>`).join("")}
       </div>`
    : "";
}

function detailChange(delta) {
  if (currentDetailId === null) return;
  changeStock(currentDetailId, delta, true); // 詳細モーダルの操作は全て記録
}

function detailManual(direction) {
  if (currentDetailId === null) return;
  const val = parseInt(document.getElementById("manualInput").value);
  if (!val || val <= 0) { showToast("数量を入力してください", "#b71c1c"); return; }
  changeStock(currentDetailId, direction * val, true); // ← まとめて増減のみ履歴記録
  document.getElementById("manualInput").value = "";
}

function closeDetail(event) {
  if (event && event.target !== document.getElementById("detailOverlay")) return;
  document.getElementById("detailOverlay").classList.remove("active");
  currentDetailId = null;
}


// ============================================
//   スキャナー（@zxing/library）
// ============================================

let scanMode = null, scanDone = false, codeReader = null, scanControls = null;

async function openScanner(mode) {
  scanMode = mode; scanDone = false;
  const resultEl = document.getElementById("scanResult");
  resultEl.innerHTML = "スキャン待機中...";
  resultEl.style.color = "#888";
  document.getElementById("scannerTitle").textContent =
    mode === "register" ? "📷 SKUをスキャン" : "📷 商品をスキャン";
  document.getElementById("scannerOverlay").classList.add("active");

  try {
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.QR_CODE,
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.UPC_A,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

    codeReader = new ZXing.BrowserMultiFormatReader(hints);

    let lastCode    = null;
    let matchCount  = 0;
    const CONFIRM   = 5;

    // facingMode: "environment" で外カメを強制指定
    // iOSでもAndroidでもラベル名に関係なく背面カメラが起動する
    const videoConstraints = {
      facingMode: { exact: "environment" }
    };

    try {
      scanControls = await codeReader.decodeFromConstraints(
        { video: videoConstraints },
        document.getElementById("scannerVideo"),
        (result, error) => {
          if (!result || scanDone) return;
          const code = result.getText();
          if (code === lastCode) {
            matchCount++;
            if (matchCount >= CONFIRM && !scanDone) showScanCandidate(code);
          } else {
            lastCode = code; matchCount = 1;
          }
        }
      );
    } catch (e) {
      // exact指定が失敗した場合（PCなど）はidealにフォールバック
      const devices = await codeReader.listVideoInputDevices();
      if (devices.length === 0) throw new Error("カメラが見つかりません");
      const backCamera = devices.find(d => /back|rear|environment/i.test(d.label));
      const deviceId = backCamera ? backCamera.deviceId : devices[devices.length - 1].deviceId;
      scanControls = await codeReader.decodeFromVideoDevice(
        deviceId,
        document.getElementById("scannerVideo"),
        (result, error) => {
          if (!result || scanDone) return;
          const code = result.getText();
          if (code === lastCode) {
            matchCount++;
            if (matchCount >= CONFIRM && !scanDone) showScanCandidate(code);
          } else {
            lastCode = code; matchCount = 1;
          }
        }
      );
    }
  } catch (err) {
    resultEl.textContent = "⚠️ カメラを起動できませんでした: " + err.message;
    resultEl.style.color = "#b71c1c";
  }
}

// ===== 読み取り候補を表示してユーザーに確認させる =====
function showScanCandidate(code) {
  const resultEl = document.getElementById("scanResult");

  // すでに候補表示中なら無視
  if (resultEl.dataset.candidate === code) return;
  resultEl.dataset.candidate = code;

  resultEl.style.color = "#1a4fa0";
  resultEl.innerHTML = `
    <div style="margin-bottom:8px; font-size:13px; color:#555;">読み取りました</div>
    <div style="font-size:18px; font-weight:800; letter-spacing:2px; margin-bottom:12px;">${code}</div>
    <div style="display:flex; gap:8px;">
      <button class="btn-primary" style="flex:1;" onclick="confirmScan('${code}')">✅ これで確定</button>
      <button class="btn-cancel"  style="flex:1;" onclick="retryScan()">🔄 読み直す</button>
    </div>
  `;
}

// ===== 確定 =====
function confirmScan(code) {
  scanDone = true;
  stopScanner();
  handleScanResult(code);
}

// ===== 読み直す =====
function retryScan() {
  const resultEl = document.getElementById("scanResult");
  resultEl.innerHTML = "スキャン待機中...";
  resultEl.style.color = "#888";
  delete resultEl.dataset.candidate;
  // scanDoneはfalseのままなのでスキャンは継続している
}

function handleScanResult(code) {
  const resultEl = document.getElementById("scanResult");
  stopScanner();

  if (scanMode === "register") {
    resultEl.textContent = "✅ 読み取り完了: " + code;
    resultEl.style.color = "#1a7a45";
    showToast("バーコードを読み取りました！");
    setTimeout(() => { closeScanner(); document.getElementById("inputSku").value = code; }, 800);
  } else {
    const matched = items.find(i => i.sku === code);
    if (matched) {
      resultEl.style.color = "#1a7a45";
      resultEl.textContent = `✅ ${matched.name} を検出しました`;
      setTimeout(() => { closeScanner(); openDetail(matched.id); }, 700);
    } else {
      resultEl.style.color = "#b07800";
      resultEl.innerHTML = `⚠️ 未登録のコード: <b>${code}</b>`;
      const btn = document.createElement("button");
      btn.textContent = "＋ この商品を新規登録する";
      btn.className = "btn-primary";
      btn.style.cssText = "margin-top:10px; width:100%; display:block;";
      btn.onclick = () => {
        closeScanner();
        openModal();
        setTimeout(() => { document.getElementById("inputSku").value = code; }, 100);
      };
      resultEl.appendChild(btn);
    }
  }
}

function stopScanner() {
  if (scanControls) { scanControls.stop(); scanControls = null; }
}

function closeScanner() {
  stopScanner();

  // codeReaderをリセット
  if (codeReader) { codeReader.reset(); codeReader = null; }

  // videoタグのストリームを完全に停止（これをしないと次回内カメになる）
  const video = document.getElementById("scannerVideo");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  document.getElementById("scannerOverlay").classList.remove("active");
  document.getElementById("scanResult").innerHTML = "";
  delete document.getElementById("scanResult").dataset.candidate;
  scanDone = false;
}


// ============================================
//   写真アップロード機能
// ============================================

let currentPhoto = null; // 現在選択中の写真（Base64文字列 or null）

// ===== 写真が選択されたとき =====
function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Canvasで圧縮してBase64に変換
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // 最大600pxにリサイズ（縦横比は維持）
      const MAX = 600;
      let w = img.width;
      let h = img.height;
      if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      else if (h > MAX)     { w = Math.round(w * MAX / h); h = MAX; }

      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);

      // JPEG品質80%で圧縮
      const compressed = canvas.toDataURL("image/jpeg", 0.8);
      currentPhoto = compressed;
      setPhotoPreview(compressed);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ===== プレビューを表示 =====
function setPhotoPreview(src) {
  const preview     = document.getElementById("photoPreview");
  const placeholder = document.getElementById("photoPlaceholder");
  const removeBtn   = document.getElementById("photoRemoveBtn");

  preview.src           = src;
  preview.style.display = "block";
  placeholder.style.display = "none";
  removeBtn.style.display   = "inline-block";
}

// ===== プレビューをリセット =====
function resetPhotoPreview() {
  currentPhoto = null;
  const preview     = document.getElementById("photoPreview");
  const placeholder = document.getElementById("photoPlaceholder");
  const removeBtn   = document.getElementById("photoRemoveBtn");
  const fileInput   = document.getElementById("inputPhoto");

  preview.src           = "";
  preview.style.display = "none";
  placeholder.style.display = "flex";
  removeBtn.style.display   = "none";
  fileInput.value = ""; // ファイル選択をリセット
}

// ===== 写真を削除 =====
function removePhoto(event) {
  event.stopPropagation(); // upload-areaのクリックが発火しないように
  resetPhotoPreview();
}


// ============================================
//   履歴モーダル
// ============================================

let historyFilter = "all";

// ===== 履歴モーダルを開く =====
function openHistory() {
  historyFilter = "all";
  ["all","today","week","month"].forEach(f => {
    document.getElementById("filter-" + f).classList.toggle("active", f === "all");
  });
  renderHistory();
  document.getElementById("historyOverlay").classList.add("active");
}

// ===== 履歴フィルターを切り替える =====
function setHistoryFilter(filter) {
  historyFilter = filter;
  ["all","today","week","month"].forEach(f => {
    document.getElementById("filter-" + f).classList.toggle("active", f === filter);
  });
  renderHistory();
}

// ===== フィルターに合った履歴を取得 =====
function getFilteredHistory() {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);
  const month = new Date(today); month.setMonth(today.getMonth() - 1);

  return inventoryHistory.filter(h => {
    const d = new Date(h.date);
    if (historyFilter === "today") return d >= today;
    if (historyFilter === "week")  return d >= week;
    if (historyFilter === "month") return d >= month;
    return true;
  });
}

// ===== 履歴を表示 =====
function renderHistory() {
  const listEl   = document.getElementById("historyList");
  const filtered = getFilteredHistory();

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="history-empty">履歴がありません</div>';
    return;
  }

  // 日付でグループ化
  const groups = {};
  filtered.forEach(h => {
    const day = new Date(h.date).toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", weekday: "short"
    });
    if (!groups[day]) groups[day] = [];
    groups[day].push(h);
  });

  listEl.innerHTML = Object.entries(groups).map(([day, logs]) => `
    <div class="history-group">
      <div class="history-date-label">📅 ${day}</div>
      <div class="history-cards">
        ${logs.map(h => {
          const time = new Date(h.date).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
          const date = new Date(h.date).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });

          const isPlus = h.detail && !Array.isArray(h.detail) && h.detail.startsWith("+");
          const typeInfo = {
            stock_change: { icon: isPlus ? "📈" : "📉", label: "在庫変動",  borderColor: isPlus ? "#3a6df0" : "#b71c1c" },
            item_add:     { icon: "✅",                  label: "商品追加",  borderColor: "#1a7a45" },
            item_delete:  { icon: "🗑️",                 label: "商品削除",  borderColor: "#b71c1c" },
            item_edit:    { icon: "✏️",                  label: "商品編集",  borderColor: "#b07800" },
          }[h.type] || { icon: "📝", label: "操作", borderColor: "#aaa" };

          // 内容テキスト
          let contentHtml = "";
          if (h.type === "stock_change") {
            const isP = h.detail && h.detail.startsWith("+");
            contentHtml = `<span class="hc-tag ${isP ? "plus" : "minus"}">${h.detail}</span>`;
          } else if (h.type === "item_edit" && Array.isArray(h.detail)) {
            contentHtml = `<div class="hc-change-list">${h.detail.map(d =>
              `<div class="hc-change-item">・${d}</div>`
            ).join("")}</div>`;
          } else {
            contentHtml = `<span class="hc-tag neutral">${
              h.type === "item_add" ? "新規登録" :
              h.type === "item_delete" ? "削除" : h.detail
            }</span>`;
          }

          return `
            <div class="history-card" style="border-left: 4px solid ${typeInfo.borderColor};">
              <div class="hc-top">
                <span class="hc-icon">${typeInfo.icon}</span>
                <span class="hc-type-label">${typeInfo.label}</span>
                <span class="hc-time">🕐 ${date} ${time}</span>
              </div>
              <div class="hc-body">
                <div class="hc-row">
                  <span class="hc-label">商品名</span>
                  <span class="hc-value name">${h.itemName}</span>
                </div>
                <div class="hc-row">
                  <span class="hc-label">内　容</span>
                  <div class="hc-value">${contentHtml}</div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");
}

// ===== 表示中の履歴を削除 =====
function deleteHistoryByFilter() {
  const label = { all: "全履歴", today: "今日の履歴", week: "今週の履歴", month: "今月の履歴" }[historyFilter];
  if (!confirm(`${label}を削除しますか？`)) return;

  const filtered = getFilteredHistory();
  const deleteIds = new Set(filtered.map(h => h.id));
  inventoryHistory = inventoryHistory.filter(h => !deleteIds.has(h.id));
  saveHistory();
  renderHistory();
  showToast(`${label}を削除しました`, "#b71c1c");
}

// ===== 全履歴を削除 =====
function deleteAllHistory() {
  if (!confirm("全ての履歴を削除しますか？この操作は元に戻せません。")) return;
  inventoryHistory = [];
  saveHistory();
  renderHistory();
  showToast("全履歴を削除しました", "#b71c1c");
}

// ===== 履歴モーダルを閉じる =====
function closeHistory(event) {
  if (event && event.target !== document.getElementById("historyOverlay")) return;
  document.getElementById("historyOverlay").classList.remove("active");
}