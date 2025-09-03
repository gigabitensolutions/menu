
/* ===========================================================
   Admin – Mar Doce Lar (Demo)
   admin.js – CRUD via FastAPI (sem LocalStorage)
   =========================================================== */

const API_BASE = "http://143.198.115.70:8000"; // <-- ajuste aqui (ex.: https://api.seudominio)
let API_TOKEN = "Wr47VMXY6Caly9VTFt0MYCXy0O2osL6A"; // token (PIN) em memória

/* ============== Utilidades ============== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtBRL = (v) =>
  (typeof v === "number" ? v : Number(v || 0))
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v) => (v == null ? "—" : `${Number(v).toFixed(2)}%`);

const isoToLocal = (iso) => {
  try { return new Date(iso).toLocaleString("pt-BR"); }
  catch { return iso; }
};

function toast(msg) {
  console.log(msg);
  // Troque por um toast visual se quiser:
  // alert(msg);
}

function downloadFile(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function toCSV(rows, headers) {
  const esc = (s) => {
    if (s == null) return "";
    s = String(s);
    if (s.includes('"') || s.includes(";") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [];
  if (headers) lines.push(headers.map(esc).join(";"));
  for (const r of rows) {
    const arr = Array.isArray(r) ? r : Object.values(r);
    lines.push(arr.map(esc).join(";"));
  }
  return lines.join("\n");
}

async function apiFetch(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (!(opts.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (API_TOKEN) headers.set("Authorization", "Bearer " + API_TOKEN);

  let res;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
  } catch (netErr) {
    throw new Error(
      `Falha de rede ao acessar ${API_BASE}${path}. ` +
      `Verifique se a API está online, CORS liberado e se não há bloqueio por HTTPS/HTTP (mixed content).`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = text || res.statusText || "Erro desconhecido";
    throw new Error(`API ${res.status}: ${msg}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* ============== Estado ============== */
let LISTA = [];      // cache da lista atual
let EDIT_ID = null;  // id em edição
let HIST_VIEW = [];  // histórico (modal)
let REPORT_VIEW = [];// relatório (modal)

/* ============== Autenticação ============== */
function setTokenFromPIN(pin) {
  API_TOKEN = pin;
  sessionStorage.setItem("adminToken", pin);
}
function clearToken() {
  API_TOKEN = null;
  sessionStorage.removeItem("adminToken");
}

/* ============== Inicialização da UI ============== */
document.addEventListener("DOMContentLoaded", async () => {
  const lock = $("#lock");
  const app = $("#app");
  const pinInput = $("#pinInput");
  const pinConfirm = $("#pinConfirm");
  const lockFirst = $("#lockFirst");

  // Clique da tabela: registrar UMA única vez
  $("#tbody").addEventListener("click", onTabelaClick);

  // Toolbar / modais
  ligarControles();
  ligarEditor();

  const saved = sessionStorage.getItem("adminToken");
  if (saved) {
    setTokenFromPIN(saved);
    lock.style.display = "none";
    app.style.display = "block";
    await iniciarComHealthCheck();
  } else {
    lockFirst.style.display = "block";
    lock.style.display = "flex";
    app.style.display = "none";
  }

  pinConfirm.addEventListener("click", async () => {
    const pin = pinInput.value.trim();
    if (!pin) return toast("Informe um token (PIN).");
    setTokenFromPIN(pin);
    lock.style.display = "none";
    app.style.display = "block";
    await iniciarComHealthCheck();
  });
});

/* ============== Boot + Health Check ============== */
async function iniciarComHealthCheck() {
  try {
    await apiFetch("/health");
  } catch (e) {
    toast(
      "Não consegui acessar /health. Motivos comuns:\n" +
      "- API offline ou porta errada;\n" +
      "- CORS não liberado para seu domínio;\n" +
      "- Frontend em HTTPS e API em HTTP (mixed content);\n" +
      "- Token incorreto se sua API exigir auth nesse endpoint."
    );
    console.error(e);
  } finally {
    iniciar();
  }
}

function iniciar() {
  carregarEExibir();
}

/* ============== Controles / Toolbar ============== */
function ligarControles() {
  $("#q").addEventListener("input", debounce(carregarEExibir, 250));
  $("#cat").addEventListener("input", debounce(carregarEExibir, 250));
  $("#sort").addEventListener("change", carregarEExibir);

  $("#btnAdd").addEventListener("click", () => {
    EDIT_ID = null;
    limparEditor();
    $("#f_nome").focus();
  });

  // Toolbar superior
  $("#btnExport").addEventListener("click", exportarProdutosJSON);
  $("#btnImport").addEventListener("click", importarProdutosJSON);
  $("#btnExportHist").addEventListener("click", exportarHistoricoCSV);
  $("#btnReport").addEventListener("click", abrirRelatorio);
  $("#btnReset").addEventListener("click", () => {
    toast("Sem overlay LocalStorage. Nada a resetar aqui.");
  });
  $("#btnChangePin").addEventListener("click", () => {
    const novo = prompt("Informe o novo token (Bearer):", API_TOKEN || "");
    if (novo) setTokenFromPIN(novo.trim());
  });
  $("#btnLock").addEventListener("click", () => {
    clearToken();
    $("#app").style.display = "none";
    $("#lockFirst").style.display = "block";
    $("#lock").style.display = "flex";
  });

  // Modal Histórico
  $("#btnHistClose").addEventListener("click", () => fecharModal("#histModal"));
  $("#btnHistClear").addEventListener("click", limparHistoricoTotal);
  $("#btnHistExport").addEventListener("click", () => exportarHistoricoCSV(true));

  // Modal Relatório
  $("#btnRepClose").addEventListener("click", () => fecharModal("#reportModal"));
  $("#btnRepExport").addEventListener("click", exportarRelatorioCSV);
}

/* ============== Carregar & Renderizar Lista ============== */
async function carregarEExibir() {
  try {
    const q = $("#q").value.trim();
    const cat = $("#cat").value.trim();
    const sort = $("#sort").value || "name-asc";
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    params.set("sort", sort);

    LISTA = await apiFetch(`/products?${params.toString()}`);
    renderTabela(LISTA);
    atualizarStatus(LISTA);
  } catch (err) {
    console.error(err);
    toast("Falha ao carregar produtos (veja o console).");
  }
}

function renderTabela(arr) {
  const tb = $("#tbody");
  tb.innerHTML = "";
  for (const p of arr) {
    const tr = document.createElement("tr");

    const precoUnit = getUnitPrice(p);
    const custoUnit = getUnitCost(p);
    const margemUnit = (precoUnit != null && custoUnit != null)
      ? (precoUnit - custoUnit)
      : (p.margem ?? null);

    tr.innerHTML = `
      <td>${escapeHTML(p.nome || "")} ${p.promocao ? `<span class="kbd">promo</span>` : ""}</td>
      <td>${escapeHTML(p.categoria || "—")}</td>
      <td>${escapeHTML(p.volume || "—")}${p.usar_tamanhos ? ` <span class="small">(tamanhos)</span>` : ""}</td>
      <td class="num">${precoUnit != null ? fmtBRL(precoUnit) : "—"}</td>
      <td class="num">${custoUnit != null ? fmtBRL(custoUnit) : "—"}</td>
      <td class="num">${margemUnit != null ? fmtBRL(margemUnit) : "—"} ${p.margem_pct != null ? `<span class="small">(${fmtPct(p.margem_pct)})</span>` : ""}</td>
      <td class="num">${p.estoque ?? 0}</td>
      <td>
        <button class="small" data-acao="edit" data-id="${p.id}">Editar</button>
        <button class="small" data-acao="hist" data-id="${p.id}">Histórico</button>
        <button class="small warn" data-acao="del" data-id="${p.id}">Excluir</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

// Delegação: registrado UMA vez em DOMContentLoaded
function onTabelaClick(ev) {
  const btn = ev.target.closest("button[data-acao]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const acao = btn.dataset.acao;

  if (acao === "edit") {
    const p = LISTA.find((x) => x.id === id);
    if (p) abrirParaEdicao(p);
  } else if (acao === "del") {
    removerProduto(id);
  } else if (acao === "hist") {
    abrirHistorico(id);
  }
}

function atualizarStatus(arr) {
  let itens = arr.length;
  let estoqueTotal = 0;
  let receitaProj = 0;
  let custoProj = 0;
  for (const p of arr) {
    const st = Number(p.estoque || 0);
    estoqueTotal += st;
    const preco = getUnitPrice(p) || 0;
    const custo = getUnitCost(p) || 0;
    receitaProj += st * preco;
    custoProj += st * custo;
  }
  const margem = receitaProj - custoProj;
  $("#status").textContent =
    `${itens} itens • estoque total ${estoqueTotal} • ` +
    `receita proj. ${fmtBRL(receitaProj)} • custo proj. ${fmtBRL(custoProj)} • margem ${fmtBRL(margem)}`;
}

/* ============== Helpers de Produto ============== */
function getUnitPrice(p) {
  if (p.usar_tamanhos && Array.isArray(p.tamanhos) && p.tamanhos.length) {
    return Math.max(...p.tamanhos.map((t) => Number(t.preco || 0)));
  }
  return p.preco != null ? Number(p.preco) : null;
}
function getUnitCost(p) {
  if (p.usar_tamanhos && Array.isArray(p.tamanhos) && p.tamanhos.length) {
    return Math.max(...p.tamanhos.map((t) => Number(t.custo || 0)));
  }
  return p.custo != null ? Number(p.custo) : null;
}

/* ============== Editor ============== */
function ligarEditor() {
  $("#f_usar_tamanhos").addEventListener("change", syncTamanhosUI);

  $("#f_imagem").addEventListener("input", () => {
    const url = $("#f_imagem").value.trim();
    const prev = $("#preview");
    if (url) { prev.src = url; prev.style.display = "block"; }
    else { prev.removeAttribute("src"); prev.style.display = "none"; }
  });

  prepararUploadImagem();

  $("#btnSave").addEventListener("click", salvarProdutoDoEditor);
  $("#btnClear").addEventListener("click", () => {
    EDIT_ID = null;
    limparEditor();
  });

  syncTamanhosUI();
}

function abrirParaEdicao(p) {
  EDIT_ID = p.id;
  $("#f_nome").value = p.nome || "";
  $("#f_categoria").value = p.categoria || "";
  $("#f_volume").value = p.volume || "";
  $("#f_imagem").value = p.imagem_url || "";
  $("#f_estoque").value = p.estoque ?? 0;
  $("#f_promo").checked = !!p.promocao;
  $("#f_destaque").value = p.destaque || "";
  $("#f_usar_tamanhos").checked = !!p.usar_tamanhos;

  if (p.usar_tamanhos && Array.isArray(p.tamanhos)) {
    const [t1, t2, t3] = p.tamanhos;
    $("#f_l_t1").value = t1?.rotulo || "";
    $("#f_p_t1").value = t1?.preco ?? "";
    $("#f_c_t1").value = t1?.custo ?? "";

    $("#f_l_t2").value = t2?.rotulo || "";
    $("#f_p_t2").value = t2?.preco ?? "";
    $("#f_c_t2").value = t2?.custo ?? "";

    $("#f_l_t3").value = t3?.rotulo || "";
    $("#f_p_t3").value = t3?.preco ?? "";
    $("#f_c_t3").value = t3?.custo ?? "";

    $("#f_preco").value = "";
    $("#f_custo").value = "";
  } else {
    $("#f_l_t1").value = $("#f_l_t2").value = $("#f_l_t3").value = "";
    $("#f_p_t1").value = $("#f_p_t2").value = $("#f_p_t3").value = "";
    $("#f_c_t1").value = $("#f_c_t2").value = $("#f_c_t3").value = "";

    $("#f_preco").value = p.preco ?? "";
    $("#f_custo").value = p.custo ?? "";
  }

  const prev = $("#preview");
  if (p.imagem_url) { prev.src = p.imagem_url; prev.style.display = "block"; }
  else { prev.removeAttribute("src"); prev.style.display = "none"; }

  syncTamanhosUI();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function limparEditor() {
  for (const id of [
    "#f_nome", "#f_categoria", "#f_volume", "#f_imagem",
    "#f_preco", "#f_custo", "#f_destaque",
    "#f_l_t1", "#f_l_t2", "#f_l_t3",
    "#f_p_t1", "#f_p_t2", "#f_p_t3",
    "#f_c_t1", "#f_c_t2", "#f_c_t3",
  ]) $(id).value = "";

  $("#f_estoque").value = "0";
  $("#f_promo").checked = false;
  $("#f_usar_tamanhos").checked = false;
  $("#preview").style.display = "none";
  $("#preview").removeAttribute("src");
  syncTamanhosUI();
}

function syncTamanhosUI() {
  const usar = $("#f_usar_tamanhos").checked;
  $("#sizesWrap").style.display = usar ? "block" : "none";
  $("#priceWrap").style.display = usar ? "none" : "block";
}

function prepararUploadImagem() {
  const drop = $("#drop");
  const hidden = document.createElement("input");
  hidden.type = "file";
  hidden.accept = "image/*";
  hidden.style.display = "none";
  document.body.appendChild(hidden);

  drop.addEventListener("click", () => hidden.click());
  hidden.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) await uploadImagem(file);
    hidden.value = "";
  });

  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadImagem(file);
  });
}

async function uploadImagem(file) {
  if (!API_TOKEN) return toast("Bloqueado: informe o token (PIN).");
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(`/upload`, { method: "POST", body: fd });
    const url = (res.url || "").startsWith("http") ? res.url : API_BASE + res.url;
    $("#f_imagem").value = url;
    $("#preview").src = url;
    $("#preview").style.display = "block";
  } catch (err) {
    console.error(err);
    toast("Falha no upload (veja o console).");
  }
}

async function salvarProdutoDoEditor() {
  const usar_tamanhos = $("#f_usar_tamanhos").checked;

  const payload = {
    nome: $("#f_nome").value.trim(),
    categoria: ($("#f_categoria").value.trim() || null),
    volume: ($("#f_volume").value.trim() || null),
    imagem_url: ($("#f_imagem").value.trim() || null),
    estoque: parseInt($("#f_estoque").value || "0", 10),
    promocao: $("#f_promo").checked,
    destaque: ($("#f_destaque").value.trim() || null),
    usar_tamanhos,
    preco: usar_tamanhos ? null : parseFloat($("#f_preco").value || "0"),
    custo: usar_tamanhos ? null : parseFloat($("#f_custo").value || "0"),
    tamanhos: usar_tamanhos ? [
      ...($("#f_l_t1").value ? [{
        rotulo: $("#f_l_t1").value,
        preco: parseFloat($("#f_p_t1").value || "0"),
        custo: parseFloat($("#f_c_t1").value || "0"),
      }] : []),
      ...($("#f_l_t2").value ? [{
        rotulo: $("#f_l_t2").value,
        preco: parseFloat($("#f_p_t2").value || "0"),
        custo: parseFloat($("#f_c_t2").value || "0"),
      }] : []),
      ...($("#f_l_t3").value ? [{
        rotulo: $("#f_l_t3").value,
        preco: parseFloat($("#f_p_t3").value || "0"),
        custo: parseFloat($("#f_c_t3").value || "0"),
      }] : []),
    ] : []
  };

  if (!payload.nome) return toast("Informe o nome do produto.");
  if (!API_TOKEN) return toast("Bloqueado: informe o token (PIN).");

  try {
    if (EDIT_ID) {
      await apiFetch(`/products/${EDIT_ID}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Produto atualizado.");
    } else {
      await apiFetch(`/products`, { method: "POST", body: JSON.stringify(payload) });
      toast("Produto criado.");
    }
    EDIT_ID = null;
    limparEditor();
    await carregarEExibir();
  } catch (err) {
    console.error(err);
    toast("Falha ao salvar produto (veja o console).");
  }
}

async function removerProduto(id) {
  if (!API_TOKEN) return toast("Bloqueado: informe o token (PIN).");
  if (!confirm("Tem certeza que deseja excluir este produto?")) return;
  try {
    await apiFetch(`/products/${id}`, { method: "DELETE" });
    toast("Produto removido.");
    await carregarEExibir();
  } catch (err) {
    console.error(err);
    toast("Falha ao remover produto (veja o console).");
  }
}

/* ============== Histórico ============== */
async function abrirHistorico(productId) {
  try {
    HIST_VIEW = await apiFetch(`/history${productId ? `?product_id=${productId}` : ""}`);
    renderHistorico(HIST_VIEW);
    abrirModal("#histModal");
    $("#histSub").textContent = productId ? `Movimentações do produto #${productId}` : "Movimentações";
  } catch (err) {
    console.error(err);
    toast("Falha ao carregar histórico.");
  }
}

function renderHistorico(rows) {
  const tb = $("#histTable tbody");
  tb.innerHTML = "";
  for (const h of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${isoToLocal(h.created_at)}</td>
      <td>${escapeHTML(h.acao)}</td>
      <td>${h.delta ?? "—"}</td>
      <td>${escapeHTML(h.de_para || "—")}</td>
      <td>${escapeHTML(h.nota || "—")}</td>
    `;
    tb.appendChild(tr);
  }
}

async function limparHistoricoTotal() {
  if (!API_TOKEN) return toast("Bloqueado: informe o token (PIN).");
  if (!confirm("Limpar TODO o histórico? Esta ação não pode ser desfeita.")) return;
  try {
    await apiFetch(`/history`, { method: "DELETE" });
    toast("Histórico limpo.");
    HIST_VIEW = [];
    renderHistorico(HIST_VIEW);
  } catch (err) {
    console.error(err);
    toast("Falha ao limpar histórico.");
  }
}

async function exportarHistoricoCSV(useModalView = false) {
  try {
    const data = useModalView ? HIST_VIEW : await apiFetch(`/history`);
    const rows = data.map((h) => [
      isoToLocal(h.created_at),
      h.acao,
      h.delta ?? "",
      h.de_para ?? "",
      h.nota ?? ""
    ]);
    const csv = toCSV(rows, ["Data/Hora", "Ação", "Δ", "De→Para", "Nota"]);
    downloadFile(`historico_${Date.now()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  } catch (err) {
    console.error(err);
    toast("Falha ao exportar histórico.");
  }
}

/* ============== Relatório ============== */
async function abrirRelatorio() {
  try {
    REPORT_VIEW = await apiFetch(`/report/categories`);
    renderRelatorio(REPORT_VIEW);
    abrirModal("#reportModal");
  } catch (err) {
    console.error(err);
    toast("Falha ao gerar relatório.");
  }
}

function renderRelatorio(rows) {
  const tb = $("#repTable tbody");
  tb.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(r.categoria)}</td>
      <td>${r.itens}</td>
      <td>${r.estoque}</td>
      <td>${fmtBRL(r.receita)}</td>
      <td>${fmtBRL(r.custo)}</td>
      <td>${fmtBRL(r.margem)}</td>
      <td>${fmtPct(r.margem_pct)}</td>
    `;
    tb.appendChild(tr);
  }
}

function exportarRelatorioCSV() {
  const rows = REPORT_VIEW.map((r) => [
    r.categoria, r.itens, r.estoque, r.receita, r.custo, r.margem, r.margem_pct
  ]);
  const csv = toCSV(rows, ["Categoria","Itens","Estoque","Receita","Custo","Margem","Margem %"]);
  downloadFile(`relatorio_${Date.now()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

/* ============== Exportar / Importar Produtos ============== */
async function exportarProdutosJSON() {
  try {
    const items = await apiFetch(`/products`);
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    downloadFile(`produtos_${Date.now()}.json`, blob);
  } catch (err) {
    console.error(err);
    toast("Falha ao exportar JSON.");
  }
}

function importarProdutosJSON() {
  if (!API_TOKEN) return toast("Bloqueado: informe o token (PIN).");
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) return toast("O arquivo deve conter um array JSON de produtos.");
      await apiFetch(`/import`, { method: "POST", body: JSON.stringify(data) });
      toast("Importação concluída.");
      await carregarEExibir();
    } catch (err) {
      console.error(err);
      toast("Falha ao importar JSON.");
    } finally {
      input.value = "";
    }
  };
  input.click();
}

/* ============== Modais ============== */
function abrirModal(sel) { const el = $(sel); if (el) el.style.display = "flex"; }
function fecharModal(sel) { const el = $(sel); if (el) el.style.display = "none"; }

/* ============== Helpers diversos ============== */
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); };
}

function escapeHTML(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
