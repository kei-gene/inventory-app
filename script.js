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

const LOW = 3;

// ===== 金額フォーマット =====
function yen(val) {
  if (!val && val !== 0) return null;
  return "¥" + Number(val).toLocaleString();
}

// ===== 画面を更新 =====
function renderList() {
  const search = document.getElementById("searchInput").value;
  const listEl = document.getElementById("itemList");

  const filtered = items.filter(item =>
    item.name.includes(search) ||
    (item.sku || "").includes(search) ||
    (item.category || "").includes(search)
  );

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">商品が見つかりません</div>';
    updateSummary();
    return;
  }

  listEl.innerHTML = filtered.map(item => {
    let cardClass = "";
    let badge = '<span class="badge green">在庫あり</span>';
    if (item.stock === 0)       { cardClass = "empty"; badge = '<span class="badge red">在庫切れ</span>'; }
    else if (item.stock <= LOW) { cardClass = "low";   badge = '<span class="badge yellow">残りわずか</span>'; }

    const numClass = item.stock === 0 ? "stock-num empty" : "stock-num";

    // 価格表示（販売価格を優先）
    const priceDisplay = item.priceSell
      ? `<div class="card-price">${yen(item.priceSell)}</div>`
      : "";

    return `
      <div class="item-card ${cardClass}" onclick="openDetail(${item.id})" style="cursor:pointer;">
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-meta">
            ${item.sku ? "SKU: " + item.sku : ""}
            ${item.category ? "　" + item.category : ""}
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            ${badge}
            ${priceDisplay}
          </div>
        </div>
        <div class="stock-control">
          <button class="btn-minus" onclick="event.stopPropagation(); changeStock(${item.id}, -1)">−</button>
          <span class="${numClass}">${item.stock}</span>
          <button class="btn-plus"  onclick="event.stopPropagation(); changeStock(${item.id}, +1)">＋</button>
        </div>
        <button class="btn-delete" onclick="event.stopPropagation(); deleteItem(${item.id})" title="削除">✕</button>
      </div>
    `;
  }).join("");

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
function changeStock(id, delta) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (delta < 0 && item.stock === 0) { showToast("在庫がすでに0です", "#b71c1c"); return; }
  item.stock = Math.max(0, item.stock + delta);
  saveItems();
  showToast(delta > 0 ? `+${delta} 増やしました` : `${delta} 減らしました`, delta > 0 ? "#1a4fa0" : "#b07800");
  renderList();
  if (currentDetailId === id) refreshDetail();
}

// ===== 商品削除 =====
function deleteItem(id) {
  if (!confirm("この商品を削除しますか？")) return;
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
    showToast("商品を追加しました");
  } else {
    // 編集保存
    const item = items.find(i => i.id === editingId);
    if (item) {
      item.name          = name;
      item.sku           = sku;
      item.category      = category;
      item.stock         = stock;
      item.priceOriginal = priceOriginal;
      item.priceSell     = priceSell;
      item.priceDiscount = priceDiscount;
      item.customFields  = customFields;
      item.photo         = currentPhoto; // 写真を更新（nullなら削除）
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
  changeStock(currentDetailId, delta);
}

function detailManual(direction) {
  if (currentDetailId === null) return;
  const val = parseInt(document.getElementById("manualInput").value);
  if (!val || val <= 0) { showToast("数量を入力してください", "#b71c1c"); return; }
  changeStock(currentDetailId, direction * val);
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
    codeReader = new ZXing.BrowserMultiFormatReader();
    const devices = await codeReader.listVideoInputDevices();
    if (devices.length === 0) throw new Error("カメラが見つかりません");
    scanControls = await codeReader.decodeFromVideoDevice(
      devices[0].deviceId,
      document.getElementById("scannerVideo"),
      (result, error) => {
        if (result && !scanDone) { scanDone = true; handleScanResult(result.getText()); }
      }
    );
  } catch (err) {
    resultEl.textContent = "⚠️ カメラを起動できませんでした: " + err.message;
    resultEl.style.color = "#b71c1c";
  }
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
  if (codeReader) { codeReader.reset(); codeReader = null; }
  document.getElementById("scannerOverlay").classList.remove("active");
  document.getElementById("scanResult").innerHTML = "";
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