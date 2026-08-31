"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Pencil, UserMinus, Receipt } from "lucide-react";
import AdminLayout from "@/app/components/adminLayout";
import { useModulo } from "@/app/auth/useModulo";
import {
  obtenerColaboradores,
  obtenerSaldosColaboradores,
  obtenerEstadoCuenta,
  crearColaborador,
  actualizarColaborador,
  desactivarColaborador,
  formatoLempiras,
  formatoNumero,
  formatoFecha,
  esErrorDeAcceso,
  num,
  type Colaborador,
  type ColaboradorSaldo,
  type EstadoCuenta
} from "@/app/lib/planillasApi";
import {
  Cargando,
  AccesoDenegado,
  MensajeError,
  Vacio,
  Tarjeta,
  Monto,
  Modal,
  Campo,
  claseInput,
  claseBotonPrimario,
  claseBotonSecundario
} from "../planillas/components/ui";

interface FormColaborador {
  id: number | null;
  nombre: string;
  apellido: string;
  alias: string;
  identidad: string;
  telefono: string;
  tarifa_diaria: string;
  activo: boolean;
}

const FORM_VACIO: FormColaborador = {
  id: null,
  nombre: "",
  apellido: "",
  alias: "",
  identidad: "",
  telefono: "",
  tarifa_diaria: "500",
  activo: true
};

const ColaboradoresPage = () => {
  const { permitido, verificando, error: errorAcceso } = useModulo("colaboradores");

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [saldos, setSaldos] = useState<ColaboradorSaldo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState<FormColaborador>(FORM_VACIO);
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuenta | null>(null);
  const [cargandoCuenta, setCargandoCuenta] = useState(false);

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
      const [lista, saldosLista] = await Promise.all([
        obtenerColaboradores(),
        obtenerSaldosColaboradores()
      ]);
      setColaboradores(lista);
      setSaldos(saldosLista);
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

  // Se cruza el saldo (viene de la vista) con los datos del colaborador para
  // tener nombre completo, teléfono y tarifa en la misma fila.
  const filas = useMemo(() => {
    const porId = new Map(colaboradores.map((c) => [c.id, c]));
    return saldos
      .map((s) => ({ ...s, datos: porId.get(s.colaborador_id) }))
      .filter((f) => {
        if (!verInactivos && !num(f.activo)) return false;
        const texto = `${f.nombre} ${f.alias ?? ""}`.toLowerCase();
        return texto.includes(busqueda.toLowerCase());
      });
  }, [saldos, colaboradores, busqueda, verInactivos]);

  const totales = useMemo(
    () =>
      filas.reduce(
        (a, f) => ({
          devengado: a.devengado + num(f.devengado),
          pagado: a.pagado + num(f.pagado),
          vales: a.vales + num(f.vales),
          // Sólo los saldos positivos: mezclar a quien está sobrepagado haría
          // ver la deuda más chica de lo que es.
          porPagar: a.porPagar + Math.max(num(f.saldo), 0)
        }),
        { devengado: 0, pagado: 0, vales: 0, porPagar: 0 }
      ),
    [filas]
  );

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setErrorForm("");
    setModalAbierto(true);
  };

  const abrirEdicion = (c: Colaborador) => {
    setForm({
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido ?? "",
      alias: c.alias ?? "",
      identidad: c.identidad ?? "",
      telefono: c.telefono ?? "",
      tarifa_diaria: String(num(c.tarifa_diaria)),
      activo: Boolean(num(c.activo))
    });
    setErrorForm("");
    setModalAbierto(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm("");

    if (!form.nombre.trim()) return setErrorForm("El nombre es obligatorio");
    if (num(form.tarifa_diaria) < 0) return setErrorForm("La tarifa no puede ser negativa");

    const datos = {
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim() || null,
      alias: form.alias.trim() || null,
      identidad: form.identidad.trim() || null,
      telefono: form.telefono.trim() || null,
      tarifa_diaria: num(form.tarifa_diaria),
      activo: form.activo ? 1 : 0
    };

    setGuardando(true);
    try {
      if (form.id) {
        await actualizarColaborador(form.id, datos);
      } else {
        await crearColaborador(datos);
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

  const desactivar = async (c: ColaboradorSaldo) => {
    const confirmacion = await Swal.fire({
      icon: "question",
      title: `¿Dar de baja a ${c.alias || c.nombre}?`,
      text: "No se borra: deja de aparecer al armar planillas, pero su historial se conserva.",
      showCancelButton: true,
      confirmButtonText: "Dar de baja",
      cancelButtonText: "Cancelar"
    });
    if (!confirmacion.isConfirmed) return;

    try {
      await desactivarColaborador(c.colaborador_id);
      await cargar();
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo dar de baja" });
    }
  };

  const verCuenta = async (id: number) => {
    setCargandoCuenta(true);
    try {
      setEstadoCuenta(await obtenerEstadoCuenta(id));
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      Swal.fire({ icon: "error", title: "No se pudo cargar el estado de cuenta" });
    } finally {
      setCargandoCuenta(false);
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
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">Colaboradores</h1>
            <p className="text-sm text-slate-600 mt-1">
              Personal de campo que cobra jornal. No son usuarios del sistema.
            </p>
          </div>
          <button onClick={abrirNuevo} className={claseBotonPrimario}>
            <Plus className="size-4" /> Nuevo colaborador
          </button>
        </div>

        <MensajeError mensaje={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tarjeta titulo="Devengado" valor={formatoLempiras(totales.devengado)} />
          <Tarjeta titulo="Pagado" valor={formatoLempiras(totales.pagado)} />
          <Tarjeta titulo="Vales" valor={formatoLempiras(totales.vales)} detalle="Adelantos a descontar" />
          <Tarjeta titulo="Por pagar" valor={formatoLempiras(totales.porPagar)} tono="aviso" detalle="Suma de saldos a favor" />
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            className={`${claseInput} sm:max-w-sm`}
            placeholder="Buscar por nombre o apodo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="size-4 accent-orange-500"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Mostrar dados de baja
          </label>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <Cargando />
          ) : filas.length === 0 ? (
            <Vacio texto="No hay colaboradores que coincidan." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Colaborador</th>
                    <th className="px-4 py-3 text-right font-medium">Jornal</th>
                    <th className="px-4 py-3 text-center font-medium">Días</th>
                    <th className="px-4 py-3 text-right font-medium">Devengado</th>
                    <th className="px-4 py-3 text-right font-medium">Vales</th>
                    <th className="px-4 py-3 text-right font-medium">Pagado</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map((f) => (
                    <tr key={f.colaborador_id} className={`hover:bg-orange-50/40 ${!num(f.activo) ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-700">{f.alias || f.nombre}</p>
                        {f.datos && (f.datos.apellido || f.datos.telefono) && (
                          <p className="text-xs text-slate-500">
                            {[f.nombre, f.datos.apellido].filter(Boolean).join(" ")}
                            {f.datos.telefono ? ` · ${f.datos.telefono}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">
                        {f.datos ? formatoLempiras(f.datos.tarifa_diaria) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{formatoNumero(f.dias_trabajados)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(f.devengado)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700">{formatoLempiras(f.vales)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatoLempiras(f.pagado)}</td>
                      <td className="px-4 py-2.5 text-right"><Monto valor={f.saldo} resaltar /></td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => verCuenta(f.colaborador_id)} title="Estado de cuenta"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                            <Receipt className="size-4" />
                          </button>
                          {f.datos && (
                            <button onClick={() => abrirEdicion(f.datos!)} title="Editar"
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                              <Pencil className="size-4" />
                            </button>
                          )}
                          {Boolean(num(f.activo)) && (
                            <button onClick={() => desactivar(f)} title="Dar de baja"
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                              <UserMinus className="size-4" />
                            </button>
                          )}
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

      {/* Alta / edición */}
      <Modal
        abierto={modalAbierto}
        titulo={form.id ? "Editar colaborador" : "Nuevo colaborador"}
        onCerrar={() => setModalAbierto(false)}
      >
        <form onSubmit={guardar} className="space-y-4">
          <MensajeError mensaje={errorForm} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Nombre">
              <input className={claseInput} value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Apellido">
              <input className={claseInput} value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
            </Campo>
            <Campo etiqueta="Apodo (como aparece en la planilla)">
              <input className={claseInput} value={form.alias} placeholder="BARACOA"
                onChange={(e) => setForm({ ...form, alias: e.target.value })} />
            </Campo>
            <Campo etiqueta="Jornal por defecto">
              <input type="number" step="0.01" min="0" className={claseInput} value={form.tarifa_diaria}
                onChange={(e) => setForm({ ...form, tarifa_diaria: e.target.value })} />
            </Campo>
            <Campo etiqueta="Identidad">
              <input className={claseInput} value={form.identidad}
                onChange={(e) => setForm({ ...form, identidad: e.target.value })} />
            </Campo>
            <Campo etiqueta="Teléfono">
              <input className={claseInput} value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Campo>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="size-4 accent-orange-500" checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Activo
          </label>

          <p className="text-xs text-slate-500">
            El apodo es único y es el que se muestra en las planillas. Sirve para no repetir a la misma
            persona con dos nombres distintos, como pasaba en el Excel.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalAbierto(false)} className={claseBotonSecundario}>Cancelar</button>
            <button type="submit" disabled={guardando} className={claseBotonPrimario}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Estado de cuenta */}
      <Modal
        abierto={estadoCuenta !== null || cargandoCuenta}
        titulo={`Estado de cuenta${estadoCuenta ? ` — ${estadoCuenta.colaborador.alias || estadoCuenta.colaborador.nombre}` : ""}`}
        onCerrar={() => setEstadoCuenta(null)}
        ancho="max-w-4xl"
      >
        {cargandoCuenta || !estadoCuenta ? (
          <Cargando />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tarjeta titulo="Devengado" valor={formatoLempiras(estadoCuenta.saldo?.devengado)} />
              <Tarjeta titulo="Vales" valor={formatoLempiras(estadoCuenta.saldo?.vales)} />
              <Tarjeta titulo="Pagado" valor={formatoLempiras(estadoCuenta.saldo?.pagado)} />
              <Tarjeta
                titulo="Saldo"
                valor={formatoLempiras(estadoCuenta.saldo?.saldo)}
                tono={num(estadoCuenta.saldo?.saldo) > 0 ? "aviso" : "positivo"}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Por planilla</h3>
              {estadoCuenta.planillas.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no ha participado en ninguna planilla.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Planilla</th>
                        <th className="px-3 py-2 text-center font-medium">Días</th>
                        <th className="px-3 py-2 text-right font-medium">Devengado</th>
                        <th className="px-3 py-2 text-right font-medium">Vales</th>
                        <th className="px-3 py-2 text-right font-medium">Pagado</th>
                        <th className="px-3 py-2 text-right font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {estadoCuenta.planillas.map((p) => (
                        <tr key={p.planilla_id}>
                          <td className="px-3 py-2 text-slate-700">{p.planilla}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{formatoNumero(p.dias_trabajados)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatoLempiras(p.devengado)}</td>
                          <td className="px-3 py-2 text-right text-amber-700">{formatoLempiras(p.vales)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatoLempiras(p.pagado)}</td>
                          <td className="px-3 py-2 text-right"><Monto valor={p.saldo} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Vales</h3>
                {estadoCuenta.vales.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin adelantos.</p>
                ) : (
                  <ul className="space-y-1 text-sm max-h-56 overflow-y-auto">
                    {estadoCuenta.vales.map((v) => (
                      <li key={v.id} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                        <span className="text-slate-600">
                          {formatoFecha(v.fecha)}
                          {v.descripcion ? ` · ${v.descripcion}` : ""}
                        </span>
                        <span className="text-amber-700 font-medium whitespace-nowrap">{formatoLempiras(v.monto)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Pagos entregados</h3>
                {estadoCuenta.pagos.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin pagos registrados.</p>
                ) : (
                  <ul className="space-y-1 text-sm max-h-56 overflow-y-auto">
                    {estadoCuenta.pagos.map((p) => (
                      <li key={p.id} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                        <span className="text-slate-600">
                          {formatoFecha(p.fecha_pago)}
                          {p.referencia ? ` · ${p.referencia}` : ""}
                        </span>
                        <span className="text-emerald-700 font-medium whitespace-nowrap">{formatoLempiras(p.monto)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
};

export default ColaboradoresPage;
