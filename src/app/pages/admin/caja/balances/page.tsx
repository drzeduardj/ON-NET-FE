"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/app/components/adminLayout";
import Link from "next/link";

const apiHost = process.env.NEXT_PUBLIC_API_HOST as string;

interface Pago {
  id: number;
  monto: number;
  // Cuándo se registró el cobro. La pone la base de datos y no se edita: es la
  // que manda para el arqueo. Llega como 'YYYY-MM-DD HH:mm:ss'.
  fecha_emision: string;
  // La que el cajero escribe y sale impresa en el recibo. Sólo informativa.
  fecha_pago: string;
  mes_aplicado: number;
  anio_aplicado: number;
  cliente_nombre?: string;
}

interface Gasto {
  id: number;
  descripcion: string;
  monto: number;
  fecha: string; // idem arriba
}

const TZ = "America/Tegucigalpa";

const getAuthHeaders = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${String(token)}` } : {};
};

const headersInit = (): HeadersInit => ({
  "Content-Type": "application/json",
  ...getAuthHeaders(),
});

const formatMoney = (n: number): string =>
  new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(n);

const monthName = (m: number): string =>
  ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][m - 1] || String(m);

// --- 🔧 FECHAS: SIEMPRE LOCAL ---
// Corta a 'YYYY-MM-DD' si viene con 'T'/'Z' y crea Date local (sin desplazamiento por zona horaria)
const parseDateLocal = (input: string): Date => {
  if (!input) return new Date(NaN);
  const s = String(input);
  // Toma la fecha del inicio del texto, venga como sea: 'YYYY-MM-DD',
  // 'YYYY-MM-DDTHH:mm:ss.sssZ' (ISO) o 'YYYY-MM-DD HH:mm:ss' (DATETIME de
  // MySQL, que es como llega fecha_emision).
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  }
  // Fallback (menos recomendado, pero mantiene compatibilidad)
  return new Date(s);
};

// Formateador consistente a es-HN en la TZ correcta
const formatDateHN = (d: Date): string =>
  new Intl.DateTimeFormat("es-HN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

// Rango completo del mes (1 → último día del mes) en local
const monthRange = (year: number, month: number) => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
};

const BalanceMensual = () => {
  const now = new Date();
  const [anio, setAnio] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const range = monthRange(anio, mes);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [ingresos, setIngresos] = useState<Pago[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);

  const requestIdRef = useRef(0);

  const safeFetch = async (url: string): Promise<Response> => {
    const myId = ++requestIdRef.current;
    const res = await fetch(url, { headers: headersInit() });
    if (myId !== requestIdRef.current) {
      return new Response(null, { status: 499, statusText: "Stale response" });
    }
    return res;
  };

  useEffect(() => {
    void cargarBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes]);

  const cargarBalance = async (): Promise<void> => {
    try {
      setLoading(true);
      setError("");

      // ===== Ingresos =====
      const res = await safeFetch(`${apiHost}/api/pagos/mes/${mes}/${anio}`);
      if (res.status === 499) return;

      if (res.ok) {
        const data: Pago[] = await res.json();
        const ini = range.start;
        const fin = range.end;
        // Se filtra por fecha_emision (cuándo entró el dinero), no por
        // fecha_pago (lo que dice el recibo, que el cajero puede cambiar).
        const pagosFiltrados = data.filter((p) => {
          const registrado = parseDateLocal(p.fecha_emision ?? p.fecha_pago);
          return registrado >= ini && registrado <= fin;
        });
        setIngresos(pagosFiltrados);
      } else {
        setIngresos([]);
      }

      // ===== Gastos =====
      const rg = await safeFetch(`${apiHost}/api/gastos`);
      if (rg.status === 499) return;

      if (rg.ok) {
        const list: Gasto[] = await rg.json();
        const ini = range.start;
        const fin = range.end;
        const filtered = list.filter((g) => {
          const d = parseDateLocal(g.fecha);
          return d >= ini && d <= fin;
        });
        setGastos(filtered);
      } else {
        setGastos([]);
      }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "No se pudo cargar el balance");
      setIngresos([]);
      setGastos([]);
    } finally {
      setLoading(false);
    }
  };

  const totalIngresos = useMemo<number>(() => ingresos.reduce((s, p) => s + (Number(p.monto) || 0), 0), [ingresos]);
  const totalGastos = useMemo<number>(() => gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0), [gastos]);
  const utilidad = totalIngresos - totalGastos;

  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-orange-600">Balance Mensual</h1>
            <p className="text-slate-600 mt-1">
              Resumen del {monthName(mes)} {anio} (del 1 al {range.end.getDate()})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pages/admin/gastos" className="inline-flex items-center px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 text-sm">
              ← Gestión de Gastos
            </Link>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mes</label>
              <select
                className="w-full px-3 py-2 border rounded-md"
                value={mes}
                onChange={(e) => setMes(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-md"
                value={anio}
                onChange={(e) => setAnio(parseInt(e.target.value, 10))}
                min={2000}
                max={2100}
              />
            </div>
            <div className="md:col-span-3 flex items-end">
              <button
                onClick={() => void cargarBalance()}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="text-sm text-slate-600">Ingresos</div>
            <div className="text-2xl font-bold text-green-600">{formatMoney(totalIngresos)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="text-sm text-slate-600">Gastos</div>
            <div className="text-2xl font-bold text-red-600">{formatMoney(totalGastos)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="text-sm text-slate-600">Resultado</div>
            <div className={`text-2xl font-bold ${utilidad >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatMoney(utilidad)} {utilidad >= 0 ? "(Beneficio)" : "(Pérdida)"}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="text-sm text-slate-600">Movimientos</div>
            <div className="text-2xl font-bold text-blue-600">
              {ingresos.length} pagos / {gastos.length} gastos
            </div>
          </div>
        </div>

        {/* Ingresos */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-slate-700">Ingresos (Pagos)</div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Registrado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Fecha del recibo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Cargando...</td></tr>
                ) : ingresos.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Sin pagos en el periodo</td></tr>
                ) : (
                  ingresos
                    .slice()
                    .sort(
                      (a, b) =>
                        parseDateLocal(a.fecha_emision ?? a.fecha_pago).getTime() -
                        parseDateLocal(b.fecha_emision ?? b.fecha_pago).getTime()
                    )
                    .map((p) => {
                      const registrado = parseDateLocal(p.fecha_emision ?? p.fecha_pago);
                      const recibo = parseDateLocal(p.fecha_pago);
                      // Si el recibo dice otro día que el del registro, se
                      // resalta: es la señal de un cobro mandado a otro mes.
                      const difiere =
                        formatDateHN(registrado) !== formatDateHN(recibo);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm">{p.id}</td>
                          <td className="px-4 py-3 text-sm">{formatDateHN(registrado)}</td>
                          <td
                            className={`px-4 py-3 text-sm ${
                              difiere ? "font-semibold text-amber-700" : "text-slate-500"
                            }`}
                            title={
                              difiere
                                ? "La fecha impresa en el recibo no coincide con el día en que se registró el cobro."
                                : undefined
                            }
                          >
                            {formatDateHN(recibo)}
                            {difiere ? " ⚠" : ""}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-green-700">
                            {formatMoney(Number(p.monto) || 0)}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gastos */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-slate-700">Gastos</div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Descripción</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Cargando...</td></tr>
                ) : gastos.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Sin gastos en el periodo</td></tr>
                ) : (
                  gastos
                    .slice()
                    .sort((a, b) => parseDateLocal(a.fecha).getTime() - parseDateLocal(b.fecha).getTime())
                    .map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm">{g.id}</td>
                        <td className="px-4 py-3 text-sm">{g.descripcion}</td>
                        <td className="px-4 py-3 text-sm">
                          {formatDateHN(parseDateLocal(g.fecha))}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-700">
                          {formatMoney(Number(g.monto) || 0)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {error && <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}
      </div>
    </AdminLayout>
  );
};

export default BalanceMensual;
