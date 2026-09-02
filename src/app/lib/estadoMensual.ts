// Estados de estado_mensual y cómo se muestran/cuentan en toda la app.
//
// Estaba repetido en cada pantalla con criterios distintos, y por eso
// "Sin servicio" salía rojo en el modal y gris en la tabla. Centralizado acá
// para que agregar o cambiar un estado se haga en un solo lugar.

export const ESTADO_PAGADO = "Pagado";
export const ESTADO_PARCIAL = "Pagado Parcial";
export const ESTADO_PENDIENTE = "Pendiente";
export const ESTADO_SUSPENDIDO = "Suspendido";

/** Meses anteriores a la instalación del cliente: no tenía el servicio. */
export const ESTADO_SIN_SERVICIO = "Sin servicio";

/**
 * Estados que NO representan una deuda.
 *
 * "Sin servicio" es un mes en que la persona todavía no era cliente y
 * "Suspendido" es una decisión del negocio: en ninguno de los dos se le puede
 * cobrar, así que no cuentan como mes pendiente ni como morosidad.
 */
export const ESTADOS_SIN_DEUDA: readonly string[] = [
  ESTADO_PAGADO,
  ESTADO_SUSPENDIDO,
  ESTADO_SIN_SERVICIO,
];

/** true si ese mes se le debe cobrar al cliente. */
export const esMesConDeuda = (estado?: string | null): boolean =>
  !ESTADOS_SIN_DEUDA.includes(estado ?? "");

/**
 * true si ese mes tiene (o debería tener) un cobro detrás, y por lo tanto la
 * casilla del calendario se puede abrir para ver el detalle del pago.
 *
 * 'Pendiente', 'Suspendido' y 'Sin servicio' no llevan pago asociado: hacerlos
 * clicables abriría un modal vacío.
 */
export const tienePagoConsultable = (estado?: string | null): boolean =>
  estado === ESTADO_PAGADO || estado === ESTADO_PARCIAL;

/** Clases de Tailwind (fondo + texto) para la casilla del mes. */
export const getEstadoColor = (estado?: string | null): string => {
  switch (estado) {
    case ESTADO_PAGADO:
      return "bg-green-100 text-green-700";
    case ESTADO_PARCIAL:
      return "bg-yellow-100 text-yellow-700";
    case ESTADO_PENDIENTE:
      return "bg-red-100 text-red-700";
    case ESTADO_SUSPENDIDO:
      return "bg-gray-300 text-gray-800";
    case ESTADO_SIN_SERVICIO:
      return "bg-slate-100 text-slate-500";
    default:
      // Mes sin registro todavía.
      return "bg-slate-100 text-slate-600";
  }
};

/** Sólo el color de texto, para las listas que no pintan fondo. */
export const getEstadoTextColor = (estado?: string | null): string => {
  switch (estado) {
    case ESTADO_PAGADO:
      return "text-green-600 font-semibold";
    case ESTADO_PARCIAL:
      return "text-yellow-600 font-semibold";
    case ESTADO_SUSPENDIDO:
      return "text-gray-800 font-semibold";
    case ESTADO_SIN_SERVICIO:
      return "text-slate-500 font-semibold";
    default:
      return "text-red-600 font-semibold";
  }
};

/** Texto a mostrar cuando el mes no tiene registro. */
export const etiquetaEstado = (estado?: string | null): string =>
  estado || "Sin estado";

/**
 * Símbolo corto para las casillas chicas del calendario.
 *
 * Antes se usaba la primera letra, pero "Pagado", "Pagado Parcial" y
 * "Pendiente" daban todas "P", y "Suspendido" y "Sin servicio" daban "S".
 * El nombre completo sigue estando en el tooltip.
 */
export const abreviaturaEstado = (estado?: string | null): string => {
  switch (estado) {
    case ESTADO_PAGADO:
      return "✓";
    case ESTADO_PARCIAL:
      return "½";
    case ESTADO_PENDIENTE:
      return "!";
    case ESTADO_SUSPENDIDO:
      return "⊘";
    case ESTADO_SIN_SERVICIO:
      return "–";
    default:
      return "·";
  }
};

/** Para leyendas: los estados en el orden en que se muestran. */
export const LEYENDA_ESTADOS: readonly string[] = [
  ESTADO_PAGADO,
  ESTADO_PARCIAL,
  ESTADO_PENDIENTE,
  ESTADO_SUSPENDIDO,
  ESTADO_SIN_SERVICIO,
];
