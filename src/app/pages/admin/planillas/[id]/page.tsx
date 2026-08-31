"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import { ArrowLeft, Plus, Pencil, Trash2, Users, Lock, LockOpen, Wallet } from "lucide-react";
import AdminLayout from "@/app/components/adminLayout";
import { useModulo } from "@/app/auth/useModulo";
import {
  obtenerPlanilla,
  obtenerLiquidacion,
  obtenerCatalogos,
  obtenerProyectos,
  eliminarDia,
  cambiarEstadoPlanilla,
  crearGastoPlanilla,
  eliminarGastoPlanilla,
  crearPagoColaborador,
  crearVale,
  formatoLempiras,
  formatoNumero,
  formatoFecha,
  hoyISO,
  esErrorDeAcceso,
  num,
  type Planilla,
  type Liquidacion,
  type Catalogos,
  type Proyecto,
  type EstadoPlanilla
} from "@/app/lib/planillasApi";
import {
  Cargando,
  AccesoDenegado,
  MensajeError,
  Vacio,
  Tarjeta,
  TarjetaMonto,
  Monto,
  Etiqueta,
  Modal,
  Campo,
  claseInput,
  claseBotonPrimario,
  claseBotonSecundario
} from "../components/ui";
import DiaModal from "./components/DiaModal";
import IntegrantesModal from "./components/IntegrantesModal";

type Pestana = "dias" | "liquidacion" | "gastos";

const DetallePlanilla = () => {
  const { permitido, verificando, error: errorAcceso } = useModulo("planillas");
  const params = useParams<{ id: string }>();
  const planillaId = Number(params?.id);

  const [planilla, setPlanilla] = useState<Planilla | null>(null);
  const [liquidacion, setLiquidacion] = useState<Liquidacion[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState<Pestana>("dias");

  const [diaModal, setDiaModal] = useState<{ abierto: boolean; diaId: number | null }>({
    abierto: false,
    diaId: null
  });
  const [integrantesAbierto, setIntegrantesAbierto] = useState(false);

  // Pago / vale a un colaborador desde la liquidación
  const [pagoModal, setPagoModal] = useState<Liquidacion | null>(null);
  const [pagoForm, setPagoForm] = useState({ tipo: "pago", monto: "", fecha: hoyISO(), referencia: "" });
  const [errorPago, setErrorPago] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);

  // Gasto general del periodo (el caso de la hoja GASTO CARRO)
  const [gastoAbierto, setGastoAbierto] = useState(false);
  const [gastoForm, setGastoForm] = useState({ categoria_id: "", descripcion: "", monto: "", fecha: hoyISO() });
  const [errorGasto, setErrorGasto] = useState("");

  const manejarError = useCallback((e: unknown) => {
    if (esErrorDeAcceso(e)) {
      window.location.href = "/noAuth";
      return;
    }
    setError(e instanceof Error ? e.message : "Error inesperado");
  }, []);

  const cargar = useCallback(async () => {
    if (!Number.isInteger(planillaId) || planillaId <= 0) {
      setError("Planilla inválida");
      setCargando(false);
      return;
    }

    setError("");
    try {
      const [p, l] = await Promise.all([obtenerPlanilla(planillaId), obtenerLiquidacion(planillaId)]);
      setPlanilla(p);
      setLiquidacion(l);
    } catch (e) {
      manejarError(e);
    } finally {
      setCargando(false);
    }
  }, [planillaId, manejarError]);

  useEffect(() => {
    if (!permitido) return;
    cargar();
  }, [permitido, cargar]);

  useEffect(() => {
    if (!permitido) return;
    obtenerCatalogos().then(setCatalogos).catch(() => {});
    obtenerProyectos().then(setProyectos).catch(() => {});
  }, [permitido]);

  const totalesLiquidacion = useMemo(
    () =>
      liquidacion.reduce(
        (a, l) => ({
          devengado: a.devengado + num(l.devengado),
          vales: a.vales + num(l.vales),
          pagado: a.pagado + num(l.pagado),
          saldo: a.saldo + num(l.saldo)
        }),
        { devengado: 0, vales: 0, pagado: 0, saldo: 0 }
      ),
    [liquidacion]
  );

  const bloqueada = planilla?.estado === "pagada";

  const borrarDia = async (diaId: number, fecha: string) => {
    const c = await Swal.fire({
      icon: "warning",
      title: `¿Eliminar el día ${formatoFecha(fecha)}?`,
      text: "Se borran los pagos registrados de ese día.",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626"
    });
    if (!c.isConfirmed) return;

    try {
      await eliminarDia(planillaId, diaId);
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo eliminar", text: e instanceof Error ? e.message : "" });
    }
  };

  const cambiarEstado = async (estado: EstadoPlanilla) => {
    try {
      await cambiarEstadoPlanilla(planillaId, estado);
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo cambiar el estado", text: e instanceof Error ? e.message : "" });
    }
  };

  const abrirPago = (l: Liquidacion) => {
    setPagoForm({
      tipo: "pago",
      // Se propone lo que se le debe. Si ya está al día, queda en blanco.
      monto: num(l.saldo) > 0 ? String(num(l.saldo).toFixed(2)) : "",
      fecha: hoyISO(),
      referencia: ""
    });
    setErrorPago("");
    setPagoModal(l);
  };

  const guardarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoModal) return;
    setErrorPago("");

    if (num(pagoForm.monto) <= 0) return setErrorPago("El monto debe ser mayor que cero");
    if (!pagoForm.fecha) return setErrorPago("Indique la fecha");

    setGuardandoPago(true);
    try {
      const comun = {
        colaborador_id: pagoModal.colaborador_id,
        planilla_id: planillaId,
        monto: num(pagoForm.monto)
      };

      if (pagoForm.tipo === "pago") {
        await crearPagoColaborador({
          ...comun,
          fecha_pago: pagoForm.fecha,
          referencia: pagoForm.referencia.trim() || null
        });
      } else {
        await crearVale({
          ...comun,
          fecha: pagoForm.fecha,
          descripcion: pagoForm.referencia.trim() || null
        });
      }

      setPagoModal(null);
      await cargar();
      Swal.fire({ icon: "success", title: "Registrado", timer: 1400, showConfirmButton: false });
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setErrorPago(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardandoPago(false);
    }
  };

  const guardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorGasto("");

    if (!gastoForm.categoria_id) return setErrorGasto("Seleccione la categoría");
    if (num(gastoForm.monto) <= 0) return setErrorGasto("El monto debe ser mayor que cero");

    try {
      await crearGastoPlanilla({
        planilla_id: planillaId,
        planilla_dia_id: null,
        categoria_id: Number(gastoForm.categoria_id),
        descripcion: gastoForm.descripcion.trim() || null,
        monto: num(gastoForm.monto),
        fecha: gastoForm.fecha
      });
      setGastoAbierto(false);
      setGastoForm({ categoria_id: "", descripcion: "", monto: "", fecha: hoyISO() });
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setErrorGasto(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const borrarGasto = async (id: number) => {
    const c = await Swal.fire({
      icon: "warning",
      title: "¿Eliminar el gasto?",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626"
    });
    if (!c.isConfirmed) return;

    try {
      await eliminarGastoPlanilla(id);
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo eliminar" });
    }
  };

  if (verificando) {
    return <AdminLayout><Cargando texto="Verificando acceso..." /></AdminLayout>;
  }

  if (!permitido) {
    return <AdminLayout><AccesoDenegado mensaje={errorAcceso} /></AdminLayout>;
  }

  if (cargando) {
    return <AdminLayout><Cargando /></AdminLayout>;
  }

  if (!planilla) {
    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto">
          <MensajeError mensaje={error || "No se encontró la planilla"} />
          <Link href="/pages/admin/planillas" className={claseBotonSecundario}>
            <ArrowLeft className="size-4" /> Volver
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const r = planilla.resumen;

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto">
        <Link href="/pages/admin/planillas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-orange-600 mb-3">
          <ArrowLeft className="size-4" /> Planillas
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">{planilla.nombre}</h1>
              <Etiqueta estado={planilla.estado} />
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {r.cuadrilla} · {formatoFecha(planilla.fecha_inicio)} — {formatoFecha(planilla.fecha_fin)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setIntegrantesAbierto(true)} className={claseBotonSecundario}>
              <Users className="size-4" /> Integrantes ({planilla.colaboradores.length})
            </button>
            {bloqueada ? (
              <button onClick={() => cambiarEstado("abierta")} className={claseBotonSecundario}>
                <LockOpen className="size-4" /> Reabrir
              </button>
            ) : (
              <button onClick={() => cambiarEstado("pagada")} className={claseBotonSecundario}>
                <Lock className="size-4" /> Marcar pagada
              </button>
            )}
            <button
              onClick={() => setDiaModal({ abierto: true, diaId: null })}
              disabled={bloqueada}
              className={claseBotonPrimario}
            >
              <Plus className="size-4" /> Registrar día
            </button>
          </div>
        </div>

        <MensajeError mensaje={error} />

        {bloqueada && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
            Planilla <b>pagada</b>: no admite días nuevos ni ediciones. Reábrala para corregirla.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <TarjetaMonto titulo="Entrada" monto={num(r.ingreso_total)} detalle={`${formatoNumero(r.metros_total)} m de fibra`} />
          <Tarjeta titulo="Mano de obra" valor={formatoLempiras(r.mano_obra)} detalle={`${formatoNumero(r.dias_trabajados)} días trabajados`} />
          <Tarjeta titulo="Gastos" valor={formatoLempiras(r.gastos)} />
          <TarjetaMonto titulo="Utilidad" monto={num(r.utilidad)} />
        </div>

        <div className="flex gap-1 border-b border-slate-200 mb-4">
          {([
            ["dias", `Días (${planilla.dias.length})`],
            ["liquidacion", `Liquidación (${liquidacion.length})`],
            ["gastos", `Gastos (${planilla.gastosGenerales.length})`]
          ] as [Pestana, string][]).map(([clave, etiqueta]) => (
            <button
              key={clave}
              onClick={() => setPestana(clave)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                pestana === clave
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {/* ---------- Días ---------- */}
        {pestana === "dias" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            {planilla.dias.length === 0 ? (
              <Vacio texto="Todavía no hay días registrados en esta planilla." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">Fecha</th>
                      <th className="px-3 py-3 text-left font-medium">Sector</th>
                      <th className="px-3 py-3 text-left font-medium">Trabajo</th>
                      <th className="px-3 py-3 text-right font-medium">Metros</th>
                      <th className="px-3 py-3 text-right font-medium">Entrada</th>
                      <th className="px-3 py-3 text-right font-medium">Mano de obra</th>
                      <th className="px-3 py-3 text-right font-medium">Gastos</th>
                      <th className="px-3 py-3 text-right font-medium">Margen</th>
                      <th className="px-3 py-3 text-center font-medium">Estado</th>
                      <th className="px-3 py-3 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planilla.dias.map((d) => (
                      <tr key={d.id} className="hover:bg-orange-50/40">
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{formatoFecha(d.fecha)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{d.sector || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate" title={d.trabajo_realizado ?? ""}>
                          {d.trabajo_realizado || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{formatoNumero(d.metros_total)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatoLempiras(d.ingreso_total)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatoLempiras(d.mano_obra)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatoLempiras(d.gastos)}</td>
                        <td className="px-3 py-2.5 text-right"><Monto valor={d.utilidad} resaltar /></td>
                        <td className="px-3 py-2.5 text-center"><Etiqueta estado={d.estado} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setDiaModal({ abierto: true, diaId: d.id })}
                              disabled={bloqueada}
                              title="Editar"
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              onClick={() => borrarDia(d.id, d.fecha)}
                              disabled={bloqueada}
                              title="Eliminar"
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-40"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <td className="px-3 py-3" colSpan={3}>Total</td>
                      <td className="px-3 py-3 text-right">{formatoNumero(r.metros_total)}</td>
                      <td className="px-3 py-3 text-right">{formatoLempiras(r.ingreso_total)}</td>
                      <td className="px-3 py-3 text-right">{formatoLempiras(r.mano_obra)}</td>
                      <td className="px-3 py-3 text-right">{formatoLempiras(r.gastos)}</td>
                      <td className="px-3 py-3 text-right"><Monto valor={r.utilidad} resaltar /></td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ---------- Liquidación ---------- */}
        {pestana === "liquidacion" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            {liquidacion.length === 0 ? (
              <Vacio texto="La planilla no tiene integrantes. Agréguelos con el botón Integrantes." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">Colaborador</th>
                      <th className="px-3 py-3 text-right font-medium">Jornal</th>
                      <th className="px-3 py-3 text-center font-medium">Días</th>
                      <th className="px-3 py-3 text-right font-medium">Devengado</th>
                      <th className="px-3 py-3 text-right font-medium">Vales</th>
                      <th className="px-3 py-3 text-right font-medium">Pagado</th>
                      <th className="px-3 py-3 text-right font-medium">Saldo</th>
                      <th className="px-3 py-3 text-left font-medium">Último pago</th>
                      <th className="px-3 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liquidacion.map((l) => (
                      <tr key={l.colaborador_id} className="hover:bg-orange-50/40">
                        <td className="px-3 py-2.5 font-medium text-slate-700">{l.alias || l.colaborador}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{formatoLempiras(l.tarifa_diaria)}</td>
                        <td className="px-3 py-2.5 text-center text-slate-600">{formatoNumero(l.dias_trabajados)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatoLempiras(l.devengado)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-700">{formatoLempiras(l.vales)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatoLempiras(l.pagado)}</td>
                        <td className="px-3 py-2.5 text-right"><Monto valor={l.saldo} resaltar /></td>
                        <td className="px-3 py-2.5 text-slate-500">{formatoFecha(l.ultimo_pago)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => abrirPago(l)} className={claseBotonSecundario}>
                            <Wallet className="size-4" /> Registrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <td className="px-3 py-3" colSpan={3}>Total</td>
                      <td className="px-3 py-3 text-right">{formatoLempiras(totalesLiquidacion.devengado)}</td>
                      <td className="px-3 py-3 text-right">{formatoLempiras(totalesLiquidacion.vales)}</td>
                      <td className="px-3 py-3 text-right">{formatoLempiras(totalesLiquidacion.pagado)}</td>
                      <td className="px-3 py-3 text-right"><Monto valor={totalesLiquidacion.saldo} resaltar /></td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
              Saldo = devengado − vales − pagado. Un saldo positivo es lo que todavía se le debe.
            </p>
          </div>
        )}

        {/* ---------- Gastos del periodo ---------- */}
        {pestana === "gastos" && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm text-slate-600">
                Gastos del periodo que no pertenecen a un día concreto (taller del camión, compras del mes).
              </p>
              <button onClick={() => setGastoAbierto(true)} className={claseBotonPrimario}>
                <Plus className="size-4" /> Agregar
              </button>
            </div>

            {planilla.gastosGenerales.length === 0 ? (
              <Vacio texto="No hay gastos generales en este periodo." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Fecha</th>
                      <th className="px-4 py-3 text-left font-medium">Categoría</th>
                      <th className="px-4 py-3 text-left font-medium">Detalle</th>
                      <th className="px-4 py-3 text-right font-medium">Monto</th>
                      <th className="px-4 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planilla.gastosGenerales.map((g) => (
                      <tr key={g.id} className="hover:bg-orange-50/40">
                        <td className="px-4 py-2.5 text-slate-700">{formatoFecha(g.fecha)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{g.categoria}</td>
                        <td className="px-4 py-2.5 text-slate-600">{g.descripcion || "—"}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(g.monto)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => borrarGasto(g.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <DiaModal
        abierto={diaModal.abierto}
        planilla={planilla}
        catalogos={catalogos}
        proyectos={proyectos}
        diaId={diaModal.diaId}
        onCerrar={() => setDiaModal({ abierto: false, diaId: null })}
        onGuardado={cargar}
      />

      <IntegrantesModal
        abierto={integrantesAbierto}
        planilla={planilla}
        onCerrar={() => setIntegrantesAbierto(false)}
        onGuardado={cargar}
      />

      {/* Pago o vale a un colaborador */}
      <Modal
        abierto={pagoModal !== null}
        titulo={`Registrar a ${pagoModal?.alias || pagoModal?.colaborador || ""}`}
        onCerrar={() => setPagoModal(null)}
      >
        <form onSubmit={guardarPago} className="space-y-4">
          <MensajeError mensaje={errorPago} />

          {pagoModal && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-slate-500">Devengado</p>
                <p className="font-medium">{formatoLempiras(pagoModal.devengado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ya pagado + vales</p>
                <p className="font-medium">{formatoLempiras(num(pagoModal.pagado) + num(pagoModal.vales))}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Saldo</p>
                <p className="font-semibold"><Monto valor={pagoModal.saldo} /></p>
              </div>
            </div>
          )}

          <Campo etiqueta="Tipo">
            <select className={claseInput} value={pagoForm.tipo}
              onChange={(e) => setPagoForm({ ...pagoForm, tipo: e.target.value })}>
              <option value="pago">Pago entregado</option>
              <option value="vale">Vale (adelanto)</option>
            </select>
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Monto">
              <input type="number" step="0.01" min="0" className={claseInput} value={pagoForm.monto}
                onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} />
            </Campo>
            <Campo etiqueta={pagoForm.tipo === "pago" ? "Fecha del comprobante" : "Fecha"}>
              <input type="date" className={claseInput} value={pagoForm.fecha}
                onChange={(e) => setPagoForm({ ...pagoForm, fecha: e.target.value })} />
            </Campo>
          </div>

          <Campo etiqueta={pagoForm.tipo === "pago" ? "Referencia" : "Descripción"}>
            <input className={claseInput} value={pagoForm.referencia}
              onChange={(e) => setPagoForm({ ...pagoForm, referencia: e.target.value })} />
          </Campo>

          {pagoForm.tipo === "pago" && (
            <p className="text-xs text-slate-500">
              La fecha del comprobante es la que se imprime. Aparte, el sistema guarda por su cuenta
              cuándo se capturó el pago; esa no se puede editar.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPagoModal(null)} className={claseBotonSecundario}>Cancelar</button>
            <button type="submit" disabled={guardandoPago} className={claseBotonPrimario}>
              {guardandoPago ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Gasto general del periodo */}
      <Modal abierto={gastoAbierto} titulo="Gasto del periodo" onCerrar={() => setGastoAbierto(false)}>
        <form onSubmit={guardarGasto} className="space-y-4">
          <MensajeError mensaje={errorGasto} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Categoría">
              <select className={claseInput} value={gastoForm.categoria_id}
                onChange={(e) => setGastoForm({ ...gastoForm, categoria_id: e.target.value })}>
                <option value="">Seleccione...</option>
                {catalogos?.categoriasGasto.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" className={claseInput} value={gastoForm.fecha}
                onChange={(e) => setGastoForm({ ...gastoForm, fecha: e.target.value })} />
            </Campo>
          </div>

          <Campo etiqueta="Detalle">
            <input className={claseInput} value={gastoForm.descripcion} placeholder="Reparación del camión"
              onChange={(e) => setGastoForm({ ...gastoForm, descripcion: e.target.value })} />
          </Campo>

          <Campo etiqueta="Monto">
            <input type="number" step="0.01" min="0" className={claseInput} value={gastoForm.monto}
              onChange={(e) => setGastoForm({ ...gastoForm, monto: e.target.value })} />
          </Campo>

          <p className="text-xs text-slate-500">
            Esto no es la caja general de la empresa (Registrar Gastos). Son gastos de cuadrilla y no
            deben sumarse junto con aquellos en un mismo reporte.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGastoAbierto(false)} className={claseBotonSecundario}>Cancelar</button>
            <button type="submit" className={claseBotonPrimario}>Guardar</button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
};

export default DetallePlanilla;
