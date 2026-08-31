"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import AdminLayout from "@/app/components/adminLayout";
import { useModulo } from "@/app/auth/useModulo";
import {
  obtenerProyectos,
  obtenerAbonos,
  crearProyecto,
  actualizarProyecto,
  eliminarProyecto,
  crearAbono,
  asignarAbono,
  eliminarAbono,
  formatoLempiras,
  formatoFecha,
  hoyISO,
  esErrorDeAcceso,
  num,
  type Proyecto,
  type Abono,
  type EstadoProyecto
} from "@/app/lib/planillasApi";
import {
  Cargando,
  AccesoDenegado,
  MensajeError,
  Vacio,
  Tarjeta,
  Monto,
  Etiqueta,
  Modal,
  Campo,
  claseInput,
  claseBotonPrimario,
  claseBotonSecundario
} from "../planillas/components/ui";

const ESTADOS: EstadoProyecto[] = ["planificado", "en_proceso", "finalizado", "cancelado"];

interface FormProyecto {
  id: number | null;
  nombre: string;
  contratante: string;
  costo: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoProyecto;
  observaciones: string;
}

const FORM_VACIO: FormProyecto = {
  id: null,
  nombre: "",
  contratante: "",
  costo: "",
  fecha_inicio: "",
  fecha_fin: "",
  estado: "en_proceso",
  observaciones: ""
};

const ProyectosPage = () => {
  const { permitido, verificando, error: errorAcceso } = useModulo("proyectos");

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [sinAsignar, setSinAsignar] = useState<Abono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState<FormProyecto>(FORM_VACIO);
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [abonoAbierto, setAbonoAbierto] = useState(false);
  const [abonoForm, setAbonoForm] = useState({ proyecto_id: "", monto: "", fecha: hoyISO(), referencia: "" });
  const [errorAbono, setErrorAbono] = useState("");

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
      const [lista, sueltos] = await Promise.all([
        obtenerProyectos(),
        obtenerAbonos({ sinAsignar: true })
      ]);
      setProyectos(lista);
      setSinAsignar(sueltos);
    } catch (e) {
      manejarError(e);
    } finally {
      setCargando(false);
    }
  }, [manejarError]);

  useEffect(() => {
    if (!permitido) return;
    cargar();
  }, [permitido, cargar]);

  const totales = useMemo(
    () =>
      proyectos.reduce(
        (a, p) => ({
          costo: a.costo + num(p.costo),
          abonado: a.abonado + num(p.abonado),
          pendiente: a.pendiente + num(p.pendiente)
        }),
        { costo: 0, abonado: 0, pendiente: 0 }
      ),
    [proyectos]
  );

  const totalSinAsignar = useMemo(
    () => sinAsignar.reduce((a, s) => a + num(s.monto), 0),
    [sinAsignar]
  );

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setErrorForm("");
    setModalAbierto(true);
  };

  const abrirEdicion = (p: Proyecto) => {
    setForm({
      id: p.proyecto_id,
      nombre: p.nombre,
      contratante: p.contratante ?? "",
      costo: String(num(p.costo)),
      fecha_inicio: "",
      fecha_fin: "",
      estado: p.estado,
      observaciones: p.observaciones ?? ""
    });
    setErrorForm("");
    setModalAbierto(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm("");

    if (!form.nombre.trim()) return setErrorForm("El nombre es obligatorio");
    if (num(form.costo) < 0) return setErrorForm("El costo no puede ser negativo");

    const datos = {
      nombre: form.nombre.trim(),
      contratante: form.contratante.trim() || null,
      costo: num(form.costo),
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      estado: form.estado,
      observaciones: form.observaciones.trim() || null
    };

    setGuardando(true);
    try {
      if (form.id) {
        await actualizarProyecto(form.id, datos);
      } else {
        await crearProyecto(datos);
      }
      setModalAbierto(false);
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setErrorForm(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p: Proyecto) => {
    const c = await Swal.fire({
      icon: "warning",
      title: `¿Eliminar "${p.nombre}"?`,
      text: "Sus abonos quedan sin proyecto asignado, no se borran.",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626"
    });
    if (!c.isConfirmed) return;

    try {
      await eliminarProyecto(p.proyecto_id);
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo eliminar", text: e instanceof Error ? e.message : "" });
    }
  };

  const guardarAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAbono("");

    if (num(abonoForm.monto) <= 0) return setErrorAbono("El monto debe ser mayor que cero");
    if (!abonoForm.fecha) return setErrorAbono("Indique la fecha");

    try {
      await crearAbono({
        proyecto_id: abonoForm.proyecto_id ? Number(abonoForm.proyecto_id) : null,
        monto: num(abonoForm.monto),
        fecha: abonoForm.fecha,
        referencia: abonoForm.referencia.trim() || null
      });
      setAbonoAbierto(false);
      setAbonoForm({ proyecto_id: "", monto: "", fecha: hoyISO(), referencia: "" });
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setErrorAbono(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  /** Asigna a su proyecto uno de los depósitos que entraron sueltos. */
  const asignar = async (abono: Abono) => {
    const opciones = proyectos.reduce<Record<string, string>>((acc, p) => {
      acc[String(p.proyecto_id)] = p.nombre;
      return acc;
    }, {});

    const { value: proyectoId } = await Swal.fire({
      title: `Asignar ${formatoLempiras(abono.monto)}`,
      text: `Depósito del ${formatoFecha(abono.fecha)}`,
      input: "select",
      inputOptions: opciones,
      inputPlaceholder: "Seleccione el proyecto",
      showCancelButton: true,
      confirmButtonText: "Asignar",
      cancelButtonText: "Cancelar"
    });

    if (!proyectoId) return;

    try {
      await asignarAbono(abono.id, Number(proyectoId));
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo asignar" });
    }
  };

  const borrarAbono = async (id: number) => {
    const c = await Swal.fire({
      icon: "warning",
      title: "¿Eliminar el depósito?",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626"
    });
    if (!c.isConfirmed) return;

    try {
      await eliminarAbono(id);
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

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">Proyectos</h1>
            <p className="text-sm text-slate-600 mt-1">
              Costo contratado, depósitos recibidos y lo que falta por cobrar.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAbonoAbierto(true)} className={claseBotonSecundario}>
              <Plus className="size-4" /> Registrar depósito
            </button>
            <button onClick={abrirNuevo} className={claseBotonPrimario}>
              <Plus className="size-4" /> Nuevo proyecto
            </button>
          </div>
        </div>

        <MensajeError mensaje={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tarjeta titulo="Costo contratado" valor={formatoLempiras(totales.costo)} detalle={`${proyectos.length} proyectos`} />
          <Tarjeta titulo="Abonado" valor={formatoLempiras(totales.abonado)} />
          <Tarjeta titulo="Por cobrar" valor={formatoLempiras(totales.pendiente)}
            tono={totales.pendiente > 0 ? "aviso" : "positivo"} />
          <Tarjeta titulo="Depósitos sin asignar" valor={formatoLempiras(totalSinAsignar)}
            tono={sinAsignar.length > 0 ? "aviso" : "neutro"}
            detalle={`${sinAsignar.length} por repartir`} />
        </div>

        {sinAsignar.length > 0 && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-amber-200">
              <h2 className="text-sm font-semibold text-amber-900">Depósitos sin proyecto asignado</h2>
              <p className="text-xs text-amber-800 mt-0.5">
                En la hoja CONTROL las columnas de depósito y de proyecto eran dos listas
                independientes, así que estos entraron sin dueño. Asígnelos aquí.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-amber-200">
                  {sinAsignar.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2.5 text-amber-900">{formatoFecha(a.fecha)}</td>
                      <td className="px-4 py-2.5 text-amber-900 font-medium">{formatoLempiras(a.monto)}</td>
                      <td className="px-4 py-2.5 text-amber-800">{a.observacion || a.referencia || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => asignar(a)} className={claseBotonSecundario}>
                            <Link2 className="size-4" /> Asignar
                          </button>
                          <button onClick={() => borrarAbono(a.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-100">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <Cargando />
          ) : proyectos.length === 0 ? (
            <Vacio texto="No hay proyectos registrados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Proyecto</th>
                    <th className="px-4 py-3 text-right font-medium">Costo</th>
                    <th className="px-4 py-3 text-right font-medium">Abonado</th>
                    <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                    <th className="px-4 py-3 text-right font-medium">Mano de obra</th>
                    <th className="px-4 py-3 text-left font-medium">Último abono</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {proyectos.map((p) => (
                    <tr key={p.proyecto_id} className="hover:bg-orange-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{p.nombre}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(p.costo)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(p.abonado)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={num(p.pendiente) > 0 ? "text-amber-700 font-semibold" : "text-emerald-700"}>
                          {formatoLempiras(p.pendiente)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatoLempiras(p.mano_obra_directa)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{formatoFecha(p.ultimo_abono)}</td>
                      <td className="px-4 py-2.5 text-center"><Etiqueta estado={p.estado} /></td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => abrirEdicion(p)} title="Editar"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                            <Pencil className="size-4" />
                          </button>
                          <button onClick={() => borrar(p)} title="Eliminar"
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{formatoLempiras(totales.costo)}</td>
                    <td className="px-4 py-3 text-right">{formatoLempiras(totales.abonado)}</td>
                    <td className="px-4 py-3 text-right"><Monto valor={totales.pendiente} /></td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        abierto={modalAbierto}
        titulo={form.id ? "Editar proyecto" : "Nuevo proyecto"}
        onCerrar={() => setModalAbierto(false)}
      >
        <form onSubmit={guardar} className="space-y-4">
          <MensajeError mensaje={errorForm} />

          <Campo etiqueta="Nombre">
            <input className={claseInput} value={form.nombre} placeholder="Troncal Altiplano"
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Contratante">
              <input className={claseInput} value={form.contratante}
                onChange={(e) => setForm({ ...form, contratante: e.target.value })} />
            </Campo>
            <Campo etiqueta="Costo contratado">
              <input type="number" step="0.01" min="0" className={claseInput} value={form.costo}
                onChange={(e) => setForm({ ...form, costo: e.target.value })} />
            </Campo>
            <Campo etiqueta="Inicio">
              <input type="date" className={claseInput} value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
            </Campo>
            <Campo etiqueta="Fin">
              <input type="date" className={claseInput} value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
            </Campo>
          </div>

          <Campo etiqueta="Estado">
            <select className={claseInput} value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoProyecto })}>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>{e === "en_proceso" ? "En proceso" : e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Observaciones">
            <textarea className={claseInput} rows={2} value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
          </Campo>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalAbierto(false)} className={claseBotonSecundario}>Cancelar</button>
            <button type="submit" disabled={guardando} className={claseBotonPrimario}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal abierto={abonoAbierto} titulo="Registrar depósito" onCerrar={() => setAbonoAbierto(false)}>
        <form onSubmit={guardarAbono} className="space-y-4">
          <MensajeError mensaje={errorAbono} />

          <Campo etiqueta="Proyecto">
            <select className={claseInput} value={abonoForm.proyecto_id}
              onChange={(e) => setAbonoForm({ ...abonoForm, proyecto_id: e.target.value })}>
              <option value="">Sin asignar (se reparte después)</option>
              {proyectos.map((p) => (
                <option key={p.proyecto_id} value={p.proyecto_id}>{p.nombre}</option>
              ))}
            </select>
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Monto">
              <input type="number" step="0.01" min="0" className={claseInput} value={abonoForm.monto}
                onChange={(e) => setAbonoForm({ ...abonoForm, monto: e.target.value })} />
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" className={claseInput} value={abonoForm.fecha}
                onChange={(e) => setAbonoForm({ ...abonoForm, fecha: e.target.value })} />
            </Campo>
          </div>

          <Campo etiqueta="Referencia">
            <input className={claseInput} value={abonoForm.referencia} placeholder="No. de cheque o transferencia"
              onChange={(e) => setAbonoForm({ ...abonoForm, referencia: e.target.value })} />
          </Campo>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbonoAbierto(false)} className={claseBotonSecundario}>Cancelar</button>
            <button type="submit" className={claseBotonPrimario}>Guardar</button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
};

export default ProyectosPage;
