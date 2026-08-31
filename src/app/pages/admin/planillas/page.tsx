"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import AdminLayout from "@/app/components/adminLayout";
import { useModulo } from "@/app/auth/useModulo";
import {
  obtenerPlanillas,
  obtenerCatalogos,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
  formatoLempiras,
  formatoNumero,
  formatoFecha,
  esErrorDeAcceso,
  num,
  type PlanillaResumen,
  type Catalogos,
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
} from "./components/ui";

const ESTADOS: EstadoPlanilla[] = ["abierta", "cerrada", "pagada"];

interface Filtros {
  cuadrilla_id: string;
  estado: string;
  desde: string;
  hasta: string;
}

interface FormPlanilla {
  id: number | null;
  cuadrilla_id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoPlanilla;
  observaciones: string;
}

const FORM_VACIO: FormPlanilla = {
  id: null,
  cuadrilla_id: "",
  nombre: "",
  fecha_inicio: "",
  fecha_fin: "",
  estado: "abierta",
  observaciones: ""
};

const PlanillasPage = () => {
  const { permitido, verificando, error: errorAcceso } = useModulo("planillas");

  const [planillas, setPlanillas] = useState<PlanillaResumen[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [filtros, setFiltros] = useState<Filtros>({
    cuadrilla_id: "",
    estado: "",
    desde: "",
    hasta: ""
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState<FormPlanilla>(FORM_VACIO);
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);

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
      const datos = await obtenerPlanillas({
        cuadrilla_id: filtros.cuadrilla_id ? Number(filtros.cuadrilla_id) : null,
        estado: filtros.estado || null,
        desde: filtros.desde || null,
        hasta: filtros.hasta || null
      });
      setPlanillas(datos);
    } catch (e) {
      manejarError(e);
    } finally {
      setCargando(false);
    }
  }, [filtros, manejarError]);

  useEffect(() => {
    if (!permitido) return;
    cargar();
  }, [permitido, cargar]);

  useEffect(() => {
    if (!permitido) return;
    obtenerCatalogos().then(setCatalogos).catch(manejarError);
  }, [permitido, manejarError]);

  // Totales de lo que está en pantalla. Se recalculan con los filtros: si se
  // mira sólo agosto, las tarjetas hablan de agosto.
  const totales = useMemo(
    () =>
      planillas.reduce(
        (acc, p) => ({
          ingreso: acc.ingreso + num(p.ingreso_total),
          manoObra: acc.manoObra + num(p.mano_obra),
          gastos: acc.gastos + num(p.gastos),
          utilidad: acc.utilidad + num(p.utilidad),
          dias: acc.dias + num(p.dias_trabajados),
          metros: acc.metros + num(p.metros_total)
        }),
        { ingreso: 0, manoObra: 0, gastos: 0, utilidad: 0, dias: 0, metros: 0 }
      ),
    [planillas]
  );

  const abrirNueva = () => {
    setForm(FORM_VACIO);
    setErrorForm("");
    setModalAbierto(true);
  };

  const abrirEdicion = (p: PlanillaResumen) => {
    setForm({
      id: p.planilla_id,
      cuadrilla_id: String(p.cuadrilla_id),
      nombre: p.nombre,
      fecha_inicio: p.fecha_inicio.slice(0, 10),
      fecha_fin: p.fecha_fin.slice(0, 10),
      estado: p.estado,
      observaciones: ""
    });
    setErrorForm("");
    setModalAbierto(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm("");

    if (!form.cuadrilla_id) return setErrorForm("Seleccione una cuadrilla");
    if (!form.nombre.trim()) return setErrorForm("El nombre es obligatorio");
    if (!form.fecha_inicio || !form.fecha_fin) return setErrorForm("Indique el periodo");
    if (form.fecha_fin < form.fecha_inicio) {
      return setErrorForm("La fecha final no puede ser anterior a la inicial");
    }

    const datos = {
      cuadrilla_id: Number(form.cuadrilla_id),
      nombre: form.nombre.trim(),
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      estado: form.estado,
      observaciones: form.observaciones.trim() || null
    };

    setGuardando(true);
    try {
      if (form.id) {
        await actualizarPlanilla(form.id, datos);
      } else {
        await crearPlanilla(datos);
      }
      setModalAbierto(false);
      await cargar();
      Swal.fire({
        icon: "success",
        title: form.id ? "Planilla actualizada" : "Planilla creada",
        timer: 1600,
        showConfirmButton: false
      });
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setErrorForm(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p: PlanillaResumen) => {
    const confirmacion = await Swal.fire({
      icon: "warning",
      title: `¿Eliminar "${p.nombre}"?`,
      html:
        "Se borran también sus días, los pagos del día y los gastos de la cuadrilla.<br>" +
        "<b>Los pagos ya entregados y los vales no se borran</b>: ese dinero sí salió de caja.",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626"
    });

    if (!confirmacion.isConfirmed) return;

    try {
      await eliminarPlanilla(p.planilla_id);
      await cargar();
      Swal.fire({ icon: "success", title: "Planilla eliminada", timer: 1500, showConfirmButton: false });
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo eliminar", text: e instanceof Error ? e.message : "" });
    }
  };

  if (verificando) {
    return <AdminLayout><Cargando texto="Verificando acceso..." /></AdminLayout>;
  }

  if (!permitido) {
    return <AdminLayout><AccesoDenegado mensaje={errorAcceso} /></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">Planillas de campo</h1>
            <p className="text-sm text-slate-600 mt-1">
              Pago diario de cuadrillas, trabajos realizados y utilidad por periodo.
            </p>
          </div>
          <button onClick={abrirNueva} className={claseBotonPrimario}>
            <Plus className="size-4" /> Nueva planilla
          </button>
        </div>

        <MensajeError mensaje={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <TarjetaMonto titulo="Entrada" monto={totales.ingreso} detalle="Lo facturado en el periodo" />
          <Tarjeta titulo="Mano de obra" valor={formatoLempiras(totales.manoObra)} detalle={`${formatoNumero(totales.dias)} días pagados`} />
          <Tarjeta titulo="Gastos de cuadrilla" valor={formatoLempiras(totales.gastos)} detalle="Combustible, comida, vehículo" />
          <TarjetaMonto titulo="Utilidad" monto={totales.utilidad} detalle={`${formatoNumero(totales.metros)} m de fibra`} />
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Campo etiqueta="Cuadrilla">
              <select
                className={claseInput}
                value={filtros.cuadrilla_id}
                onChange={(e) => setFiltros({ ...filtros, cuadrilla_id: e.target.value })}
              >
                <option value="">Todas</option>
                {catalogos?.cuadrillas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Estado">
              <select
                className={claseInput}
                value={filtros.estado}
                onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
              >
                <option value="">Todos</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <input type="date" className={claseInput} value={filtros.desde}
                onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="date" className={claseInput} value={filtros.hasta}
                onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
            </Campo>
            <div className="flex items-end">
              <button
                onClick={() => setFiltros({ cuadrilla_id: "", estado: "", desde: "", hasta: "" })}
                className={`${claseBotonSecundario} w-full justify-center`}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <Cargando />
          ) : planillas.length === 0 ? (
            <Vacio texto="No hay planillas con esos filtros. Cree una para empezar a capturar los días." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Planilla</th>
                    <th className="px-4 py-3 text-left font-medium">Periodo</th>
                    <th className="px-4 py-3 text-left font-medium">Cuadrilla</th>
                    <th className="px-4 py-3 text-center font-medium">Días</th>
                    <th className="px-4 py-3 text-right font-medium">Entrada</th>
                    <th className="px-4 py-3 text-right font-medium">Mano de obra</th>
                    <th className="px-4 py-3 text-right font-medium">Gastos</th>
                    <th className="px-4 py-3 text-right font-medium">Utilidad</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {planillas.map((p) => (
                    <tr key={p.planilla_id} className="hover:bg-orange-50/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/pages/admin/planillas/${p.planilla_id}`}
                          className="font-medium text-orange-700 hover:underline inline-flex items-center gap-1"
                        >
                          {p.nombre} <ArrowRight className="size-3.5" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatoFecha(p.fecha_inicio)} — {formatoFecha(p.fecha_fin)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.cuadrilla}</td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {formatoNumero(p.dias_trabajados)}
                        <span className="text-slate-400"> / {formatoNumero(p.dias_registrados)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatoLempiras(p.ingreso_total)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatoLempiras(p.mano_obra)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatoLempiras(p.gastos)}</td>
                      <td className="px-4 py-3 text-right"><Monto valor={p.utilidad} resaltar /></td>
                      <td className="px-4 py-3 text-center"><Etiqueta estado={p.estado} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => abrirEdicion(p)}
                            title="Editar"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => borrar(p)}
                            title="Eliminar"
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        abierto={modalAbierto}
        titulo={form.id ? "Editar planilla" : "Nueva planilla"}
        onCerrar={() => setModalAbierto(false)}
      >
        <form onSubmit={guardar} className="space-y-4">
          <MensajeError mensaje={errorForm} />

          <Campo etiqueta="Nombre">
            <input
              className={claseInput}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Agosto 2026 - 1ra quincena"
            />
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Cuadrilla">
              <select
                className={claseInput}
                value={form.cuadrilla_id}
                onChange={(e) => setForm({ ...form, cuadrilla_id: e.target.value })}
              >
                <option value="">Seleccione...</option>
                {catalogos?.cuadrillas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Estado">
              <select
                className={claseInput}
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoPlanilla })}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <input type="date" className={claseInput} value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="date" className={claseInput} value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
            </Campo>
          </div>

          <Campo etiqueta="Observaciones">
            <textarea
              className={claseInput}
              rows={2}
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            />
          </Campo>

          <p className="text-xs text-slate-500">
            Una planilla en estado <b>pagada</b> no admite días nuevos ni ediciones: cambiaría una
            liquidación que el colaborador ya cobró. Para corregirla, vuélvala a <b>abierta</b>.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalAbierto(false)} className={claseBotonSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={claseBotonPrimario}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
};

export default PlanillasPage;
