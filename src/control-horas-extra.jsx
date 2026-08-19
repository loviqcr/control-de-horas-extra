import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Clock, Settings, X, Loader2 } from "lucide-react";

const INK = "#07080C";
const CARD = "#10131B";
const CARD_BORDER = "#232B3C";
const PAPER = "#EDF0F5";
const MUTED = "#7C8697";
const BLUE = "#3B8CF5";
const CYAN = "#4FC3F7";
const RUST = "#C1554B";
const SILVER = "#B8C1CE";

const TYPES = [
  { key: "extra", label: "Hora extra", plural: "horas extra", unit: "h", color: BLUE },
  { key: "doble", label: "Hora doble", plural: "horas dobles", unit: "h", color: CYAN },
  { key: "dia", label: "Día adicional", plural: "días adicionales", unit: "día", color: SILVER },
];
const TYPE_META = Object.fromEntries(TYPES.map((t) => [t.key, t]));

function pad(n) { return String(n).padStart(2, "0"); }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtHours(h) {
  const rounded = Math.round(h * 100) / 100;
  return rounded.toString().replace(".", ",");
}

function fmtQty(type, qty) {
  const n = fmtHours(qty);
  if (type === "dia") return `${n} ${qty === 1 ? "día adicional" : "días adicionales"}`;
  return `${n} ${type === "doble" ? "h doble" : "h extra"}`;
}

function summarizeBucket(bucket) {
  const parts = TYPES.filter((t) => bucket[t.key] > 0).map((t) => fmtQty(t.key, bucket[t.key]));
  return parts.length ? parts.join(" · ") : "—";
}

function monthLabel(d) {
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function dayLabel(iso) {
  const dias = ["dom","lun","mar","mié","jue","vie","sáb"];
  const d = new Date(iso + "T00:00:00");
  return `${dias[d.getDay()]} ${d.getDate()}`;
}

const STORAGE_KEY = "ot-entries";
const SETTINGS_KEY = "ot-settings";
const DEFAULT_RATES = { extra: "3506,75", doble: "4675,00", dia: "24543,74" };

export default function OvertimeTracker() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [rates, setRates] = useState(DEFAULT_RATES);
  const [showSettings, setShowSettings] = useState(false);

  const [form, setForm] = useState({
    date: todayISO(),
    type: "extra",
    qty: "",
    note: "",
  });
  const [formError, setFormError] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        let loadedEntries = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) loadedEntries = JSON.parse(raw);
        } catch (e) {
          loadedEntries = [];
        }
        loadedEntries = loadedEntries.map((e) => ({
          id: e.id,
          date: e.date,
          type: e.type || "extra",
          qty: e.qty ?? e.hours ?? 0,
          note: e.note || "",
        }));

        let loadedRates = DEFAULT_RATES;
        try {
          const raw2 = localStorage.getItem(SETTINGS_KEY);
          if (raw2) {
            const parsed = JSON.parse(raw2);
            if (parsed.rates) {
              loadedRates = {
                extra: parsed.rates.extra ?? "",
                doble: parsed.rates.doble ?? "",
                dia: parsed.rates.dia ?? "",
              };
            } else if (parsed.rate) {
              loadedRates = { extra: parsed.rate, doble: "", dia: "" };
            }
          }
        } catch (e) {
          loadedRates = DEFAULT_RATES;
        }

        setEntries(loadedEntries.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id));
        setRates(loadedRates);
      } catch (e) {
        setError("No se pudieron cargar tus datos guardados.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persistEntries(next) {
    setEntries(next);
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setError(null);
    } catch (e) {
      setError("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function persistRate(typeKey, value) {
    setRates((r) => {
      const next = { ...r, [typeKey]: value };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rates: next }));
      } catch (e) {
        setError("No se pudo guardar la tarifa.");
      }
      return next;
    });
  }

  function addEntry() {
    const q = parseFloat(form.qty.replace(",", "."));
    if (!form.date) {
      setFormError("Falta la fecha.");
      return;
    }
    if (!q || q <= 0) {
      setFormError("Ingresa una cantidad válida (mayor a 0).");
      return;
    }
    setFormError("");
    const next = [
      { id: Date.now(), date: form.date, type: form.type, qty: q, note: form.note.trim() },
      ...entries,
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    persistEntries(next);
    setForm({ date: form.date, type: form.type, qty: "", note: "" });
  }

  function deleteEntry(id) {
    persistEntries(entries.filter((e) => e.id !== id));
  }

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const empty = () => ({ extra: 0, doble: 0, dia: 0 });
    const week = empty(), month = empty(), total = empty();

    for (const e of entries) {
      const d = new Date(e.date + "T00:00:00");
      const t = e.type || "extra";
      total[t] += e.qty;
      if (d >= monthStart) month[t] += e.qty;
      if (d >= weekStart) week[t] += e.qty;
    }

    const rateOf = (key) => parseFloat(String(rates[key] || "").replace(",", "."));
    const hasAnyRate = TYPES.some((t) => rateOf(t.key) > 0);
    const payFor = (bucket) =>
      TYPES.reduce((sum, t) => {
        const r = rateOf(t.key);
        return r > 0 ? sum + bucket[t.key] * r : sum;
      }, 0);

    return {
      week, month, total,
      weekPay: hasAnyRate ? payFor(week) : null,
      monthPay: hasAnyRate ? payFor(month) : null,
    };
  }, [entries, rates]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const d = new Date(e.date + "T00:00:00");
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      if (!map.has(key)) map.set(key, { label: monthLabel(d), items: [], sums: { extra: 0, doble: 0, dia: 0 } });
      const g = map.get(key);
      g.items.push(e);
      g.sums[e.type || "extra"] += e.qty;
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const visibleGroups = useMemo(
    () => (monthFilter === "all" ? grouped : grouped.filter(([key]) => key === monthFilter)),
    [grouped, monthFilter]
  );

  if (loading) {
    return (
      <div style={{ background: INK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" color={BLUE} size={28} />
      </div>
    );
  }

  return (
    <div style={{ background: INK, minHeight: "100vh", color: PAPER, fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
        .otbtn:focus-visible, input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 18px 80px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/logo-mark.png"
              alt="JCS Tech Solutions"
              style={{ width: 34, height: 34, borderRadius: 8, boxShadow: `0 0 0 1px ${CARD_BORDER}`, objectFit: "cover" }}
            />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>Control de horas extra</div>
              <div className="mono" style={{ fontSize: 10.5, color: MUTED, letterSpacing: 0.6 }}>JCS TECH SOLUTIONS</div>
            </div>
          </div>
          <button
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Configurar tarifas"
            style={{ background: "transparent", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: 8, color: MUTED, cursor: "pointer" }}
          >
            <Settings size={16} />
          </button>
        </div>

        {showSettings && (
          <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Tarifas (opcional)</div>
              <button onClick={() => setShowSettings(false)} aria-label="Cerrar" style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>
            {TYPES.map((t) => (
              <div key={t.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>{t.label} · ₡ por {t.unit === "h" ? "hora" : "día"}</div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej. 3500"
                  value={rates[t.key]}
                  onChange={(e) => persistRate(t.key, e.target.value)}
                  className="mono"
                  style={{ width: "100%", background: INK, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "10px 12px", color: PAPER, fontSize: 14 }}
                />
              </div>
            ))}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Se usan solo para calcular el pago estimado abajo.</div>
          </div>
        )}

        {/* Hero stat */}
        <div style={{ background: `linear-gradient(160deg, ${CARD}, ${INK})`, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "22px 20px", marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 11, color: MUTED, letterSpacing: 1, marginBottom: 10 }}>ESTE MES · {monthLabel(new Date())}</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {TYPES.map((t) => (
              <div key={t.key}>
                <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: t.color, lineHeight: 1 }}>{fmtHours(stats.month[t.key])}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{t.plural}</div>
              </div>
            ))}
          </div>
          {stats.monthPay !== null && (
            <div className="mono" style={{ fontSize: 13, color: CYAN, marginTop: 12 }}>≈ {stats.monthPay.toLocaleString("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 })} estimado</div>
          )}
          <div style={{ display: "flex", gap: 18, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${CARD_BORDER}`, flexWrap: "wrap" }}>
            <div>
              <div className="mono" style={{ fontSize: 10, color: MUTED }}>ESTA SEMANA</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{summarizeBucket(stats.week)}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: MUTED }}>TOTAL REGISTRADO</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{summarizeBucket(stats.total)}</div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(193,85,75,0.12)", border: `1px solid ${RUST}`, color: RUST, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Add entry form */}
        <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: MUTED, letterSpacing: 0.3 }}>NUEVO REGISTRO</div>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="mono"
            style={{ width: "100%", background: INK, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "10px 12px", color: PAPER, fontSize: 13.5, marginBottom: 10, cursor: "pointer" }}
          >
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="mono"
              style={{ flex: "1 1 140px", background: INK, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "10px 12px", color: PAPER, fontSize: 13.5 }}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={form.type === "dia" ? "Días (ej. 1)" : "Horas (ej. 1,5)"}
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              className="mono"
              style={{ width: 130, background: INK, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "10px 12px", color: PAPER, fontSize: 13.5 }}
            />
          </div>
          <input
            type="text"
            placeholder="Motivo o proyecto (opcional)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            style={{ width: "100%", background: INK, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "10px 12px", color: PAPER, fontSize: 13.5, marginBottom: 10 }}
          />
          {formError && <div style={{ color: RUST, fontSize: 12, marginBottom: 8 }}>{formError}</div>}
          <button
            onClick={addEntry}
            disabled={saving}
            className="otbtn"
            style={{ width: "100%", background: BLUE, color: INK, border: "none", borderRadius: 8, padding: "11px 12px", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            <Plus size={16} /> Agregar registro
          </button>
        </div>

        {/* Ledger */}
        {grouped.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, letterSpacing: 0.3 }}>REGISTROS</div>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="mono"
              style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "8px 10px", color: PAPER, fontSize: 12.5, cursor: "pointer", textTransform: "capitalize" }}
            >
              <option value="all">Todos los meses</option>
              {grouped.map(([key, group]) => (
                <option key={key} value={key}>{group.label}</option>
              ))}
            </select>
          </div>
        )}

        {grouped.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: MUTED }}>
            <Clock size={26} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ fontSize: 14 }}>Aún no hay registros.</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Agrega tu primera entrada arriba.</div>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: MUTED }}>
            <Clock size={26} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ fontSize: 14 }}>No hay registros en ese mes.</div>
          </div>
        ) : (
          visibleGroups.map(([key, group]) => (
            <div key={key} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, padding: "0 2px", gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, textTransform: "capitalize" }}>{group.label}</div>
                <div className="mono" style={{ fontSize: 12, color: CYAN, textAlign: "right" }}>{summarizeBucket(group.sums)}</div>
              </div>
              <div style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                {group.items.map((e, i) => {
                  const meta = TYPE_META[e.type] || TYPE_META.extra;
                  return (
                    <div
                      key={e.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderTop: i === 0 ? "none" : `1px solid ${CARD_BORDER}`,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 12, color: MUTED }}>{dayLabel(e.date)}</div>
                        {e.note && <div style={{ fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</div>}
                      </div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: meta.color, whiteSpace: "nowrap" }}>{fmtQty(e.type, e.qty)}</div>
                      <button
                        onClick={() => deleteEntry(e.id)}
                        aria-label="Eliminar registro"
                        style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: 4, flexShrink: 0 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: MUTED, marginTop: 32 }}>
          © 2026 JCS Tech Solutions — Costa Rica
        </div>
      </div>
    </div>
  );
}
