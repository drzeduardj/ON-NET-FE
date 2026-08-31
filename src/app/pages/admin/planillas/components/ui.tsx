"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
import { formatoLempiras, num } from "@/app/lib/planillasApi";

/**
 * Piezas visuales compartidas por las cuatro pantallas del módulo.
 * Están juntas para que la tarjeta de "Utilidad" se vea igual en el listado de
 * planillas y en la pantalla de márgenes.
 */

export const Cargando = ({ texto = "Cargando..." }: { texto?: string }) => (
  <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-3" />
    {texto}
  </div>
);

export const MensajeError = ({ mensaje }: { mensaje: string }) =>
  mensaje ? (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
      {mensaje}
    </div>
  ) : null;

export const Vacio = ({ texto }: { texto: string }) => (
  <div className="text-center py-12 text-sm text-slate-500">{texto}</div>
);

/**
 * Se muestra cuando la verificación de acceso termina sin permiso.
 * Distingue "no tiene acceso" de "no se pudo comprobar": si el backend está
 * caído, decirle al usuario que no tiene permiso lo manda a pedir un permiso
 * que ya tiene.
 */
export const AccesoDenegado = ({ mensaje }: { mensaje?: string }) => (
  <div className="max-w-xl mx-auto py-20 text-center">
    <p className="text-lg font-semibold text-slate-700">
      {mensaje ? "No se pudo abrir el módulo" : "Sin acceso a este módulo"}
    </p>
    <p className="mt-2 text-sm text-slate-500">
      {mensaje || "Su cargo no tiene habilitado este módulo. Solicítelo al administrador."}
    </p>
  </div>
);

/** Tarjeta de indicador. `tono` cambia el color según si el número es bueno o malo. */
export const Tarjeta = ({
  titulo,
  valor,
  detalle,
  tono = "neutro"
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: "neutro" | "positivo" | "negativo" | "aviso";
}) => {
  const tonos = {
    neutro: "text-slate-800",
    positivo: "text-emerald-600",
    negativo: "text-red-600",
    aviso: "text-amber-600"
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{titulo}</p>
      <p className={`mt-1 text-xl sm:text-2xl font-bold ${tonos[tono]}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
};

/** Tarjeta de dinero que se pinta verde o roja según el signo. */
export const TarjetaMonto = ({
  titulo,
  monto,
  detalle
}: {
  titulo: string;
  monto: number;
  detalle?: string;
}) => (
  <Tarjeta
    titulo={titulo}
    valor={formatoLempiras(monto)}
    detalle={detalle}
    tono={num(monto) < 0 ? "negativo" : "positivo"}
  />
);

/** Número de dinero con color según el signo. Para celdas de tabla. */
export const Monto = ({ valor, resaltar = false }: { valor: unknown; resaltar?: boolean }) => {
  const n = num(valor);
  const color = n < 0 ? "text-red-600" : n > 0 ? "text-emerald-700" : "text-slate-500";
  return <span className={`${color} ${resaltar ? "font-semibold" : ""}`}>{formatoLempiras(n)}</span>;
};

const COLORES_ESTADO: Record<string, string> = {
  abierta: "bg-blue-100 text-blue-800",
  cerrada: "bg-amber-100 text-amber-800",
  pagada: "bg-emerald-100 text-emerald-800",
  trabajado: "bg-emerald-100 text-emerald-800",
  no_trabajado: "bg-slate-100 text-slate-600",
  descanso: "bg-slate-100 text-slate-600",
  feriado: "bg-purple-100 text-purple-800",
  planificado: "bg-slate-100 text-slate-700",
  en_proceso: "bg-blue-100 text-blue-800",
  finalizado: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-red-100 text-red-700"
};

const ETIQUETAS: Record<string, string> = {
  no_trabajado: "No se trabajó",
  en_proceso: "En proceso"
};

export const Etiqueta = ({ estado }: { estado: string }) => (
  <span
    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
      COLORES_ESTADO[estado] ?? "bg-slate-100 text-slate-700"
    }`}
  >
    {ETIQUETAS[estado] ?? estado.charAt(0).toUpperCase() + estado.slice(1)}
  </span>
);

export const Modal = ({
  abierto,
  titulo,
  onCerrar,
  children,
  ancho = "max-w-2xl"
}: {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: string;
}) => {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className={`w-full ${ancho} my-8 rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
};

export const Campo = ({
  etiqueta,
  children,
  ancho = ""
}: {
  etiqueta: string;
  children: ReactNode;
  ancho?: string;
}) => (
  <label className={`block ${ancho}`}>
    <span className="block text-xs font-medium text-slate-600 mb-1">{etiqueta}</span>
    {children}
  </label>
);

export const claseInput =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

export const claseBotonPrimario =
  "inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export const claseBotonSecundario =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors";
