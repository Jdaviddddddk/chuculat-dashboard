const productMap = $('Build Customer Map').first().json.productMap || {};
const setup      = $('Build Customer Map').first().json;

// ── Separar input: páginas de facturas vs resumen de notas crédito ─
const __allInput = $input.all();
const __ncItem   = __allInput.find(p => p.json._type === 'nc_summary');
const allNCs     = __ncItem ? (__ncItem.json.ncs || []) : [];

// ── Facturas del mes activo (en vivo) ─────────────────────────────
const liveInvoices = [];
for (const p of __allInput) {
  if (p.json._type === 'nc_summary') continue;
  for (const inv of (p.json.results || [])) liveInvoices.push(inv);
}

// ── Facturas históricas (archivo permanente hasta cierre de mes) ──
let histRows = [];
try {
  const ph = $('Parse Hist').first().json;
  histRows = Array.isArray(ph) ? ph : (ph.rows || ph.data || []);
} catch (e) { histRows = []; }

// ── Merge + dedup por id (la versión viva pisa la histórica) ──────
const byId = {};
for (const inv of histRows)     byId[inv.id] = inv;
for (const inv of liveInvoices) byId[inv.id] = inv;
let invoices = Object.values(byId);

// ── Filtro por rango solicitado (fecha de factura) ────────────────
const ds = setup.dateStart, de = setup.dateEnd;
invoices = invoices.filter(inv => { const d = String(inv.date || '').slice(0,10); return d >= ds && d <= de; });

const META_ANUAL = 1600000000;
const TODAY = new Date();
const customerMap = setup.customerMap || {};

// NIT colombiano
function isNIT(identification) {
  const raw = String(identification || '').trim();
  if (/\d{8,9}-\d$/.test(raw)) return true;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length !== 9 && digits.length !== 10) return false;
  return /^(800|811|812|813|820|830|832|860|890|891|892|899|900|901|902)/.test(digits);
}
const B2B_OVERRIDE_IDS = new Set(['1007703532']);
function isCompany(inv) {
  const id     = String((inv.customer && inv.customer.identification) || '');
  const digits = id.replace(/[^0-9]/g, '');
  if (B2B_OVERRIDE_IDS.has(digits)) return true;
  const entry = customerMap[digits];
  if (entry && (entry.idType === '31' || entry.personType === 'Company')) return true;
  if (isNIT(id)) return true;
  const name = String((entry && entry.name) || (inv.customer && inv.customer.name) || '').toLowerCase();
  if (/\b(s\.?a\.?s\.?|ltda\.?|s\.?a\b|corp|inc|group|grupo|distribu|comercial|industria|soluciones|servicios|hospitality|retail|inversiones|supertienda|supermercados)\b/i.test(name)) return true;
  return false;
}
// Canal por centro de costo (168=B2C, 166=B2B, 315=Exportación); override empresa en 168 -> B2B
function channelOf(inv) {
  const cc = Number(inv.cost_center);
  if (cc === 315) return 'export';
  if (cc === 166) return 'b2b';
  if (cc === 168) return isCompany(inv) ? 'b2b' : 'b2c';
  return null; // 170 planta / 172 admin / otros: no son venta
}

// Subtotal (sin impuestos) por ítem y por factura: precio × cantidad − descuento
function itemSubtotal(it) {
  const base = Number(it.price || 0) * Number(it.quantity || 1);
  const disc = (it.discount && it.discount.value) ? Number(it.discount.value) : 0;
  return base - disc;
}
// Facturas en moneda extranjera (exportación EUR/USD): convertir a COP con la tasa del documento
function fxOf(doc) { return (doc.currency && doc.currency.exchange_rate) ? Number(doc.currency.exchange_rate) : 1; }
function invSubtotal(inv) { return (inv.items || []).reduce((s, it) => s + itemSubtotal(it), 0) * fxOf(inv); }

function daysSince(d) { if (!d) return 0; return Math.floor((TODAY - new Date(d)) / 86400000); }
function agingBucket(x) { if (x>180) return '>180'; if (x>120) return '>120'; if (x>90) return '>90'; if (x>31) return '>31'; return 'por_vencer'; }

const byCategory = {}, byMonth = {}, byProduct = {}, byCustomer = {};
const expByMonth = {}, expByProduct = {}, expByCustomer = {};
const catMonth = {}, prodMonth = {};   // pivots: categoria/producto x mes
const monthsSet = {};
const carteraFacturas = [];
let totalB2C = 0, totalB2B = 0, totalExport = 0, totalImpuestos = 0;

for (const inv of invoices) {
  const ch = channelOf(inv);
  if (!ch) continue;                       // ignora planta/admin
  const date  = String(inv.date || '');
  const month = date.slice(0, 7);
  const sub   = invSubtotal(inv);          // ← BASE: subtotal sin IVA
  const custId   = String((inv.customer && inv.customer.identification) || inv.id || 'desconocido');
  const __ce     = customerMap[custId.replace(/[^0-9]/g, '')];
  const custName = (__ce && __ce.name) || (inv.customer && inv.customer.name) || custId;

  if (month) monthsSet[month] = 1;

  if (ch === 'export') totalExport += sub;
  else if (ch === 'b2b') totalB2B += sub;
  else totalB2C += sub;

  // Impuestos (informativo)
  const __fx = fxOf(inv);
  for (const it of (inv.items || [])) totalImpuestos += (it.taxes || []).reduce((s,t)=>s+Number(t.value||0),0) * __fx;

  // Cartera (proporcional al subtotal): pendiente_sub = balance * sub/total
  const balance = Number(inv.balance || 0);
  if (balance > 0 && (ch === 'b2b' || ch === 'export')) {
    const tot = Number(inv.total || 0);
    const pendSub = tot > 0 ? balance * (sub / tot) : balance;
    const dias = daysSince(date);
    carteraFacturas.push({
      numero: inv.name || '', fecha: date, cliente: custName, nit: custId, canal: ch,
      total: Math.round(sub), pendiente: Math.round(pendSub),
      diasVencido: dias, bucket: agingBucket(dias)
    });
  }

  // Mensual global
  if (!byMonth[month]) byMonth[month] = { total:0, facturas:0, b2b:0, b2c:0, export:0 };
  byMonth[month].total += sub; byMonth[month].facturas += 1;
  if (ch==='export') byMonth[month].export += sub; else if (ch==='b2b') byMonth[month].b2b += sub; else byMonth[month].b2c += sub;

  // Cliente global
  if (!byCustomer[custId]) byCustomer[custId] = { identification:custId, name:custName, canal:ch, totalCompras:0, facturas:0, ultimaCompra:'', primeraCompra:'' };
  byCustomer[custId].totalCompras += sub; byCustomer[custId].facturas += 1;
  if (!byCustomer[custId].ultimaCompra  || date > byCustomer[custId].ultimaCompra)  byCustomer[custId].ultimaCompra  = date;
  if (!byCustomer[custId].primeraCompra || date < byCustomer[custId].primeraCompra) byCustomer[custId].primeraCompra = date;

  // Productos / categorías (global) + exportación aparte
  for (const it of (inv.items || [])) {
    const code = String(it.code || '');
    const prod = productMap[code] || { name: it.description || code, category: 'Sin categoria' };
    const s = itemSubtotal(it) * __fx, q = Number(it.quantity || 1);

    if (!byCategory[prod.category]) byCategory[prod.category] = { subtotal:0, qty:0, facturas:0 };
    byCategory[prod.category].subtotal += s; byCategory[prod.category].qty += q; byCategory[prod.category].facturas += 1;

    if (!byProduct[code]) byProduct[code] = { code, name:prod.name, category:prod.category, subtotal:0, qty:0, facturas:0 };
    byProduct[code].subtotal += s; byProduct[code].qty += q; byProduct[code].facturas += 1;

    // Pivots x mes
    if (month) {
      if (!catMonth[prod.category]) catMonth[prod.category] = {};
      if (!catMonth[prod.category][month]) catMonth[prod.category][month] = { subtotal:0, qty:0 };
      catMonth[prod.category][month].subtotal += s; catMonth[prod.category][month].qty += q;
      if (!prodMonth[code]) prodMonth[code] = { code, name:prod.name, category:prod.category, m:{} };
      if (!prodMonth[code].m[month]) prodMonth[code].m[month] = { subtotal:0, qty:0 };
      prodMonth[code].m[month].subtotal += s; prodMonth[code].m[month].qty += q;
    }

    if (ch === 'export') {
      if (!expByProduct[code]) expByProduct[code] = { code, name:prod.name, category:prod.category, subtotal:0, qty:0, facturas:0 };
      expByProduct[code].subtotal += s; expByProduct[code].qty += q; expByProduct[code].facturas += 1;
    }
  }

  // Exportación: mensual y clientes
  if (ch === 'export') {
    if (!expByMonth[month]) expByMonth[month] = { total:0, facturas:0 };
    expByMonth[month].total += sub; expByMonth[month].facturas += 1;
    if (!expByCustomer[custId]) expByCustomer[custId] = { identification:custId, name:custName, totalCompras:0, facturas:0, ultimaCompra:'', primeraCompra:'' };
    expByCustomer[custId].totalCompras += sub; expByCustomer[custId].facturas += 1;
    if (!expByCustomer[custId].ultimaCompra  || date > expByCustomer[custId].ultimaCompra)  expByCustomer[custId].ultimaCompra  = date;
    if (!expByCustomer[custId].primeraCompra || date < expByCustomer[custId].primeraCompra) expByCustomer[custId].primeraCompra = date;
  }
}

// ── Netear Notas Crédito del período (totales, meses, productos, pivots) ──
const ncsInRange = allNCs.filter(nc => {
  const d = String(nc.date || '').slice(0,10);
  return d >= ds && d <= de;
});
for (const nc of ncsInRange) {
  const ch = channelOf(nc);
  if (!ch) continue;
  const ncFx  = fxOf(nc);
  const ncSub = (nc.items || []).reduce((s, it) => s + itemSubtotal(it), 0) * ncFx;
  if (ch === 'export') totalExport -= ncSub;
  else if (ch === 'b2b') totalB2B -= ncSub;
  else totalB2C -= ncSub;

  const month = String(nc.date || '').slice(0, 7);
  if (byMonth[month]) {
    byMonth[month].total -= ncSub;
    if (ch === 'export') byMonth[month].export -= ncSub;
    else if (ch === 'b2b') byMonth[month].b2b -= ncSub;
    else byMonth[month].b2c -= ncSub;
  }

  // Restar por producto / categoría / pivots (igual que el reporte de Siigo)
  for (const it of (nc.items || [])) {
    const code = String(it.code || '');
    const prod = productMap[code] || { name: it.description || code, category: 'Sin categoria' };
    const s = itemSubtotal(it) * ncFx, q = Number(it.quantity || 1);
    if (byCategory[prod.category]) { byCategory[prod.category].subtotal -= s; byCategory[prod.category].qty -= q; }
    if (byProduct[code]) { byProduct[code].subtotal -= s; byProduct[code].qty -= q; }
    if (month && catMonth[prod.category] && catMonth[prod.category][month]) {
      catMonth[prod.category][month].subtotal -= s; catMonth[prod.category][month].qty -= q;
    }
    if (month && prodMonth[code] && prodMonth[code].m[month]) {
      prodMonth[code].m[month].subtotal -= s; prodMonth[code].m[month].qty -= q;
    }
    if (ch === 'export' && expByProduct[code]) { expByProduct[code].subtotal -= s; expByProduct[code].qty -= q; }
  }

  // Restar del cliente y de exportación mensual
  const ncCed = String((nc.customer && nc.customer.identification) || '');
  if (ncCed && byCustomer[ncCed]) byCustomer[ncCed].totalCompras -= ncSub;
  if (ch === 'export') {
    if (expByMonth[month]) expByMonth[month].total -= ncSub;
    if (ncCed && expByCustomer[ncCed]) expByCustomer[ncCed].totalCompras -= ncSub;
  }
}

const totalGeneral = totalB2C + totalB2B + totalExport;

const categorias = Object.entries(byCategory).map(([cat,v]) => ({ categoria:cat, subtotal:Math.round(v.subtotal), qty:v.qty, facturas:v.facturas })).sort((a,b)=>b.subtotal-a.subtotal);
const catTotal = categorias.reduce((s,c)=>s+c.subtotal,0);
categorias.forEach(c=>{ c.pct = catTotal>0 ? Math.round(c.subtotal/catTotal*1000)/10 : 0; });

const meses = Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).map(([mes,v])=>({ mes, total:Math.round(v.total), facturas:v.facturas, b2b:Math.round(v.b2b), b2c:Math.round(v.b2c), export:Math.round(v.export) }));

const todosProductos = Object.values(byProduct).sort((a,b)=>b.subtotal-a.subtotal).map(p=>({ code:p.code, name:p.name, category:p.category, subtotal:Math.round(p.subtotal), qty:p.qty, facturas:p.facturas }));

const carteraResumen = {
  totalDeuda: Math.round(carteraFacturas.reduce((s,c)=>s+c.pendiente,0)),
  masde180: Math.round(carteraFacturas.filter(c=>c.diasVencido>180).reduce((s,c)=>s+c.pendiente,0)),
  masde120: Math.round(carteraFacturas.filter(c=>c.diasVencido>120&&c.diasVencido<=180).reduce((s,c)=>s+c.pendiente,0)),
  masde90:  Math.round(carteraFacturas.filter(c=>c.diasVencido>90&&c.diasVencido<=120).reduce((s,c)=>s+c.pendiente,0)),
  masde31:  Math.round(carteraFacturas.filter(c=>c.diasVencido>31&&c.diasVencido<=90).reduce((s,c)=>s+c.pendiente,0)),
  porVencer:Math.round(carteraFacturas.filter(c=>c.diasVencido<=31).reduce((s,c)=>s+c.pendiente,0)),
};
const byCli = {};
for (const c of carteraFacturas) {
  if (!byCli[c.nit]) byCli[c.nit] = { cliente:c.cliente, nit:c.nit, deudaTotal:0, masde180:0, masde120:0, masde90:0, masde31:0, porVencer:0, facturas:0 };
  const b = byCli[c.nit]; b.deudaTotal += c.pendiente; b.facturas += 1;
  if (c.diasVencido>180) b.masde180+=c.pendiente; else if (c.diasVencido>120) b.masde120+=c.pendiente; else if (c.diasVencido>90) b.masde90+=c.pendiente; else if (c.diasVencido>31) b.masde31+=c.pendiente; else b.porVencer+=c.pendiente;
}
const carteraPorCliente = Object.values(byCli).sort((a,b)=>b.deudaTotal-a.deudaTotal).map(c=>({ ...c, deudaTotal:Math.round(c.deudaTotal), masde180:Math.round(c.masde180), masde120:Math.round(c.masde120), masde90:Math.round(c.masde90), masde31:Math.round(c.masde31), porVencer:Math.round(c.porVencer) }));

const clientesB2B = Object.values(byCustomer).filter(c=>c.canal==='b2b').sort((a,b)=>b.totalCompras-a.totalCompras).map(c=>({ ...c, totalCompras:Math.round(c.totalCompras) }));
const clientesB2C = Object.values(byCustomer).filter(c=>c.canal==='b2c').map(c=>({ ...c, totalCompras:Math.round(c.totalCompras) }));

// Exportación
const expMeses = Object.entries(expByMonth).sort((a,b)=>a[0].localeCompare(b[0])).map(([mes,v])=>({ mes, total:Math.round(v.total), facturas:v.facturas }));
const expProductos = Object.values(expByProduct).sort((a,b)=>b.subtotal-a.subtotal).map(p=>({ code:p.code, name:p.name, category:p.category, subtotal:Math.round(p.subtotal), qty:p.qty, facturas:p.facturas }));
const expClientes = Object.values(expByCustomer).sort((a,b)=>b.totalCompras-a.totalCompras).map(c=>({ ...c, totalCompras:Math.round(c.totalCompras) }));

const __payload = {
  meta: { dateStart:setup.dateStart, dateEnd:setup.dateEnd, totalFacturas:invoices.filter(i=>channelOf(i)).length, totalNCs:ncsInRange.length, generadoEn:new Date().toISOString(), base:'subtotal_neto' },
  resumen: {
    totalGeneral:Math.round(totalGeneral), totalB2C:Math.round(totalB2C), totalB2B:Math.round(totalB2B), totalExport:Math.round(totalExport),
    totalSubtotal:Math.round(totalGeneral), totalImpuestos:Math.round(totalImpuestos),
    cumplimientoPct: totalGeneral>0 ? Math.round(totalGeneral/META_ANUAL*1000)/10 : 0,
    metaAnual:META_ANUAL, diferenciaMeta:Math.round(META_ANUAL-totalGeneral)
  },
  categorias, meses,
  top10Productos: todosProductos.slice(0,10), todosProductos,
  carteraB2B: carteraFacturas.sort((a,b)=>b.pendiente-a.pendiente), carteraResumen, carteraPorCliente,
  clientesB2B, clientesB2C, totalClientesB2B:clientesB2B.length, totalClientesB2C:clientesB2C.length,
  exportacion: {
    total: Math.round(totalExport), facturas: invoices.filter(i=>channelOf(i)==='export').length,
    meses: expMeses, productos: expProductos, top10Productos: expProductos.slice(0,10),
    clientes: expClientes, totalClientes: expClientes.length
  },
  pivot: {
    meses: Object.keys(monthsSet).sort(),
    categorias: Object.entries(catMonth).map(([cat, mm]) => {
      const meses = {}; let tSub = 0, tQty = 0;
      for (const [m, v] of Object.entries(mm)) { meses[m] = { subtotal: Math.round(v.subtotal), qty: Math.round(v.qty) }; tSub += v.subtotal; tQty += v.qty; }
      return { categoria: cat, totalSubtotal: Math.round(tSub), totalQty: Math.round(tQty), meses };
    }).sort((a,b)=>b.totalSubtotal-a.totalSubtotal),
    productos: Object.values(prodMonth).map(p => {
      const meses = {}; let tSub = 0, tQty = 0;
      for (const [m, v] of Object.entries(p.m)) { meses[m] = { subtotal: Math.round(v.subtotal), qty: Math.round(v.qty) }; tSub += v.subtotal; tQty += v.qty; }
      return { code: p.code, name: p.name, categoria: p.category, totalSubtotal: Math.round(tSub), totalQty: Math.round(tQty), meses };
    }).sort((a,b)=>b.totalSubtotal-a.totalSubtotal),
    centros: meses.map(m => ({ mes: m.mes, b2c: m.b2c, b2b: m.b2b, export: m.export, total: m.total }))
  }
};

// Cache 10 min (evita rate limits en recargas)
const __sd = $getWorkflowStaticData('global');
const __q = $('Webhook').first().json.query || {};
__sd.ventasCache = { key:(__q.date_start||'')+'|'+(__q.date_end||''), ts:Date.now(), payload:__payload };
return [{ json: __payload }];
