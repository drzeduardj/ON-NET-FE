"use client";

// Detalle de lo cobrado en un mes concreto.
//
// Sale al hacer clic en una casilla del calendario que esté 'Pagado' o
// 'Pagado Parcial'. Antes el color decía que el mes estaba cobrado pero no
// había forma de llegar al pago que lo respalda sin buscarlo a mano en el
// historial, y con los meses parciales ni siquiera se veía cuánto faltaba.
//
// Va en components/ y no dentro de una pantalla porque lo usan tanto las
// rejillas de admin como la del cajero.

import { useEffect, useState } from "react";
import { getEstadoTextColor, etiquetaEstado } from "@/app/lib/estadoMensual";

const apiHost = process.env.NEXT_PUBLIC_API_HOST as string;

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const HNL = new Intl.NumberFormat("es-HN", {
  style: "currency",
  currency: "HNL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 'YYYY-MM-DD' o ISO -> 'DD/MM/YYYY'. Se corta la cadena en vez de usar
 *  Date() porque `new Date("2026-01-15")` se interpreta en UTC y en Honduras
 *  retrocede un día. */
const formatearFecha = (valor?: string | null): string => {
  if (!valor) return "—";
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
};

interface PagoDelMes {
  id: number;
  monto: number | string;
  fecha_pago: string | null;
  fecha_emision: string | null;
  referencia: string | null;
  observacion: string | null;
  metodo_pago_desc: string | null;
  usuario_nombre: string | null;
  usuario_apellido: string | null;
}

interface DetalleMes {
  cliente_id: number;
  cliente_nombre: string;
  plan_nombre: string | null;
  mes: number;
  anio: number;
  estado: string | null;
  precio_mensual: number;
  total_pagado: number;
  saldo: number;
  pagos: PagoDelMes[];
}

interface PagosMesModalProps {
  clienteId: number;
  /** Se muestra mientras carga; después manda el nombre que trae la API. */
  clienteNombre?: string;
  mes: number;
  anio: number;
  onClose: () => void;
}

const PagosMesModal = ({
  clienteId,
  clienteNombre,
  mes,
  anio,
  onClose,
}: PagosMesModalProps) => {
  const [detalle, setDetalle] = useState<DetalleMes | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      setError("");
      try {
        const res = await fetch(
          `${apiHost}/api/pagos/cliente/${clienteId}/${mes}/${anio}`
        );
        if (!res.ok) throw new Error("No se pudo cargar el detalle del mes.");
        const data = (await res.json()) as DetalleMes;
        if (!cancelado) setDetalle(data);
      } catch (e) {
        if (!cancelado) {
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el detalle del mes."
          );
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [clienteId, mes, anio]);

  // Cerrar con Escape y bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onClose]);

  const titulo = `${MESES[mes - 1]} ${anio}`;
  const nombre = detalle?.cliente_nombre ?? clienteNombre ?? "Cliente";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-orange-200 w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-orange-600">Pagos de {titulo}</h2>
            <p className="text-sm text-slate-600">{nombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm"
          >
            Cerrar
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-5 py-4 overflow-y-auto">
          {cargando ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Cargando detalle...
            </p>
          ) : error ? (
            <p className="text-sm text-red-600 py-6 text-center">{error}</p>
          ) : !detalle ? null : (
            <>
              {/* Resumen del mes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="border rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase text-slate-500">Estado</div>
                  <div className={`text-sm ${getEstadoTextColor(detalle.estado)}`}>
                    {etiquetaEstado(detalle.estado)}
                  </div>
                </div>
                <div className="border rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase text-slate-500">Mensualidad</div>
                  <div className="text-sm font-semibold text-slate-700">
                    {HNL.format(detalle.precio_mensual)}
                  </div>
                </div>
                <div className="border rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase text-slate-500">Pagado</div>
                  <div className="text-sm font-semibold text-green-700">
                    {HNL.format(detalle.total_pagado)}
                  </div>
                </div>
                <div className="border rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase text-slate-500">Saldo</div>
                  <div
                    className={`text-sm font-semibold ${
                      detalle.saldo > 0 ? "text-red-600" : "text-slate-700"
                    }`}
                  >
                    {HNL.format(detalle.saldo)}
                  </div>
                </div>
              </div>

              {detalle.plan_nombre && (
                <p className="text-xs text-slate-500 mb-4">
                  Plan: <span className="font-medium">{detalle.plan_nombre}</span>
                </p>
              )}

              {/* Pagos que respaldan el mes */}
              {detalle.pagos.length === 0 ? (
                // El mes está marcado como cobrado pero no hay ningún pago
                // detrás: pasa con los meses sembrados a mano y con las cargas
                // históricas. Se dice explícito en vez de mostrar una lista
                // vacía, porque si no parece que falló la consulta.
                <p className="text-sm text-slate-500 italic border rounded-lg px-3 py-4 text-center">
                  Este mes está marcado como &ldquo;{etiquetaEstado(detalle.estado)}
                  &rdquo; pero no tiene ningún pago registrado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detalle.pagos.map((pago) => (
                    <li key={pago.id} className="border rounded-lg px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-800">
                          {HNL.format(Number(pago.monto))}
                        </div>
                        <div className="text-xs text-slate-500">Pago #{pago.id}</div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-500">Fecha del recibo: </span>
                          {formatearFecha(pago.fecha_pago)}
                        </div>
                        <div>
                          <span className="text-slate-500">Registrado: </span>
                          {formatearFecha(pago.fecha_emision)}
                        </div>
                        <div>
                          <span className="text-slate-500">Método: </span>
                          {pago.metodo_pago_desc || "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Referencia: </span>
                          {pago.referencia || "—"}
                        </div>
                        {(pago.usuario_nombre || pago.usuario_apellido) && (
                          <div className="sm:col-span-2">
                            <span className="text-slate-500">Cobró: </span>
                            {[pago.usuario_nombre, pago.usuario_apellido]
                              .filter(Boolean)
                              .join(" ")}
                          </div>
                        )}
                        {pago.observacion && (
                          <div className="sm:col-span-2">
                            <span className="text-slate-500">Observación: </span>
                            {pago.observacion}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PagosMesModal;
