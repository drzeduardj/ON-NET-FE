// Cliente del módulo de planillas de campo.
//
// Está centralizado por dos razones concretas:
//
// 1. TODOS los endpoints del módulo exigen token y permiso de módulo. Un fetch
//    suelto que se olvide del header devuelve 401 y la pantalla queda en
//    blanco sin decir por qué.
//
// 2. mysql2 devuelve las columnas DECIMAL como STRING ("500.00", no 500). Sin
//    normalizar, `a + b` concatena en lugar de sumar y los totales de la
//    pantalla salen como "500.00300.00". Por eso todo lo que entra pasa por
//    `normalizar()`.

const apiHost = process.env.NEXT_PUBLIC_API_HOST || "";

/* ============================
   Tipos
   ============================ */

export interface Modulo {
  id: number;
  clave: string;
  nombre: string;
  ruta: string | null;
  icono: string | null;
  orden: number;
}

export interface Cuadrilla {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: number;
}

export interface TipoFibra {
  id: number;
  codigo: string;
  descripcion: string | null;
}

export interface CategoriaGasto {
  id: number;
  nombre: string;
}

export interface Catalogos {
  cuadrillas: Cuadrilla[];
  tiposFibra: TipoFibra[];
  categoriasGasto: CategoriaGasto[];
}

export interface Colaborador {
  id: number;
  nombre: string;
  apellido: string | null;
  alias: string | null;
  identidad: string | null;
  telefono: string | null;
  tarifa_diaria: number;
  usuario_id: number | null;
  username?: string | null;
  activo: number;
}

export interface ColaboradorSaldo {
  colaborador_id: number;
  nombre: string;
  alias: string | null;
  activo: number;
  dias_trabajados: number;
  devengado: number;
  vales: number;
  pagado: number;
  saldo: number;
}

export interface Vale {
  id: number;
  colaborador_id: number;
  planilla_id: number | null;
  fecha: string;
  monto: number;
  descripcion: string | null;
  colaborador?: string;
  planilla?: string | null;
}

export interface PagoColaborador {
  id: number;
  colaborador_id: number;
  planilla_id: number | null;
  monto: number;
  fecha_pago: string;
  fecha_registro: string;
  metodo_id: number | null;
  referencia: string | null;
  observacion: string | null;
  colaborador?: string;
  planilla?: string | null;
  metodo?: string | null;
  registrado_por?: string | null;
}

export interface EstadoCuenta {
  colaborador: Colaborador;
  saldo: ColaboradorSaldo | null;
  planillas: Liquidacion[];
  vales: Vale[];
  pagos: PagoColaborador[];
}

export type EstadoPlanilla = "abierta" | "cerrada" | "pagada";

export interface PlanillaResumen {
  planilla_id: number;
  nombre: string;
  estado: EstadoPlanilla;
  fecha_inicio: string;
  fecha_fin: string;
  cuadrilla: string;
  cuadrilla_id: number;
  dias_registrados: number;
  dias_trabajados: number;
  metros_total: number;
  instalaciones: number;
  ingreso_total: number;
  mano_obra: number;
  gastos: number;
  gasto_total: number;
  utilidad: number;
}

export interface IntegrantePlanilla {
  id?: number;
  colaborador_id: number;
  tarifa_diaria: number;
  observaciones: string | null;
  nombre?: string;
  apellido?: string | null;
  alias?: string | null;
}

export type EstadoDia = "trabajado" | "no_trabajado" | "descanso" | "feriado";

export interface PagoDelDia {
  id?: number;
  colaborador_id: number;
  asistio: number | boolean;
  monto: number;
  bono: number;
  observacion: string | null;
  nombre?: string;
  alias?: string | null;
}

export interface GastoPlanilla {
  id: number;
  planilla_id: number;
  planilla_dia_id: number | null;
  categoria_id: number;
  categoria?: string;
  descripcion: string | null;
  monto: number;
  fecha: string;
}

export interface DiaPlanilla {
  id: number;
  planilla_id: number;
  fecha: string;
  proyecto_id: number | null;
  proyecto?: string | null;
  sector: string | null;
  trabajo_realizado: string | null;
  estado: EstadoDia;
  instalaciones: number;
  tarifa_instalacion: number;
  metros_fibra: number;
  punta_inicial: number;
  punta_final: number;
  metros_total: number;
  tarifa_metro: number;
  tipo_fibra_id: number | null;
  tipo_fibra?: string | null;
  bono_onnet: number;
  ingreso: number;
  observaciones: string | null;
  ingreso_total: number;
  mano_obra: number;
  gastos: number;
  gasto_total: number;
  utilidad: number;
  colaboradores?: PagoDelDia[];
  gastosDetalle?: GastoPlanilla[];
}

export interface Planilla {
  id: number;
  cuadrilla_id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoPlanilla;
  observaciones: string | null;
  resumen: PlanillaResumen;
  colaboradores: IntegrantePlanilla[];
  dias: DiaPlanilla[];
  gastosGenerales: GastoPlanilla[];
}

export interface Liquidacion {
  planilla_id: number;
  planilla: string;
  colaborador_id: number;
  colaborador: string;
  alias: string | null;
  tarifa_diaria: number;
  dias_trabajados: number;
  jornales: number;
  bonos: number;
  devengado: number;
  vales: number;
  pagado: number;
  saldo: number;
  ultimo_pago: string | null;
  fecha_inicio?: string;
  fecha_fin?: string;
  estado_planilla?: EstadoPlanilla;
}

export type EstadoProyecto = "planificado" | "en_proceso" | "finalizado" | "cancelado";

export interface Proyecto {
  proyecto_id: number;
  id?: number;
  nombre: string;
  contratante?: string | null;
  estado: EstadoProyecto;
  costo: number;
  abonado: number;
  pendiente: number;
  ultimo_abono: string | null;
  mano_obra_directa: number;
  ingreso_registrado: number;
  observaciones?: string | null;
  abonos?: Abono[];
  dias?: DiaPlanilla[];
}

export interface Abono {
  id: number;
  proyecto_id: number | null;
  proyecto?: string | null;
  monto: number;
  fecha: string;
  metodo_id: number | null;
  metodo?: string | null;
  referencia: string | null;
  observacion: string | null;
}

export interface ResumenUtilidad {
  ingreso: number;
  mano_obra: number;
  gastos: number;
  utilidad: number;
  dias_registrados: number;
  metros: number;
  pendiente_colaboradores: number;
  pagado_colaboradores: number;
  proyectos: number;
  costo_contratado: number;
  abonado: number;
  pendiente_cobrar: number;
}

export interface UtilidadMensual {
  anio: number;
  mes: number;
  ingreso: number;
  mano_obra: number;
  gastos: number;
  utilidad: number;
}

/* ============================
   Normalización de números
   ============================ */

// Columnas DECIMAL/INT del módulo. `referencia` y `observacion` quedan fuera a
// propósito: son texto que a veces parece número (un número de recibo) y
// convertirlos rompería el cero a la izquierda.
const CAMPOS_NUMERICOS = new Set([
  "monto", "bono", "bonos", "bono_onnet", "ingreso", "ingreso_total", "ingreso_sugerido",
  "ingreso_registrado", "mano_obra", "mano_obra_directa", "gastos", "gasto_total",
  "utilidad", "costo", "costo_contratado", "abonado", "pendiente", "pendiente_cobrar",
  "pendiente_colaboradores", "pagado", "pagado_colaboradores", "saldo", "devengado",
  "vales", "jornales", "tarifa_diaria", "tarifa_metro", "tarifa_instalacion",
  "metros_fibra", "metros_total", "metros", "punta_inicial", "punta_final",
  "instalaciones", "dias_trabajados", "dias_registrados", "dias_de_diferencia",
  "total", "movimientos", "anio", "mes", "proyectos"
]);

const normalizar = (valor: unknown): unknown => {
  if (Array.isArray(valor)) return valor.map(normalizar);

  if (valor !== null && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPOS_NUMERICOS.has(clave) && typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
        salida[clave] = Number(v);
      } else {
        salida[clave] = normalizar(v);
      }
    }
    return salida;
  }

  return valor;
};

/** Convierte a número cualquier cosa que llegue. Para usar al pintar. */
export const num = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/* ============================
   Formato
   ============================ */

export const formatoLempiras = (valor: unknown): string =>
  new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(num(valor));

export const formatoNumero = (valor: unknown, decimales = 0): string =>
  new Intl.NumberFormat("es-HN", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  }).format(num(valor));

export const formatoFecha = (fecha: string | null | undefined): string => {
  if (!fecha) return "—";
  const soloFecha = fecha.slice(0, 10);
  const [a, m, d] = soloFecha.split("-");
  return a && m && d ? `${d}/${m}/${a}` : soloFecha;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const nombreMes = (mes: number): string => MESES[mes - 1] ?? String(mes);

export const hoyISO = (): string => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/* ============================
   Fetch
   ============================ */

export class ApiError extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = "ApiError";
    this.status = status;
  }
}

/** true si el error es de sesión o de permisos: la pantalla debe mandar a /noAuth. */
export const esErrorDeAcceso = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const encabezados = (): Record<string, string> => {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window === "undefined") return base;
  const token = localStorage.getItem("token");
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
};

const pedir = async <T>(ruta: string, init?: RequestInit): Promise<T> => {
  let respuesta: Response;

  try {
    respuesta = await fetch(`${apiHost}${ruta}`, {
      ...init,
      headers: { ...encabezados(), ...(init?.headers || {}) }
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor", 0);
  }

  if (respuesta.status === 204) return undefined as T;

  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }

  if (!respuesta.ok) {
    const mensaje =
      (cuerpo && typeof cuerpo === "object" && "error" in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : null) || `Error ${respuesta.status}`;
    throw new ApiError(mensaje, respuesta.status);
  }

  return normalizar(cuerpo) as T;
};

const query = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const partes = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return partes.length ? `?${partes.join("&")}` : "";
};

/* ============================
   Módulos
   ============================ */

export const obtenerMisModulos = () => pedir<Modulo[]>("/api/modulos/mios");

/* ============================
   Catálogos
   ============================ */

export const obtenerCatalogos = () => pedir<Catalogos>("/api/planilla-catalogos");

export const crearCuadrilla = (datos: { nombre: string; descripcion?: string | null }) =>
  pedir<Cuadrilla>("/api/planilla-catalogos/cuadrillas", {
    method: "POST",
    body: JSON.stringify(datos)
  });

/* ============================
   Planillas
   ============================ */

export const obtenerPlanillas = (filtros: {
  cuadrilla_id?: number | null;
  estado?: string | null;
  desde?: string | null;
  hasta?: string | null;
} = {}) => pedir<PlanillaResumen[]>(`/api/planillas${query(filtros)}`);

export const obtenerPlanilla = (id: number) => pedir<Planilla>(`/api/planillas/${id}`);

export const crearPlanilla = (datos: Record<string, unknown>) =>
  pedir<Planilla>("/api/planillas", { method: "POST", body: JSON.stringify(datos) });

export const actualizarPlanilla = (id: number, datos: Record<string, unknown>) =>
  pedir<Planilla>(`/api/planillas/${id}`, { method: "PUT", body: JSON.stringify(datos) });

export const cambiarEstadoPlanilla = (id: number, estado: EstadoPlanilla) =>
  pedir<{ id: number; estado: EstadoPlanilla }>(`/api/planillas/${id}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado })
  });

export const eliminarPlanilla = (id: number) =>
  pedir<{ message: string }>(`/api/planillas/${id}`, { method: "DELETE" });

export const guardarIntegrantes = (id: number, colaboradores: IntegrantePlanilla[]) =>
  pedir<IntegrantePlanilla[]>(`/api/planillas/${id}/colaboradores`, {
    method: "PUT",
    body: JSON.stringify({ colaboradores })
  });

export const obtenerLiquidacion = (id: number) =>
  pedir<Liquidacion[]>(`/api/planillas/${id}/liquidacion`);

/* ============================
   Cuadrícula (pantalla simplificada)
   ============================ */

export interface PagoCuadricula {
  planilla_dia_id: number;
  colaborador_id: number;
  asistio: number;
  monto: number;
  bono: number;
  observacion: string | null;
}

/** Un gasto tal como lo devuelve la cuadrícula: con el nombre de su categoría. */
export interface GastoCuadricula extends GastoPlanilla {
  categoria: string;
}

export interface DiaCuadricula extends DiaPlanilla {
  pagos: PagoCuadricula[];
  /** Detalle de gastos del día. `gastos` (heredado) es el total numérico. */
  gastosDetalle: GastoCuadricula[];
}

export interface Cuadricula {
  planilla: {
    id: number;
    cuadrilla_id: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
    estado: EstadoPlanilla;
    observaciones: string | null;
  };
  resumen: PlanillaResumen | null;
  colaboradores: IntegrantePlanilla[];
  dias: DiaCuadricula[];
  gastosGenerales: GastoCuadricula[];
}

/** La planilla entera en una sola petición: días, pagos y gastos. */
export const obtenerCuadricula = (id: number) =>
  pedir<Cuadricula>(`/api/planillas/${id}/cuadricula`);

/**
 * Guarda de golpe las filas que se tocaron, en una sola transacción.
 * Devuelve la cuadrícula recargada: los totales que se muestran después de
 * guardar son los que calculó la base, no los que estimó el navegador.
 */
export const guardarCuadricula = (id: number, dias: Record<string, unknown>[]) =>
  pedir<{ creados: number; actualizados: number; cuadricula: Cuadricula }>(
    `/api/planillas/${id}/cuadricula`,
    { method: "PUT", body: JSON.stringify({ dias }) }
  );

/* ============================
   Días
   ============================ */

export const obtenerDia = (planillaId: number, diaId: number) =>
  pedir<DiaPlanilla & { colaboradores: PagoDelDia[]; gastos: GastoPlanilla[] }>(
    `/api/planillas/${planillaId}/dias/${diaId}`
  );

export const crearDia = (planillaId: number, datos: Record<string, unknown>) =>
  pedir<DiaPlanilla>(`/api/planillas/${planillaId}/dias`, {
    method: "POST",
    body: JSON.stringify(datos)
  });

export const actualizarDia = (planillaId: number, diaId: number, datos: Record<string, unknown>) =>
  pedir<DiaPlanilla>(`/api/planillas/${planillaId}/dias/${diaId}`, {
    method: "PUT",
    body: JSON.stringify(datos)
  });

export const eliminarDia = (planillaId: number, diaId: number) =>
  pedir<{ message: string }>(`/api/planillas/${planillaId}/dias/${diaId}`, { method: "DELETE" });

/**
 * Propone la "entrada" del día. Es una sugerencia: la fórmula cambia según el
 * trabajo (instalaciones × tarifa en enero, metros × tarifa en agosto), así que
 * el número que vale es el que quede guardado.
 */
export const sugerirIngreso = (datos: Record<string, unknown>) =>
  pedir<{ ingreso_sugerido: number }>("/api/planillas/sugerir-ingreso", {
    method: "POST",
    body: JSON.stringify(datos)
  });

/* ============================
   Gastos de cuadrilla
   ============================ */

export const obtenerGastosPlanilla = (planillaId: number, soloGenerales = false) =>
  pedir<GastoPlanilla[]>(
    `/api/planilla-gastos${query({ planilla_id: planillaId, generales: soloGenerales || null })}`
  );

export const crearGastoPlanilla = (datos: Record<string, unknown>) =>
  pedir<GastoPlanilla>("/api/planilla-gastos", { method: "POST", body: JSON.stringify(datos) });

export const actualizarGastoPlanilla = (id: number, datos: Record<string, unknown>) =>
  pedir<GastoPlanilla>(`/api/planilla-gastos/${id}`, { method: "PUT", body: JSON.stringify(datos) });

export const eliminarGastoPlanilla = (id: number) =>
  pedir<{ message: string }>(`/api/planilla-gastos/${id}`, { method: "DELETE" });

/* ============================
   Colaboradores
   ============================ */

export const obtenerColaboradores = (soloActivos = false) =>
  pedir<Colaborador[]>(`/api/colaboradores${query({ activos: soloActivos || null })}`);

export const obtenerSaldosColaboradores = () =>
  pedir<ColaboradorSaldo[]>("/api/colaboradores/saldos");

export const obtenerEstadoCuenta = (id: number) =>
  pedir<EstadoCuenta>(`/api/colaboradores/${id}/estado-cuenta`);

export const crearColaborador = (datos: Record<string, unknown>) =>
  pedir<Colaborador>("/api/colaboradores", { method: "POST", body: JSON.stringify(datos) });

export const actualizarColaborador = (id: number, datos: Record<string, unknown>) =>
  pedir<Colaborador>(`/api/colaboradores/${id}`, { method: "PUT", body: JSON.stringify(datos) });

export const desactivarColaborador = (id: number) =>
  pedir<{ message: string }>(`/api/colaboradores/${id}`, { method: "DELETE" });

/* ============================
   Vales y pagos
   ============================ */

export const obtenerVales = (filtros: { colaborador_id?: number; planilla_id?: number } = {}) =>
  pedir<Vale[]>(`/api/vales${query(filtros)}`);

export const crearVale = (datos: Record<string, unknown>) =>
  pedir<Vale>("/api/vales", { method: "POST", body: JSON.stringify(datos) });

export const eliminarVale = (id: number) =>
  pedir<{ message: string }>(`/api/vales/${id}`, { method: "DELETE" });

export const obtenerPagosColaborador = (
  filtros: { colaborador_id?: number; planilla_id?: number; desde?: string; hasta?: string } = {}
) => pedir<PagoColaborador[]>(`/api/colaborador-pagos${query(filtros)}`);

export const crearPagoColaborador = (datos: Record<string, unknown>) =>
  pedir<PagoColaborador>("/api/colaborador-pagos", { method: "POST", body: JSON.stringify(datos) });

export const eliminarPagoColaborador = (id: number) =>
  pedir<{ message: string }>(`/api/colaborador-pagos/${id}`, { method: "DELETE" });

/* ============================
   Proyectos
   ============================ */

export const obtenerProyectos = (estado?: string | null) =>
  pedir<Proyecto[]>(`/api/proyectos${query({ estado })}`);

export const obtenerProyecto = (id: number) => pedir<Proyecto>(`/api/proyectos/${id}`);

export const crearProyecto = (datos: Record<string, unknown>) =>
  pedir<Proyecto>("/api/proyectos", { method: "POST", body: JSON.stringify(datos) });

export const actualizarProyecto = (id: number, datos: Record<string, unknown>) =>
  pedir<Proyecto>(`/api/proyectos/${id}`, { method: "PUT", body: JSON.stringify(datos) });

export const eliminarProyecto = (id: number) =>
  pedir<{ message: string }>(`/api/proyectos/${id}`, { method: "DELETE" });

export const obtenerAbonos = (filtros: { proyecto_id?: number; sinAsignar?: boolean } = {}) =>
  pedir<Abono[]>(`/api/proyectos/abonos${query(filtros)}`);

export const crearAbono = (datos: Record<string, unknown>) =>
  pedir<Abono>("/api/proyectos/abonos", { method: "POST", body: JSON.stringify(datos) });

/** Asigna a su proyecto un depósito que entró suelto desde la hoja CONTROL. */
export const asignarAbono = (id: number, proyectoId: number) =>
  pedir<{ id: number; proyecto_id: number }>(`/api/proyectos/abonos/${id}/proyecto`, {
    method: "PATCH",
    body: JSON.stringify({ proyecto_id: proyectoId })
  });

export const eliminarAbono = (id: number) =>
  pedir<{ message: string }>(`/api/proyectos/abonos/${id}`, { method: "DELETE" });

/* ============================
   Utilidad
   ============================ */

export const obtenerResumenUtilidad = (filtros: { desde?: string; hasta?: string } = {}) =>
  pedir<ResumenUtilidad>(`/api/utilidades/resumen${query(filtros)}`);

export const obtenerUtilidadMensual = (anio?: number) =>
  pedir<UtilidadMensual[]>(`/api/utilidades/mensual${query({ anio })}`);

export const obtenerUtilidadDiaria = (filtros: { desde?: string; hasta?: string } = {}) =>
  pedir<(DiaPlanilla & { planilla: string })[]>(`/api/utilidades/diaria${query(filtros)}`);
