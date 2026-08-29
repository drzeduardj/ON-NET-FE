"use client";

import React, { useEffect, useRef, useState } from "react";
import { getEstadoTextColor } from "@/app/lib/estadoMensual";

interface Estado {
  mes: number;
  anio: number;
  estado: string;
}

interface Cliente {
  id: number;
  nombre: string;
  ip: string;
  direccion: string;
  telefono: string;
  vineta: string | null;
  pass_onu: string;
  coordenadas: string | null;
  plan_id: number;
  dia_pago: number | null;
  estado_id?: number;
  estados: Estado[];
  fecha_instalacion: string | null;
}

interface ClienteModalProps {
  cliente: Cliente;
  onClose: () => void;
  onClienteUpdated: () => void;
  apiHost: string;
}

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

// Form interno del modal (inputs siempre string/number controlados)
interface ClienteForm {
  nombre: string;
  ip: string;
  direccion: string;
  telefono: string;
  vineta: string; // input
  pass_onu: string;
  coordenadas: string; // input
  plan_id: number | "";
  dia_pago: string; // input -> luego number|null
  estado_id: number | "";
  fecha_instalacion: string; // YYYY-MM-DD
}

const ClienteModal = ({ cliente, onClose, onClienteUpdated, apiHost }: ClienteModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  const toInputDate = (value?: string | null) => {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;

    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  };

  const [form, setForm] = useState<ClienteForm>(() => ({
    nombre: cliente.nombre ?? "",
    ip: cliente.ip ?? "",
    direccion: cliente.direccion ?? "",
    telefono: cliente.telefono ?? "",
    vineta: cliente.vineta ?? "",
    pass_onu: cliente.pass_onu ?? "",
    coordenadas: cliente.coordenadas ?? "",
    plan_id: typeof cliente.plan_id === "number" ? cliente.plan_id : "",
    dia_pago: cliente.dia_pago !== null && cliente.dia_pago !== undefined ? String(cliente.dia_pago) : "",
    estado_id: typeof cliente.estado_id === "number" ? cliente.estado_id : "",
    fecha_instalacion: toInputDate(cliente.fecha_instalacion),
  }));

  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [planes, setPlanes] = useState<{ id: number; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Si cambia el cliente (por ejemplo abrir otro), refrescar form
  useEffect(() => {
    setForm({
      nombre: cliente.nombre ?? "",
      ip: cliente.ip ?? "",
      direccion: cliente.direccion ?? "",
      telefono: cliente.telefono ?? "",
      vineta: cliente.vineta ?? "",
      pass_onu: cliente.pass_onu ?? "",
      coordenadas: cliente.coordenadas ?? "",
      plan_id: typeof cliente.plan_id === "number" ? cliente.plan_id : "",
      dia_pago: cliente.dia_pago !== null && cliente.dia_pago !== undefined ? String(cliente.dia_pago) : "",
      estado_id: typeof cliente.estado_id === "number" ? cliente.estado_id : "",
      fecha_instalacion: toInputDate(cliente.fecha_instalacion),
    });
    setEditando(false);
    setMensaje("");
  }, [cliente]);

  // Bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cerrar al hacer click fuera del modal
  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  useEffect(() => {
    const fetchPlanes = async () => {
      try {
        const res = await fetch(`${apiHost}/api/planes`);
        const data = (await res.json()) as unknown;

        if (Array.isArray(data)) {
          const safe = data
            .map((p) => {
              if (!p || typeof p !== "object") return null;
              const obj = p as Record<string, unknown>;
              const id = typeof obj.id === "number" ? obj.id : Number(obj.id);
              const nombre = typeof obj.nombre === "string" ? obj.nombre : "";
              if (!Number.isFinite(id)) return null;
              return { id, nombre };
            })
            .filter((x): x is { id: number; nombre: string } => x !== null);

          setPlanes(safe);
        }
      } catch (error) {
        console.error("Error al cargar planes:", error);
      }
    };
    fetchPlanes();
  }, [apiHost]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === "plan_id") {
      const v = value === "" ? "" : Number(value);
      setForm((prev) => ({ ...prev, plan_id: v }));
      return;
    }

    if (name === "estado_id") {
      const v = value === "" ? "" : Number(value);
      setForm((prev) => ({ ...prev, estado_id: v }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGuardar = async () => {
    setGuardando(true);
    setMensaje("");

    try {
      // Normalizaciones
      const vinetaValue = form.vineta.trim() === "" ? null : form.vineta.trim();
      const coordenadasValue = form.coordenadas.trim() === "" ? null : form.coordenadas.trim();

      // dia_pago: string -> number|null
      const diaPagoTrim = form.dia_pago.trim();
      const diaPagoNum = diaPagoTrim === "" ? null : Number(diaPagoTrim);
      const dia_pago = diaPagoTrim === "" ? null : (Number.isFinite(diaPagoNum) ? diaPagoNum : null);

      // fecha_instalacion ya viene YYYY-MM-DD desde input date
      const fecha_instalacion = form.fecha_instalacion || null;

      // plan_id requerido en tu backend, pero aquí mantenemos seguridad:
      const plan_id = form.plan_id === "" ? cliente.plan_id : form.plan_id;

      const estado_id = form.estado_id === "" ? undefined : form.estado_id;

      const datosParaEnviar = {
        nombre: form.nombre,
        ip: form.ip,
        direccion: form.direccion,
        telefono: form.telefono,
        vineta: vinetaValue,
        pass_onu: form.pass_onu,
        coordenadas: coordenadasValue,
        plan_id,
        dia_pago,
        estado_id,
        fecha_instalacion,
      };

      const res = await fetch(`${apiHost}/api/clientes/${cliente.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datosParaEnviar),
      });

      if (!res.ok) throw new Error("Error al actualizar cliente");

      setMensaje("✅ Cliente actualizado");
      setEditando(false);
      onClienteUpdated();
    } catch (error) {
      console.error(error);
      setMensaje("❌ No se pudo actualizar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[1px]"
      aria-modal="true"
      role="dialog"
      aria-labelledby="cliente-modal-title"
    >
      <div
        className="
          w-full sm:max-w-2xl lg:max-w-3xl 
          bg-white shadow-xl
          rounded-t-2xl sm:rounded-2xl
          overflow-hidden
          animate-in fade-in zoom-in-95 duration-150
          h-[92vh] sm:h-auto sm:max-h-[90vh]
          flex flex-col
        "
      >
        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 sm:px-6 py-4 flex items-center justify-between">
          <h2 id="cliente-modal-title" className="text-lg sm:text-xl font-bold text-orange-600">
            Detalles del Cliente
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800"
            aria-label="Cerrar"
            title="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="px-4 sm:px-6 py-4 overflow-y-auto grow">
          {/* Datos del cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* nombre */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Nombre</label>
              <input
                type="text"
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* telefono */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Teléfono</label>
              <input
                type="text"
                name="telefono"
                value={form.telefono}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* ✅ VINETA */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Viñeta</label>
              <input
                type="text"
                name="vineta"
                value={form.vineta}
                onChange={handleChange}
                readOnly={!editando}
                placeholder="Código de viñeta (opcional)"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* Fecha de instalación */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">
                Fecha de instalación
              </label>
              <input
                type="date"
                name="fecha_instalacion"
                value={form.fecha_instalacion}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* ip */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">IP</label>
              <input
                type="text"
                name="ip"
                value={form.ip}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* coordenadas */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Coordenadas</label>
              <input
                type="text"
                name="coordenadas"
                value={form.coordenadas}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* estado cliente */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Estado Cliente</label>
              <select
                name="estado_id"
                value={form.estado_id}
                onChange={handleChange}
                disabled={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
              >
                <option value="">Seleccionar estado</option>
                <option value={1}>Activo</option>
                <option value={2}>Inactivo</option>
                <option value={3}>Suspendido</option>
              </select>
            </div>

            {/* direccion */}
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1">Dirección</label>
              <textarea
                name="direccion"
                value={form.direccion}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md min-h-[72px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* Password ONU */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Contraseña ONU</label>
              <input
                type="text"
                name="pass_onu"
                value={form.pass_onu}
                onChange={handleChange}
                readOnly={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>

            {/* plan */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-700 mb-1">Plan</label>
              <select
                name="plan_id"
                value={form.plan_id}
                onChange={handleChange}
                disabled={!editando}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100 text-gray-500" : ""
                }`}
              >
                <option value="">Selecciona un plan</option>
                {planes.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Dia Pago */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Día de Pago</label>
              <input
                type="number"
                name="dia_pago"
                value={form.dia_pago}
                onChange={handleChange}
                readOnly={!editando}
                min={1}
                max={31}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  !editando ? "bg-gray-100" : ""
                }`}
              />
            </div>
          </div>

          {/* Estados de pago */}
          <div className="mt-6">
            <h3 className="font-semibold text-sm text-slate-700 mb-2">Estados de Pago</h3>
            {cliente.estados?.length ? (
              <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
                {cliente.estados.map((e, i) => (
                  <li
                    key={`${e.anio}-${e.mes}-${i}`}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <span className="text-slate-600">
                      {MESES[e.mes - 1]} / {e.anio}
                    </span>
                    <span className={getEstadoTextColor(e.estado)}>
                      {e.estado}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 italic text-sm">Sin historial</p>
            )}
          </div>

          {/* Mensaje */}
          {mensaje && (
            <p className="mt-4 text-center text-sm font-semibold text-orange-600">
              {mensaje}
            </p>
          )}
        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 bg-white border-t px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // cancelar edición: reset del form al valor original
                  if (editando) {
                    setForm({
                      nombre: cliente.nombre ?? "",
                      ip: cliente.ip ?? "",
                      direccion: cliente.direccion ?? "",
                      telefono: cliente.telefono ?? "",
                      vineta: cliente.vineta ?? "",
                      pass_onu: cliente.pass_onu ?? "",
                      coordenadas: cliente.coordenadas ?? "",
                      plan_id: typeof cliente.plan_id === "number" ? cliente.plan_id : "",
                      dia_pago:
                        cliente.dia_pago !== null && cliente.dia_pago !== undefined
                          ? String(cliente.dia_pago)
                          : "",
                      estado_id: typeof cliente.estado_id === "number" ? cliente.estado_id : "",
                      fecha_instalacion: toInputDate(cliente.fecha_instalacion),
                    });
                    setMensaje("");
                  }
                  setEditando((v) => !v);
                }}
                className="flex-1 sm:flex-none bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition"
              >
                {editando ? "Cancelar Edición" : "Editar Cliente"}
              </button>

              {editando && (
                <button
                  onClick={handleGuardar}
                  disabled={guardando}
                  className="flex-1 sm:flex-none bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition disabled:opacity-60"
                >
                  {guardando ? "Guardando..." : "Guardar Cambios"}
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="flex-1 sm:flex-none bg-gray-100 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-200 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClienteModal;
