"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { Save, Users, Plus, RotateCcw, ExternalLink, Wand2 } from "lucide-react";
import AdminLayout from "@/app/components/adminLayout";
import { useModulo } from "@/app/auth/useModulo";
import {
  obtenerPlanillas,
  obtenerCuadricula,
  guardarCuadricula,
  obtenerCatalogos,
  crearPlanilla,
  formatoLempiras,
  formatoNumero,
  esErrorDeAcceso,
  num,
  type PlanillaResumen,
  type Cuadricula,
  type Catalogos,
  type EstadoDia
} from "@/app/lib/planillasApi";
import {
  Cargando,
  AccesoDenegado,
  MensajeError,
  Modal,
  Campo,
  claseInput,
  claseBotonPrimario,
  claseBotonSecundario
} from "../planillas/components/ui";
import IntegrantesModal from "../planillas/[id]/components/IntegrantesModal";

/**
 * Planilla rápida: la hoja del Excel, sin modales ni navegación.
 *
 * Es OTRA VISTA de los mismos datos que /pages/admin/planillas — mismas
 * tablas, mismas vistas SQL, mismos cálculos. Las dos pantallas existen a la
 * vez a propósito, para poder compararlas antes de decidir cuál queda.
 *
 * Diferencias con la pantalla detallada:
 *   - el mes completo se ve de una vez, un día por fila;
 *   - los días vacíos ya están dibujados: se escribe encima y se crean solos;
 *   - se editan varias filas y se guarda todo con un botón, en una transacción;
 *   - el estado del día (trabajado / no) se deduce en vez de preguntarse.
 */

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Fechas del periodo, en UTC para que no se corra un día por zona horaria. */
const fechasDelPeriodo = (inicio: string, fin: string): string[] => {
  const salida: string[] = [];
  const actual = new Date(`${inicio.slice(0, 10)}T00:00:00Z`);
  const ultimo = new Date(`${fin.slice(0, 10)}T00:00:00Z`);
  let guarda = 0;

  while (actual <= ultimo && guarda < 40) {
    salida.push(actual.toISOString().slice(0, 10));
    actual.setUTCDate(actual.getUTCDate() + 1);
    guarda += 1;
  }
  return salida;
};

const etiquetaDia = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${DIAS_SEMANA[d.getUTCDay()]}`;
};

const esFinDeSemana = (fecha: string) => {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
};

interface Fila {
  fecha: string;
  estadoOriginal: EstadoDia;
  sector: string;
  trabajo: string;
  metros: string;
  puntaInicial: string;
  puntaFinal: string;
  tipoFibraId: string;
  entrada: string;
  bonoOnnet: string;
  combustible: string;
  detalleGasto: string;
  otroGasto: string;
  /**
   * El día tiene gastos que esta pantalla no sabe representar (más de uno
   * además del combustible, cargados desde la pantalla detallada). Sus celdas
   * de gasto quedan bloqueadas y no se envían: editarlas aquí los borraría.
   */
  gastosComplejos: boolean;
  gastoBloqueado: number;
  /**
   * Categoría que ya tenía el gasto "otro" del día. Se conserva para que
   * corregir el monto aquí no reclasifique a "Otros" un gasto que en la vista
   * detallada estaba como Alimentación o Vehículo.
   */
  otroCategoriaId: number | null;
  pagos: Record<number, string>;
  /**
   * Bono, observación y asistencia tal como estaban al cargar.
   *
   * Esta pantalla no los edita, pero al guardar se reemplaza el detalle
   * completo del día. Sin conservarlos, tocar un jornal aquí borraría el bono
   * que se puso desde la vista detallada, la nota que dejó la carga histórica
   * ("El Excel registra -500.00...") o el registro de quien fue a trabajar sin
   * cobrar ese día.
   */
  pagosOriginales: Record<number, { bono: number; observacion: string | null; asistio: boolean }>;
}

const celda =
  "w-full bg-transparent px-1.5 py-1 text-sm text-slate-800 rounded " +
  "focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400";

const celdaNumero = `${celda} text-right tabular-nums`;

const PlanillaRapida = () => {
  const { permitido, verificando, error: errorAcceso } = useModulo("planillas");

  const [planillas, setPlanillas] = useState<PlanillaResumen[]>([]);
  const [planillaId, setPlanillaId] = useState<number | null>(null);
  const [cuadricula, setCuadricula] = useState<Cuadricula | null>(null);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [sucias, setSucias] = useState<Set<string>>(new Set());
  const [gastosTocados, setGastosTocados] = useState<Set<string>>(new Set());

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [integrantesAbierto, setIntegrantesAbierto] = useState(false);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);

  const tabla = useRef<HTMLTableElement>(null);

  const manejarError = useCallback((e: unknown) => {
    if (esErrorDeAcceso(e)) {
      window.location.href = "/noAuth";
      return;
    }
    setError(e instanceof Error ? e.message : "Error inesperado");
  }, []);

  /** Arma las filas: todos los días del periodo, tengan datos o no. */
  const construirFilas = useCallback((c: Cuadricula): Fila[] => {
    const porFecha = new Map(c.dias.map((d) => [d.fecha.slice(0, 10), d]));

    return fechasDelPeriodo(c.planilla.fecha_inicio, c.planilla.fecha_fin).map((fecha) => {
      const dia = porFecha.get(fecha);

      if (!dia) {
        return {
          fecha,
          estadoOriginal: "no_trabajado" as EstadoDia,
          sector: "", trabajo: "", metros: "", puntaInicial: "", puntaFinal: "",
          tipoFibraId: "", entrada: "", bonoOnnet: "", combustible: "",
          detalleGasto: "", otroGasto: "",
          gastosComplejos: false, gastoBloqueado: 0, otroCategoriaId: null,
          pagos: {}, pagosOriginales: {}
        };
      }

      const combustible = dia.gastosDetalle.filter((g) => g.categoria === "Combustible");
      const otros = dia.gastosDetalle.filter((g) => g.categoria !== "Combustible");
      const complejos = combustible.length > 1 || otros.length > 1;

      const pagos: Record<number, string> = {};
      const pagosOriginales: Fila["pagosOriginales"] = {};
      for (const p of dia.pagos) {
        pagos[p.colaborador_id] = String(num(p.monto));
        pagosOriginales[p.colaborador_id] = {
          bono: num(p.bono),
          observacion: p.observacion,
          asistio: Boolean(num(p.asistio))
        };
      }

      return {
        fecha,
        estadoOriginal: dia.estado,
        sector: dia.sector ?? "",
        trabajo: dia.trabajo_realizado ?? "",
        metros: dia.metros_fibra ? String(num(dia.metros_fibra)) : "",
        puntaInicial: dia.punta_inicial ? String(num(dia.punta_inicial)) : "",
        puntaFinal: dia.punta_final ? String(num(dia.punta_final)) : "",
        tipoFibraId: dia.tipo_fibra_id ? String(dia.tipo_fibra_id) : "",
        entrada: dia.ingreso ? String(num(dia.ingreso)) : "",
        bonoOnnet: dia.bono_onnet ? String(num(dia.bono_onnet)) : "",
        combustible: complejos ? "" : combustible[0] ? String(num(combustible[0].monto)) : "",
        detalleGasto: complejos ? "" : (otros[0]?.descripcion ?? combustible[0]?.descripcion ?? ""),
        otroGasto: complejos ? "" : otros[0] ? String(num(otros[0].monto)) : "",
        gastosComplejos: complejos,
        gastoBloqueado: complejos ? dia.gastosDetalle.reduce((a, g) => a + num(g.monto), 0) : 0,
        otroCategoriaId: otros[0]?.categoria_id ?? null,
        pagos,
        pagosOriginales
      };
    });
  }, []);

  const idCategoria = useCallback(
    (nombre: string) => catalogos?.categoriasGasto.find((c) => c.nombre === nombre)?.id ?? null,
    [catalogos]
  );

  /* ---------- carga ---------- */

  useEffect(() => {
    if (!permitido) return;

    Promise.all([obtenerPlanillas(), obtenerCatalogos()])
      .then(([lista, cat]) => {
        setPlanillas(lista);
        setCatalogos(cat);
        if (lista.length && planillaId === null) setPlanillaId(lista[0].planilla_id);
        if (!lista.length) setCargando(false);
      })
      .catch((e) => {
        manejarError(e);
        setCargando(false);
      });
    // planillaId se omite a propósito: esto corre una sola vez al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitido, manejarError]);

  const cargarCuadricula = useCallback(
    async (id: number) => {
      setCargando(true);
      setError("");
      try {
        const c = await obtenerCuadricula(id);
        setCuadricula(c);
        setFilas(construirFilas(c));
        setSucias(new Set());
        setGastosTocados(new Set());
      } catch (e) {
        manejarError(e);
      } finally {
        setCargando(false);
      }
    },
    [construirFilas, manejarError]
  );

  useEffect(() => {
    if (!permitido || planillaId === null) return;
    cargarCuadricula(planillaId);
  }, [permitido, planillaId, cargarCuadricula]);

  // Aviso del navegador si se intenta salir con cambios sin guardar.
  useEffect(() => {
    if (sucias.size === 0) return;
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sucias]);

  /* ---------- edición ---------- */

  const marcarSucia = (fecha: string) =>
    setSucias((s) => (s.has(fecha) ? s : new Set(s).add(fecha)));

  const cambiar = (fecha: string, cambios: Partial<Fila>) => {
    setFilas((fs) => fs.map((f) => (f.fecha === fecha ? { ...f, ...cambios } : f)));
    marcarSucia(fecha);
  };

  const cambiarGasto = (fecha: string, cambios: Partial<Fila>) => {
    cambiar(fecha, cambios);
    setGastosTocados((s) => (s.has(fecha) ? s : new Set(s).add(fecha)));
  };

  const cambiarPago = (fecha: string, colaboradorId: number, valor: string) => {
    setFilas((fs) =>
      fs.map((f) =>
        f.fecha === fecha ? { ...f, pagos: { ...f.pagos, [colaboradorId]: valor } } : f
      )
    );
    marcarSucia(fecha);
  };

  /** Llena la fila con el jornal pactado de cada integrante. */
  const llenarFila = (fecha: string) => {
    if (!cuadricula) return;
    const pagos: Record<number, string> = {};
    for (const c of cuadricula.colaboradores) {
      pagos[c.colaborador_id] = String(num(c.tarifa_diaria));
    }
    cambiar(fecha, { pagos });
  };

  /**
   * Enter baja a la misma columna de la fila siguiente, como en una hoja de
   * cálculo. Sin esto hay que usar el ratón en cada celda.
   */
  const alPresionar = (e: React.KeyboardEvent<HTMLInputElement>, indiceFila: number, columna: string) => {
    // Se acepta también el Enter del teclado numérico: en una pantalla de
    // digitación de montos es el que se tiene bajo la mano.
    if (e.key !== "Enter" && e.code !== "Enter" && e.code !== "NumpadEnter") return;
    e.preventDefault();
    const destino = tabla.current?.querySelector<HTMLInputElement>(
      `[data-fila="${indiceFila + 1}"][data-col="${columna}"]`
    );
    destino?.focus();
    destino?.select();
  };

  /* ---------- cálculos en vivo ---------- */

  const calculada = useCallback((f: Fila) => {
    const manoObra = Object.values(f.pagos).reduce((a, v) => a + num(v), 0);
    const gasto = f.gastosComplejos
      ? f.gastoBloqueado
      : num(f.combustible) + num(f.otroGasto);
    const entrada = num(f.entrada) + num(f.bonoOnnet);
    return { manoObra, gasto, entrada, margen: entrada - manoObra - gasto };
  }, []);

  const totales = useMemo(() => {
    return filas.reduce(
      (acc, f) => {
        const c = calculada(f);
        return {
          manoObra: acc.manoObra + c.manoObra,
          gasto: acc.gasto + c.gasto,
          entrada: acc.entrada + c.entrada,
          margen: acc.margen + c.margen,
          metros: acc.metros + num(f.metros) + num(f.puntaInicial) + num(f.puntaFinal),
          dias: acc.dias + (c.manoObra > 0 || c.entrada > 0 ? 1 : 0)
        };
      },
      { manoObra: 0, gasto: 0, entrada: 0, margen: 0, metros: 0, dias: 0 }
    );
  }, [filas, calculada]);

  /** Devengado y días por persona, calculados sobre lo que está en pantalla. */
  const liquidacion = useMemo(() => {
    if (!cuadricula) return [];
    return cuadricula.colaboradores.map((c) => {
      let dias = 0;
      let jornales = 0;
      for (const f of filas) {
        const monto = num(f.pagos[c.colaborador_id]);
        if (monto > 0) {
          dias += 1;
          jornales += monto;
        }
      }
      return { ...c, dias, jornales };
    });
  }, [filas, cuadricula]);

  /* ---------- guardado ---------- */

  const guardar = async () => {
    if (!cuadricula || sucias.size === 0) return;

    setGuardando(true);
    setError("");

    try {
      const idCombustible = idCategoria("Combustible");
      const idOtros = idCategoria("Otros");

      const dias = filas
        .filter((f) => sucias.has(f.fecha))
        .map((f) => {
          const c = calculada(f);
          const hayTrabajo =
            c.manoObra > 0 || c.entrada > 0 || f.sector.trim() !== "" || f.trabajo.trim() !== "";

          // El estado se deduce en vez de preguntarse. Si el día estaba
          // marcado como descanso o feriado y sigue sin actividad, se respeta:
          // esa marca la puso alguien a propósito desde la otra pantalla.
          const estado: EstadoDia = hayTrabajo
            ? "trabajado"
            : f.estadoOriginal === "descanso" || f.estadoOriginal === "feriado"
              ? f.estadoOriginal
              : "no_trabajado";

          const fila: Record<string, unknown> = {
            fecha: f.fecha,
            estado,
            sector: f.sector,
            trabajo_realizado: f.trabajo,
            metros_fibra: num(f.metros),
            punta_inicial: num(f.puntaInicial),
            punta_final: num(f.puntaFinal),
            tipo_fibra_id: f.tipoFibraId ? Number(f.tipoFibraId) : null,
            bono_onnet: num(f.bonoOnnet),
            ingreso: num(f.entrada),
            pagos: cuadricula.colaboradores.map((col) => {
              const monto = num(f.pagos[col.colaborador_id]);
              const previo = f.pagosOriginales[col.colaborador_id];
              return {
                colaborador_id: col.colaborador_id,
                monto,
                // Se devuelven intactos: la cuadrícula no los edita.
                bono: previo?.bono ?? 0,
                observacion: previo?.observacion ?? null,
                // Quien estaba marcado como presente sigue estándolo aunque
                // cobre 0: fue a trabajar y alguien lo registró a propósito.
                asistio: monto > 0 || Boolean(previo?.asistio)
              };
            })
          };

          // Los gastos sólo se mandan si se tocaron. Así una fila donde sólo
          // se corrigió el sector no borra los gastos que ya tenía.
          if (gastosTocados.has(f.fecha) && !f.gastosComplejos) {
            const gastos = [];
            if (num(f.combustible) > 0 && idCombustible) {
              gastos.push({
                categoria_id: idCombustible,
                descripcion: f.detalleGasto || null,
                monto: num(f.combustible)
              });
            }
            const categoriaOtro = f.otroCategoriaId ?? idOtros;
            if (num(f.otroGasto) > 0 && categoriaOtro) {
              gastos.push({
                categoria_id: categoriaOtro,
                descripcion: f.detalleGasto || null,
                monto: num(f.otroGasto)
              });
            }
            fila.gastos = gastos;
          }

          return fila;
        });

      const resultado = await guardarCuadricula(cuadricula.planilla.id, dias);

      setCuadricula(resultado.cuadricula);
      setFilas(construirFilas(resultado.cuadricula));
      setSucias(new Set());
      setGastosTocados(new Set());

      Swal.fire({
        icon: "success",
        title: "Guardado",
        text: `${resultado.creados} días nuevos, ${resultado.actualizados} actualizados`,
        timer: 1800,
        showConfirmButton: false
      });
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const descartar = () => {
    if (!cuadricula) return;
    setFilas(construirFilas(cuadricula));
    setSucias(new Set());
    setGastosTocados(new Set());
  };

  /* ---------- nueva planilla ---------- */

  const [nueva, setNueva] = useState({
    cuadrilla_id: "",
    mes: String(new Date().getMonth() + 1),
    anio: String(new Date().getFullYear()),
    quincena: "1"
  });
  const [errorNueva, setErrorNueva] = useState("");

  const crearRapida = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNueva("");

    if (!nueva.cuadrilla_id) return setErrorNueva("Seleccione la cuadrilla");

    const anio = Number(nueva.anio);
    const mes = Number(nueva.mes);
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const primera = nueva.quincena === "1";

    const inicio = `${anio}-${String(mes).padStart(2, "0")}-${primera ? "01" : "16"}`;
    const fin = `${anio}-${String(mes).padStart(2, "0")}-${primera ? "15" : String(ultimo)}`;
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    try {
      const creada = await crearPlanilla({
        cuadrilla_id: Number(nueva.cuadrilla_id),
        nombre: `${meses[mes - 1]} ${anio} - ${primera ? "1ra" : "2da"} quincena`,
        fecha_inicio: inicio,
        fecha_fin: fin,
        estado: "abierta"
      });

      setNuevaAbierta(false);
      const lista = await obtenerPlanillas();
      setPlanillas(lista);
      setPlanillaId(creada.id);
    } catch (e) {
      if (esErrorDeAcceso(e)) return manejarError(e);
      setErrorNueva(e instanceof Error ? e.message : "No se pudo crear");
    }
  };

  /* ---------- render ---------- */

  if (verificando) {
    return <AdminLayout><Cargando texto="Verificando acceso..." /></AdminLayout>;
  }

  if (!permitido) {
    return <AdminLayout><AccesoDenegado mensaje={errorAcceso} /></AdminLayout>;
  }

  const bloqueada = cuadricula?.planilla.estado === "pagada";
  const colaboradores = cuadricula?.colaboradores ?? [];

  return (
    <AdminLayout>
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">Planilla rápida</h1>
            <p className="text-sm text-slate-600 mt-1">
              El mes completo en una sola hoja, como en el Excel. Escriba en las celdas y guarde al final.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${claseInput} sm:w-72`}
              value={planillaId ?? ""}
              onChange={(e) => {
                if (sucias.size > 0 && !confirm("Hay cambios sin guardar. ¿Cambiar de planilla y perderlos?")) return;
                setPlanillaId(Number(e.target.value));
              }}
            >
              {planillas.length === 0 && <option value="">No hay planillas</option>}
              {planillas.map((p) => (
                <option key={p.planilla_id} value={p.planilla_id}>
                  {p.nombre} — {p.cuadrilla}
                </option>
              ))}
            </select>

            <button onClick={() => setNuevaAbierta(true)} className={claseBotonSecundario}>
              <Plus className="size-4" /> Nueva
            </button>

            <button
              onClick={() => setIntegrantesAbierto(true)}
              disabled={!cuadricula}
              className={claseBotonSecundario}
            >
              <Users className="size-4" /> Colaboradores ({colaboradores.length})
            </button>

            {cuadricula && (
              <Link
                href={`/pages/admin/planillas/${cuadricula.planilla.id}`}
                className={claseBotonSecundario}
                title="Abrir esta misma planilla en la pantalla detallada"
              >
                <ExternalLink className="size-4" /> Vista detallada
              </Link>
            )}
          </div>
        </div>

        <MensajeError mensaje={error} />

        {bloqueada && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
            Planilla <b>pagada</b>: no admite cambios. Reábrala desde la vista detallada.
          </div>
        )}

        {cargando ? (
          <Cargando />
        ) : !cuadricula ? (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm py-16 text-center">
            <p className="text-sm text-slate-500">
              No hay ninguna planilla todavía. Cree una con el botón <b>Nueva</b>.
            </p>
          </div>
        ) : (
          <>
            {/* ---------- barra de totales ---------- */}
            <div className="sticky top-16 z-20 mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Entrada</p>
                  <p className="text-lg font-bold text-emerald-600">{formatoLempiras(totales.entrada)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Mano de obra</p>
                  <p className="text-lg font-bold text-slate-800">{formatoLempiras(totales.manoObra)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Gastos</p>
                  <p className="text-lg font-bold text-slate-800">{formatoLempiras(totales.gasto)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Margen</p>
                  <p className={`text-lg font-bold ${totales.margen < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatoLempiras(totales.margen)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Días / metros</p>
                  <p className="text-lg font-bold text-slate-800">
                    {totales.dias} · {formatoNumero(totales.metros)}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {sucias.size > 0 && (
                    <>
                      <span className="text-xs text-amber-700 font-medium">
                        {sucias.size} {sucias.size === 1 ? "día sin guardar" : "días sin guardar"}
                      </span>
                      <button onClick={descartar} className={claseBotonSecundario}>
                        <RotateCcw className="size-4" /> Descartar
                      </button>
                    </>
                  )}
                  <button
                    onClick={guardar}
                    disabled={guardando || sucias.size === 0 || bloqueada}
                    className={claseBotonPrimario}
                  >
                    <Save className="size-4" /> {guardando ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </div>

            {/* ---------- la hoja ---------- */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table ref={tabla} className="text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200 px-3 py-2 text-left font-medium w-24">
                      Día
                    </th>
                    {colaboradores.map((c) => (
                      <th key={c.colaborador_id}
                          className="px-1 py-2 text-center font-medium min-w-[76px] border-r border-slate-100"
                          title={`${c.nombre} ${c.apellido ?? ""} · jornal ${formatoLempiras(c.tarifa_diaria)}`}>
                        {c.alias || c.nombre}
                      </th>
                    ))}
                    <th className="px-1 py-2 w-10"></th>
                    <th className="px-2 py-2 text-left font-medium min-w-[150px]">Sector</th>
                    <th className="px-2 py-2 text-left font-medium min-w-[200px]">Trabajo realizado</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[80px]">Metros</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[80px]">Punta ini.</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[80px]">Punta fin.</th>
                    <th className="px-2 py-2 text-left font-medium min-w-[80px]">Fibra</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[100px]">Entrada</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[90px]">Combustible</th>
                    <th className="px-2 py-2 text-left font-medium min-w-[160px]">Detalle gasto</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[90px]">Otro gasto</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[100px] bg-slate-100">Mano obra</th>
                    <th className="px-2 py-2 text-right font-medium min-w-[110px] bg-slate-100">Margen</th>
                  </tr>
                </thead>

                <tbody>
                  {filas.map((f, i) => {
                    const c = calculada(f);
                    const sucia = sucias.has(f.fecha);
                    const finde = esFinDeSemana(f.fecha);

                    return (
                      <tr
                        key={f.fecha}
                        className={`border-t border-slate-100 ${
                          sucia ? "bg-amber-50/60" : finde ? "bg-slate-50/60" : "hover:bg-orange-50/30"
                        }`}
                      >
                        <td className={`sticky left-0 z-10 border-r border-slate-200 px-3 py-1 whitespace-nowrap font-medium ${
                          sucia ? "bg-amber-50" : finde ? "bg-slate-50" : "bg-white"
                        }`}>
                          <span className={finde ? "text-slate-400" : "text-slate-700"}>
                            {etiquetaDia(f.fecha)}
                          </span>
                        </td>

                        {colaboradores.map((col) => (
                          <td key={col.colaborador_id} className="border-r border-slate-100 p-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={bloqueada}
                              data-fila={i}
                              data-col={`pago-${col.colaborador_id}`}
                              className={celdaNumero}
                              value={f.pagos[col.colaborador_id] ?? ""}
                              onChange={(e) => cambiarPago(f.fecha, col.colaborador_id, e.target.value)}
                              onKeyDown={(e) => alPresionar(e, i, `pago-${col.colaborador_id}`)}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>
                        ))}

                        <td className="p-0 text-center">
                          <button
                            type="button"
                            onClick={() => llenarFila(f.fecha)}
                            disabled={bloqueada}
                            title="Llenar con el jornal de cada uno"
                            className="rounded p-1 text-slate-300 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-30"
                          >
                            <Wand2 className="size-3.5" />
                          </button>
                        </td>

                        <td className="p-0">
                          <input type="text" disabled={bloqueada} data-fila={i} data-col="sector"
                            className={celda} value={f.sector}
                            onChange={(e) => cambiar(f.fecha, { sector: e.target.value })}
                            onKeyDown={(e) => alPresionar(e, i, "sector")} />
                        </td>
                        <td className="p-0">
                          <input type="text" disabled={bloqueada} data-fila={i} data-col="trabajo"
                            className={celda} value={f.trabajo}
                            onChange={(e) => cambiar(f.fecha, { trabajo: e.target.value })}
                            onKeyDown={(e) => alPresionar(e, i, "trabajo")} />
                        </td>
                        <td className="p-0">
                          <input type="text" inputMode="decimal" disabled={bloqueada} data-fila={i} data-col="metros"
                            className={celdaNumero} value={f.metros}
                            onChange={(e) => cambiar(f.fecha, { metros: e.target.value })}
                            onKeyDown={(e) => alPresionar(e, i, "metros")}
                            onFocus={(e) => e.target.select()} />
                        </td>
                        <td className="p-0">
                          <input type="text" inputMode="decimal" disabled={bloqueada} data-fila={i} data-col="pi"
                            className={celdaNumero} value={f.puntaInicial}
                            onChange={(e) => cambiar(f.fecha, { puntaInicial: e.target.value })}
                            onKeyDown={(e) => alPresionar(e, i, "pi")}
                            onFocus={(e) => e.target.select()} />
                        </td>
                        <td className="p-0">
                          <input type="text" inputMode="decimal" disabled={bloqueada} data-fila={i} data-col="pf"
                            className={celdaNumero} value={f.puntaFinal}
                            onChange={(e) => cambiar(f.fecha, { puntaFinal: e.target.value })}
                            onKeyDown={(e) => alPresionar(e, i, "pf")}
                            onFocus={(e) => e.target.select()} />
                        </td>
                        <td className="p-0">
                          <select disabled={bloqueada} className={celda} value={f.tipoFibraId}
                            onChange={(e) => cambiar(f.fecha, { tipoFibraId: e.target.value })}>
                            <option value="">—</option>
                            {catalogos?.tiposFibra.map((t) => (
                              <option key={t.id} value={t.id}>{t.codigo}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-0">
                          <input type="text" inputMode="decimal" disabled={bloqueada} data-fila={i} data-col="entrada"
                            className={`${celdaNumero} font-medium`} value={f.entrada}
                            onChange={(e) => cambiar(f.fecha, { entrada: e.target.value })}
                            onKeyDown={(e) => alPresionar(e, i, "entrada")}
                            onFocus={(e) => e.target.select()} />
                        </td>

                        {f.gastosComplejos ? (
                          <td colSpan={3} className="px-2 py-1 text-xs text-slate-500 italic"
                              title="Este día tiene varios gastos cargados desde la vista detallada. Edítelos allí.">
                            {formatoLempiras(f.gastoBloqueado)} en varios gastos — editar en vista detallada
                          </td>
                        ) : (
                          <>
                            <td className="p-0">
                              <input type="text" inputMode="decimal" disabled={bloqueada} data-fila={i} data-col="comb"
                                className={celdaNumero} value={f.combustible}
                                onChange={(e) => cambiarGasto(f.fecha, { combustible: e.target.value })}
                                onKeyDown={(e) => alPresionar(e, i, "comb")}
                                onFocus={(e) => e.target.select()} />
                            </td>
                            <td className="p-0">
                              <input type="text" disabled={bloqueada} data-fila={i} data-col="detalle"
                                className={celda} value={f.detalleGasto}
                                onChange={(e) => cambiarGasto(f.fecha, { detalleGasto: e.target.value })}
                                onKeyDown={(e) => alPresionar(e, i, "detalle")} />
                            </td>
                            <td className="p-0">
                              <input type="text" inputMode="decimal" disabled={bloqueada} data-fila={i} data-col="otro"
                                className={celdaNumero} value={f.otroGasto}
                                onChange={(e) => cambiarGasto(f.fecha, { otroGasto: e.target.value })}
                                onKeyDown={(e) => alPresionar(e, i, "otro")}
                                onFocus={(e) => e.target.select()} />
                            </td>
                          </>
                        )}

                        <td className="px-2 py-1 text-right tabular-nums text-slate-600 bg-slate-50/70">
                          {c.manoObra ? formatoNumero(c.manoObra, 2) : ""}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums font-semibold bg-slate-50/70 ${
                          c.margen < 0 ? "text-red-600" : c.margen > 0 ? "text-emerald-700" : "text-slate-400"
                        }`}>
                          {c.manoObra || c.entrada || c.gasto ? formatoNumero(c.margen, 2) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="bg-slate-100 font-semibold text-slate-700 border-t-2 border-slate-300">
                  <tr>
                    <td className="sticky left-0 z-10 bg-slate-100 border-r border-slate-200 px-3 py-2">Total</td>
                    {colaboradores.map((col) => {
                      const suma = filas.reduce((a, f) => a + num(f.pagos[col.colaborador_id]), 0);
                      return (
                        <td key={col.colaborador_id} className="px-1 py-2 text-right tabular-nums border-r border-slate-200">
                          {suma ? formatoNumero(suma) : ""}
                        </td>
                      );
                    })}
                    <td />
                    <td colSpan={2} />
                    <td className="px-2 py-2 text-right tabular-nums">{formatoNumero(totales.metros)}</td>
                    <td colSpan={3} />
                    <td className="px-2 py-2 text-right tabular-nums">{formatoNumero(totales.entrada)}</td>
                    <td colSpan={3} className="px-2 py-2 text-right tabular-nums">
                      gastos {formatoNumero(totales.gasto)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatoNumero(totales.manoObra)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${
                      totales.margen < 0 ? "text-red-600" : "text-emerald-700"
                    }`}>
                      {formatoNumero(totales.margen)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Enter baja a la celda de abajo. La varita llena la fila con el jornal de cada uno. El día se
              marca como trabajado solo si tiene pago, entrada o sector — no hay que indicarlo.
              {cuadricula.gastosGenerales.length > 0 && (
                <> Hay {cuadricula.gastosGenerales.length} gasto(s) del periodo sin día asignado
                  ({formatoLempiras(cuadricula.gastosGenerales.reduce((a, g) => a + num(g.monto), 0))})
                  que sólo se ven en la vista detallada; no están en el margen de arriba.</>
              )}
            </p>

            {/* ---------- liquidación ---------- */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Resumen por colaborador</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Se recalcula mientras escribe. Los vales y los pagos entregados se administran
                  en la vista detallada.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Colaborador</th>
                      <th className="px-4 py-2 text-right font-medium">Jornal</th>
                      <th className="px-4 py-2 text-center font-medium">Días</th>
                      <th className="px-4 py-2 text-right font-medium">Devengado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liquidacion.map((l) => (
                      <tr key={l.colaborador_id}>
                        <td className="px-4 py-2 text-slate-700">{l.alias || l.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{formatoLempiras(l.tarifa_diaria)}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{l.dias}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">
                          {formatoLempiras(l.jornales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <td className="px-4 py-2" colSpan={3}>Total</td>
                      <td className="px-4 py-2 text-right">{formatoLempiras(totales.manoObra)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {cuadricula && (
        <IntegrantesModal
          abierto={integrantesAbierto}
          planilla={{ id: cuadricula.planilla.id, colaboradores: cuadricula.colaboradores }}
          onCerrar={() => setIntegrantesAbierto(false)}
          onGuardado={() => cargarCuadricula(cuadricula.planilla.id)}
        />
      )}

      <Modal abierto={nuevaAbierta} titulo="Nueva planilla" onCerrar={() => setNuevaAbierta(false)}>
        <form onSubmit={crearRapida} className="space-y-4">
          <MensajeError mensaje={errorNueva} />

          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Cuadrilla">
              <select className={claseInput} value={nueva.cuadrilla_id}
                onChange={(e) => setNueva({ ...nueva, cuadrilla_id: e.target.value })}>
                <option value="">Seleccione...</option>
                {catalogos?.cuadrillas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Quincena">
              <select className={claseInput} value={nueva.quincena}
                onChange={(e) => setNueva({ ...nueva, quincena: e.target.value })}>
                <option value="1">1ra (01 al 15)</option>
                <option value="2">2da (16 al fin de mes)</option>
              </select>
            </Campo>
            <Campo etiqueta="Mes">
              <select className={claseInput} value={nueva.mes}
                onChange={(e) => setNueva({ ...nueva, mes: e.target.value })}>
                {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto",
                  "Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Año">
              <input type="number" className={claseInput} value={nueva.anio}
                onChange={(e) => setNueva({ ...nueva, anio: e.target.value })} />
            </Campo>
          </div>

          <p className="text-xs text-slate-500">
            Se crea vacía y con todos los días del periodo listos para escribir.
            Después agregue los colaboradores con el botón de arriba.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNuevaAbierta(false)} className={claseBotonSecundario}>
              Cancelar
            </button>
            <button type="submit" className={claseBotonPrimario}>Crear</button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
};

export default PlanillaRapida;
