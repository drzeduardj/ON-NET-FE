"use client";

import { useEffect, useState } from "react";
import { Calculator, Trash2, Plus } from "lucide-react";
import {
  crearDia,
  actualizarDia,
  obtenerDia,
  sugerirIngreso,
  formatoLempiras,
  num,
  type Catalogos,
  type EstadoDia,
  type IntegrantePlanilla,
  type Planilla,
  type Proyecto
} from "@/app/lib/planillasApi";
import {
  Modal,
  Campo,
  MensajeError,
  claseInput,
  claseBotonPrimario,
  claseBotonSecundario
} from "../../components/ui";

const ESTADOS_DIA: { valor: EstadoDia; etiqueta: string }[] = [
  { valor: "trabajado", etiqueta: "Trabajado" },
  { valor: "no_trabajado", etiqueta: "No se trabajó" },
  { valor: "descanso", etiqueta: "Descanso" },
  { valor: "feriado", etiqueta: "Feriado" }
];

interface FilaPago {
  colaborador_id: number;
  nombre: string;
  asistio: boolean;
  monto: string;
  bono: string;
}

interface FilaGasto {
  categoria_id: string;
  descripcion: string;
  monto: string;
}

interface Props {
  abierto: boolean;
  planilla: Planilla;
  catalogos: Catalogos | null;
  proyectos: Proyecto[];
  diaId: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/**
 * El formulario de un día: es la fila de la planilla del Excel, pero con los
 * colaboradores en vertical para que quepan sin importar cuántos sean.
 */
const DiaModal = ({ abierto, planilla, catalogos, proyectos, diaId, onCerrar, onGuardado }: Props) => {
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const [fecha, setFecha] = useState("");
  const [estado, setEstado] = useState<EstadoDia>("trabajado");
  const [sector, setSector] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [instalaciones, setInstalaciones] = useState("0");
  const [tarifaInstalacion, setTarifaInstalacion] = useState("0");
  const [metrosFibra, setMetrosFibra] = useState("0");
  const [puntaInicial, setPuntaInicial] = useState("0");
  const [puntaFinal, setPuntaFinal] = useState("0");
  const [tarifaMetro, setTarifaMetro] = useState("0");
  const [tipoFibraId, setTipoFibraId] = useState("");
  const [bonoOnnet, setBonoOnnet] = useState("0");
  const [ingreso, setIngreso] = useState("0");
  const [observaciones, setObservaciones] = useState("");
  const [pagos, setPagos] = useState<FilaPago[]>([]);
  const [gastos, setGastos] = useState<FilaGasto[]>([]);

  /** Arranca las filas de pago desde los integrantes de la planilla. */
  const filasDesdeIntegrantes = (integrantes: IntegrantePlanilla[]): FilaPago[] =>
    integrantes.map((i) => ({
      colaborador_id: i.colaborador_id,
      nombre: i.alias || `${i.nombre ?? ""} ${i.apellido ?? ""}`.trim(),
      asistio: false,
      monto: "0",
      bono: "0"
    }));

  useEffect(() => {
    if (!abierto) return;

    setError("");
    setGastos([]);

    if (!diaId) {
      setFecha(planilla.fecha_inicio.slice(0, 10));
      setEstado("trabajado");
      setSector("");
      setProyectoId("");
      setTrabajo("");
      setInstalaciones("0");
      setTarifaInstalacion("0");
      setMetrosFibra("0");
      setPuntaInicial("0");
      setPuntaFinal("0");
      setTarifaMetro("0");
      setTipoFibraId("");
      setBonoOnnet("0");
      setIngreso("0");
      setObservaciones("");
      setPagos(filasDesdeIntegrantes(planilla.colaboradores));
      return;
    }

    setCargando(true);
    obtenerDia(planilla.id, diaId)
      .then((d) => {
        setFecha(d.fecha.slice(0, 10));
        setEstado(d.estado);
        setSector(texto(d.sector));
        setProyectoId(texto(d.proyecto_id));
        setTrabajo(texto(d.trabajo_realizado));
        setInstalaciones(texto(d.instalaciones));
        setTarifaInstalacion(texto(d.tarifa_instalacion));
        setMetrosFibra(texto(d.metros_fibra));
        setPuntaInicial(texto(d.punta_inicial));
        setPuntaFinal(texto(d.punta_final));
        setTarifaMetro(texto(d.tarifa_metro));
        setTipoFibraId(texto(d.tipo_fibra_id));
        setBonoOnnet(texto(d.bono_onnet));
        setIngreso(texto(d.ingreso));
        setObservaciones(texto(d.observaciones));

        // Se parte del roster para que nunca falte nadie, y se rellena con lo
        // que ya tenía guardado ese día.
        const guardados = new Map(d.colaboradores.map((c) => [c.colaborador_id, c]));
        setPagos(
          filasDesdeIntegrantes(planilla.colaboradores).map((fila) => {
            const g = guardados.get(fila.colaborador_id);
            return g
              ? {
                  ...fila,
                  asistio: Boolean(num(g.asistio)),
                  monto: texto(g.monto),
                  bono: texto(g.bono)
                }
              : fila;
          })
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el día"))
      .finally(() => setCargando(false));
  }, [abierto, diaId, planilla]);

  const manoObra = pagos.reduce((a, p) => a + num(p.monto) + num(p.bono), 0);
  const gastoDelDia = gastos.reduce((a, g) => a + num(g.monto), 0);
  const utilidad = num(ingreso) + num(bonoOnnet) - manoObra - gastoDelDia;

  const calcularSugerido = async () => {
    try {
      const { ingreso_sugerido } = await sugerirIngreso({
        instalaciones: num(instalaciones),
        tarifa_instalacion: num(tarifaInstalacion),
        metros_fibra: num(metrosFibra),
        punta_inicial: num(puntaInicial),
        punta_final: num(puntaFinal),
        tarifa_metro: num(tarifaMetro)
      });
      setIngreso(String(ingreso_sugerido));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular");
    }
  };

  /** Marca a todos con su jornal pactado. El caso normal es que trabaje la cuadrilla completa. */
  const marcarTodos = () => {
    const tarifas = new Map(planilla.colaboradores.map((c) => [c.colaborador_id, num(c.tarifa_diaria)]));
    setPagos((filas) =>
      filas.map((f) => ({
        ...f,
        asistio: true,
        monto: String(tarifas.get(f.colaborador_id) ?? 0)
      }))
    );
  };

  const limpiarTodos = () =>
    setPagos((filas) => filas.map((f) => ({ ...f, asistio: false, monto: "0", bono: "0" })));

  const actualizarFila = (id: number, cambios: Partial<FilaPago>) =>
    setPagos((filas) => filas.map((f) => (f.colaborador_id === id ? { ...f, ...cambios } : f)));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fecha) return setError("Indique la fecha");
    if (fecha < planilla.fecha_inicio.slice(0, 10) || fecha > planilla.fecha_fin.slice(0, 10)) {
      return setError(
        `La fecha está fuera del periodo de la planilla (${planilla.fecha_inicio.slice(0, 10)} a ${planilla.fecha_fin.slice(0, 10)})`
      );
    }
    if (gastos.some((g) => !g.categoria_id || num(g.monto) <= 0)) {
      return setError("Cada gasto necesita categoría y un monto mayor que cero");
    }

    const datos = {
      fecha,
      estado,
      sector: sector.trim() || null,
      proyecto_id: proyectoId ? Number(proyectoId) : null,
      trabajo_realizado: trabajo.trim() || null,
      instalaciones: num(instalaciones),
      tarifa_instalacion: num(tarifaInstalacion),
      metros_fibra: num(metrosFibra),
      punta_inicial: num(puntaInicial),
      punta_final: num(puntaFinal),
      tarifa_metro: num(tarifaMetro),
      tipo_fibra_id: tipoFibraId ? Number(tipoFibraId) : null,
      bono_onnet: num(bonoOnnet),
      ingreso: num(ingreso),
      observaciones: observaciones.trim() || null,
      // Se manda sólo a quien asistió o a quien se le pagó algo: no tiene
      // sentido guardar una fila en cero por cada ausente.
      colaboradores: pagos
        .filter((p) => p.asistio || num(p.monto) > 0 || num(p.bono) > 0)
        .map((p) => ({
          colaborador_id: p.colaborador_id,
          asistio: p.asistio,
          monto: num(p.monto),
          bono: num(p.bono)
        })),
      gastos: gastos.map((g) => ({
        categoria_id: Number(g.categoria_id),
        descripcion: g.descripcion.trim() || null,
        monto: num(g.monto),
        fecha
      }))
    };

    setGuardando(true);
    try {
      if (diaId) {
        await actualizarDia(planilla.id, diaId, datos);
      } else {
        await crearDia(planilla.id, datos);
      }
      onGuardado();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el día");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo={diaId ? "Editar día" : "Registrar día"}
      onCerrar={onCerrar}
      ancho="max-w-5xl"
    >
      {cargando ? (
        <div className="py-12 text-center text-sm text-slate-500">Cargando el día...</div>
      ) : (
        <form onSubmit={guardar} className="space-y-5">
          <MensajeError mensaje={error} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Campo etiqueta="Fecha">
              <input type="date" className={claseInput} value={fecha}
                min={planilla.fecha_inicio.slice(0, 10)} max={planilla.fecha_fin.slice(0, 10)}
                onChange={(e) => setFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta="Estado del día">
              <select className={claseInput} value={estado} onChange={(e) => setEstado(e.target.value as EstadoDia)}>
                {ESTADOS_DIA.map((e) => (
                  <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Sector">
              <input className={claseInput} value={sector} placeholder="Troncal Higo"
                onChange={(e) => setSector(e.target.value)} />
            </Campo>
            <Campo etiqueta="Proyecto">
              <select className={claseInput} value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
                <option value="">Sin asignar</option>
                {proyectos.map((p) => (
                  <option key={p.proyecto_id} value={p.proyecto_id}>{p.nombre}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Trabajo realizado">
            <textarea className={claseInput} rows={2} value={trabajo}
              placeholder="Tiraje de fibra y 4 cruzetas"
              onChange={(e) => setTrabajo(e.target.value)} />
          </Campo>

          {/* ----- Producción y entrada ----- */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Producción y entrada
            </legend>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Campo etiqueta="Metros de fibra">
                <input type="number" step="0.01" min="0" className={claseInput} value={metrosFibra}
                  onChange={(e) => setMetrosFibra(e.target.value)} />
              </Campo>
              <Campo etiqueta="Punta inicial">
                <input type="number" step="0.01" min="0" className={claseInput} value={puntaInicial}
                  onChange={(e) => setPuntaInicial(e.target.value)} />
              </Campo>
              <Campo etiqueta="Punta final">
                <input type="number" step="0.01" min="0" className={claseInput} value={puntaFinal}
                  onChange={(e) => setPuntaFinal(e.target.value)} />
              </Campo>
              <Campo etiqueta="Tarifa por metro">
                <input type="number" step="0.01" min="0" className={claseInput} value={tarifaMetro}
                  onChange={(e) => setTarifaMetro(e.target.value)} />
              </Campo>
              <Campo etiqueta="Tipo de fibra">
                <select className={claseInput} value={tipoFibraId} onChange={(e) => setTipoFibraId(e.target.value)}>
                  <option value="">—</option>
                  {catalogos?.tiposFibra.map((t) => (
                    <option key={t.id} value={t.id}>{t.codigo}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Instalaciones">
                <input type="number" step="1" min="0" className={claseInput} value={instalaciones}
                  onChange={(e) => setInstalaciones(e.target.value)} />
              </Campo>
              <Campo etiqueta="Tarifa instalación">
                <input type="number" step="0.01" min="0" className={claseInput} value={tarifaInstalacion}
                  onChange={(e) => setTarifaInstalacion(e.target.value)} />
              </Campo>
              <Campo etiqueta="Bono ONNET">
                <input type="number" step="0.01" min="0" className={claseInput} value={bonoOnnet}
                  onChange={(e) => setBonoOnnet(e.target.value)} />
              </Campo>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
              <Campo etiqueta="Entrada del día" ancho="flex-1">
                <input type="number" step="0.01" min="0" className={claseInput} value={ingreso}
                  onChange={(e) => setIngreso(e.target.value)} />
              </Campo>
              <button type="button" onClick={calcularSugerido} className={claseBotonSecundario}>
                <Calculator className="size-4" /> Sugerir
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              La sugerencia es <b>instalaciones × tarifa + metros × tarifa</b>. Es sólo una propuesta:
              la fórmula cambia según el trabajo, así que el número que vale es el que quede guardado aquí.
            </p>
          </fieldset>

          {/* ----- Pago del día ----- */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pago del día
            </legend>

            {pagos.length === 0 ? (
              <p className="text-sm text-slate-500 py-3">
                La planilla no tiene integrantes todavía. Agréguelos con el botón <b>Integrantes</b>.
              </p>
            ) : (
              <>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={marcarTodos} className={claseBotonSecundario}>
                    Todos con su jornal
                  </button>
                  <button type="button" onClick={limpiarTodos} className={claseBotonSecundario}>
                    Limpiar
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium">Asistió</th>
                        <th className="px-2 py-2 text-left font-medium">Colaborador</th>
                        <th className="px-2 py-2 text-right font-medium">Jornal</th>
                        <th className="px-2 py-2 text-right font-medium">Bono</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagos.map((p) => (
                        <tr key={p.colaborador_id}>
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              className="size-4 accent-orange-500"
                              checked={p.asistio}
                              onChange={(e) => actualizarFila(p.colaborador_id, { asistio: e.target.checked })}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-slate-700">{p.nombre}</td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.01" min="0"
                              className={`${claseInput} text-right`} value={p.monto}
                              onChange={(e) => actualizarFila(p.colaborador_id, { monto: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.01" min="0"
                              className={`${claseInput} text-right`} value={p.bono}
                              onChange={(e) => actualizarFila(p.colaborador_id, { bono: e.target.value })} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Marcar <b>Asistió</b> con jornal en 0 registra que vino y no cobró ese día. Sin marcar
                  y en 0, no vino. En el Excel las dos cosas eran una celda vacía.
                </p>
              </>
            )}
          </fieldset>

          {/* ----- Gastos ----- */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Gastos del día
            </legend>

            {diaId ? (
              <p className="text-sm text-slate-500">
                Los gastos de un día ya registrado se administran desde la pestaña <b>Gastos</b>, para
                que editar el día no borre sin aviso un gasto que ya se pagó.
              </p>
            ) : (
              <>
                {gastos.map((g, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2">
                    <div className="sm:col-span-3">
                      <select
                        className={claseInput}
                        value={g.categoria_id}
                        onChange={(e) =>
                          setGastos(gastos.map((x, j) => (j === i ? { ...x, categoria_id: e.target.value } : x)))
                        }
                      >
                        <option value="">Categoría...</option>
                        {catalogos?.categoriasGasto.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-6">
                      <input
                        className={claseInput}
                        placeholder="Detalle (combustible y agua)"
                        value={g.descripcion}
                        onChange={(e) =>
                          setGastos(gastos.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number" step="0.01" min="0"
                        className={`${claseInput} text-right`}
                        placeholder="Monto"
                        value={g.monto}
                        onChange={(e) =>
                          setGastos(gastos.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center">
                      <button
                        type="button"
                        onClick={() => setGastos(gastos.filter((_, j) => j !== i))}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setGastos([...gastos, { categoria_id: "", descripcion: "", monto: "" }])}
                  className={claseBotonSecundario}
                >
                  <Plus className="size-4" /> Agregar gasto
                </button>
              </>
            )}
          </fieldset>

          {/* ----- Resumen ----- */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Entrada</p>
              <p className="font-semibold text-slate-800">{formatoLempiras(num(ingreso) + num(bonoOnnet))}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Mano de obra</p>
              <p className="font-semibold text-slate-800">{formatoLempiras(manoObra)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Gastos</p>
              <p className="font-semibold text-slate-800">{formatoLempiras(gastoDelDia)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Margen</p>
              <p className={`font-semibold ${utilidad < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatoLempiras(utilidad)}
              </p>
            </div>
          </div>

          {diaId && (
            <p className="text-xs text-slate-500">
              El margen de arriba no incluye los gastos ya guardados de este día; el de la tabla sí.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className={claseBotonSecundario}>Cancelar</button>
            <button type="submit" disabled={guardando} className={claseBotonPrimario}>
              {guardando ? "Guardando..." : "Guardar día"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default DiaModal;
