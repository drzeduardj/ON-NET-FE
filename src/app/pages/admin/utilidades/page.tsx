"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/app/components/adminLayout";
import { useModulo } from "@/app/auth/useModulo";
import {
  obtenerResumenUtilidad,
  obtenerUtilidadMensual,
  obtenerUtilidadDiaria,
  formatoLempiras,
  formatoNumero,
  formatoFecha,
  nombreMes,
  esErrorDeAcceso,
  num,
  type ResumenUtilidad,
  type UtilidadMensual,
  type DiaPlanilla
} from "@/app/lib/planillasApi";
import {
  Cargando,
  AccesoDenegado,
  MensajeError,
  Vacio,
  Tarjeta,
  TarjetaMonto,
  Monto,
  Campo,
  claseInput,
  claseBotonSecundario
} from "../planillas/components/ui";

/**
 * Barra proporcional para comparar meses sin traer una librería de gráficas.
 * El ancho se calcula contra el mes de mayor movimiento.
 */
const Barra = ({ valor, maximo, color }: { valor: number; maximo: number; color: string }) => {
  const ancho = maximo > 0 ? Math.min((Math.abs(valor) / maximo) * 100, 100) : 0;
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
    </div>
  );
};

const UtilidadesPage = () => {
  const { permitido, verificando, error: errorAcceso } = useModulo("utilidades");

  const [resumen, setResumen] = useState<ResumenUtilidad | null>(null);
  const [mensual, setMensual] = useState<UtilidadMensual[]>([]);
  const [diaria, setDiaria] = useState<(DiaPlanilla & { planilla: string })[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [rango, setRango] = useState({ desde: "", hasta: "" });

  const manejarError = useCallback((e: unknown) => {
    if (esErrorDeAcceso(e)) {
      window.location.href = "/noAuth";
      return;
    }
    setError(e instanceof Error ? e.message : "Error inesperado");
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const filtros = {
        desde: rango.desde || undefined,
        hasta: rango.hasta || undefined
      };
      const [r, m, d] = await Promise.all([
        obtenerResumenUtilidad(filtros),
        obtenerUtilidadMensual(),
        obtenerUtilidadDiaria(filtros)
      ]);
      setResumen(r);
      setMensual(m);
      setDiaria(d);
    } catch (e) {
      manejarError(e);
    } finally {
      setCargando(false);
    }
  }, [rango, manejarError]);

  useEffect(() => {
    if (!permitido) return;
    cargar();
  }, [permitido, cargar]);

  const maximoMensual = useMemo(
    () => Math.max(0, ...mensual.map((m) => Math.abs(num(m.ingreso)))),
    [mensual]
  );

  // Los días que más margen negativo dejaron. Son los que hay que revisar:
  // se pagó cuadrilla y combustible sin que entrara nada ese día.
  const peoresDias = useMemo(
    () => [...diaria].sort((a, b) => num(a.utilidad) - num(b.utilidad)).slice(0, 10),
    [diaria]
  );

  if (verificando) {
    return <AdminLayout><Cargando texto="Verificando acceso..." /></AdminLayout>;
  }

  if (!permitido) {
    return <AdminLayout><AccesoDenegado mensaje={errorAcceso} /></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">Utilidad y márgenes</h1>
          <p className="text-sm text-slate-600 mt-1">
            Entrada, mano de obra y gasto de cuadrilla. No incluye la caja general de la empresa.
          </p>
        </div>

        <MensajeError mensaje={error} />

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo etiqueta="Desde">
              <input type="date" className={claseInput} value={rango.desde}
                onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="date" className={claseInput} value={rango.hasta}
                onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
            </Campo>
            <div className="flex items-end">
              <button onClick={() => setRango({ desde: "", hasta: "" })}
                className={`${claseBotonSecundario} w-full justify-center`}>
                Todo el histórico
              </button>
            </div>
          </div>
        </div>

        {cargando ? (
          <Cargando />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <TarjetaMonto titulo="Entrada" monto={num(resumen?.ingreso)}
                detalle={`${formatoNumero(resumen?.dias_registrados)} días · ${formatoNumero(resumen?.metros)} m`} />
              <Tarjeta titulo="Mano de obra" valor={formatoLempiras(resumen?.mano_obra)} />
              <Tarjeta titulo="Gastos de cuadrilla" valor={formatoLempiras(resumen?.gastos)} />
              <TarjetaMonto titulo="Utilidad" monto={num(resumen?.utilidad)} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Tarjeta titulo="Por pagar a colaboradores" valor={formatoLempiras(resumen?.pendiente_colaboradores)}
                tono={num(resumen?.pendiente_colaboradores) > 0 ? "aviso" : "positivo"} />
              <Tarjeta titulo="Pagado a colaboradores" valor={formatoLempiras(resumen?.pagado_colaboradores)} />
              <Tarjeta titulo="Contratado en proyectos" valor={formatoLempiras(resumen?.costo_contratado)}
                detalle={`${formatoNumero(resumen?.proyectos)} proyectos`} />
              <Tarjeta titulo="Por cobrar" valor={formatoLempiras(resumen?.pendiente_cobrar)}
                tono={num(resumen?.pendiente_cobrar) > 0 ? "aviso" : "positivo"} />
            </div>

            <p className="text-xs text-slate-500 mb-6">
              &quot;Por pagar a colaboradores&quot; suma sólo los saldos a favor. Compensarlo con quien
              está sobrepagado haría ver la deuda más chica de lo que es.
            </p>

            {/* ---------- Mes a mes ---------- */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Mes a mes</h2>
                <p className="text-xs text-slate-500 mt-0.5">Histórico completo, sin importar el rango de arriba.</p>
              </div>

              {mensual.length === 0 ? (
                <Vacio texto="Todavía no hay días registrados." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Mes</th>
                        <th className="px-4 py-3 text-right font-medium">Entrada</th>
                        <th className="px-4 py-3 text-right font-medium">Mano de obra</th>
                        <th className="px-4 py-3 text-right font-medium">Gastos</th>
                        <th className="px-4 py-3 text-right font-medium">Utilidad</th>
                        <th className="px-4 py-3 text-left font-medium w-40">Proporción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mensual.map((m) => (
                        <tr key={`${m.anio}-${m.mes}`} className="hover:bg-orange-50/40">
                          <td className="px-4 py-2.5 font-medium text-slate-700">
                            {nombreMes(num(m.mes))} {num(m.anio)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(m.ingreso)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(m.mano_obra)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(m.gastos)}</td>
                          <td className="px-4 py-2.5 text-right"><Monto valor={m.utilidad} resaltar /></td>
                          <td className="px-4 py-2.5">
                            <Barra
                              valor={num(m.utilidad)}
                              maximo={maximoMensual}
                              color={num(m.utilidad) < 0 ? "bg-red-400" : "bg-emerald-400"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ---------- Días con peor margen ---------- */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Días con peor margen</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Días en que se pagó cuadrilla y gastos sin que entrara lo suficiente. Vale la pena
                  revisar si falta capturar la entrada o si el trabajo se cobró en otra fecha.
                </p>
              </div>

              {peoresDias.length === 0 ? (
                <Vacio texto="No hay días en el rango seleccionado." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Fecha</th>
                        <th className="px-4 py-3 text-left font-medium">Planilla</th>
                        <th className="px-4 py-3 text-left font-medium">Sector</th>
                        <th className="px-4 py-3 text-right font-medium">Entrada</th>
                        <th className="px-4 py-3 text-right font-medium">Mano de obra</th>
                        <th className="px-4 py-3 text-right font-medium">Gastos</th>
                        <th className="px-4 py-3 text-right font-medium">Margen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {peoresDias.map((d) => (
                        <tr key={d.id} className="hover:bg-orange-50/40">
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{formatoFecha(d.fecha)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{d.planilla}</td>
                          <td className="px-4 py-2.5 text-slate-600">{d.sector || "—"}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(d.ingreso_total)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(d.mano_obra)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(d.gastos)}</td>
                          <td className="px-4 py-2.5 text-right"><Monto valor={d.utilidad} resaltar /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default UtilidadesPage;
