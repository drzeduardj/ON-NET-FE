"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/app/components/adminLayout";
import Link from "next/link";
import ClienteModal from "./components/clienteModal";
import Pagination from "@/app/components/pagination";
import SearchDropdown from "@/app/components/searchBar";
import Swal from "sweetalert2";

const apiHost = process.env.NEXT_PUBLIC_API_HOST as string;

interface EstadoMensual {
  mes: number;
  anio: number;
  estado: string;
}

type EstadoNombre = "Activo" | "Inactivo" | "Suspendido" | string;

interface Plan {
  id: number;
  nombre: string;
  precio_mensual: number;
}
type PlanMap = Record<number, Plan>;

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
  fecha_instalacion: string | null;
  descripcion?: EstadoNombre;
  estados: EstadoMensual[];
  plan?: Plan;
}

const HNL = new Intl.NumberFormat("es-HN", {
  style: "currency",
  currency: "HNL",
  maximumFractionDigits: 2,
});

const mesCorto = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const mesLargo = [
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

const badgeEstado = (nombreEstado?: EstadoNombre, estado_id?: number) => {
  const label =
    nombreEstado ??
    (estado_id === 1
      ? "Activo"
      : estado_id === 2
        ? "Inactivo"
        : estado_id === 3
          ? "Suspendido"
          : "Desconocido");

  let cls =
    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border";
  switch (label) {
    case "Activo":
      cls += " bg-green-50 text-green-700 border-green-200";
      break;
    case "Inactivo":
      cls += " bg-gray-100 text-gray-700 border-gray-300";
      break;
    case "Suspendido":
      cls += " bg-yellow-50 text-yellow-700 border-yellow-200";
      break;
    default:
      cls += " bg-slate-100 text-slate-600 border-slate-200";
  }
  return <span className={cls}>{label}</span>;
};

const buildMapLinks = (
  coordenadas?: string | null,
  direccion?: string | null
) => {
  const c = (coordenadas || "").trim();
  const latLngRegex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

  if (c && latLngRegex.test(c)) {
    const [lat, lng] = c.split(",").map((s) => s.trim());
    return {
      gmaps: `https://www.google.com/maps?q=${lat},${lng}`,
      waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
      label: `${lat}, ${lng}`,
    };
  }

  const q = encodeURIComponent((direccion || "").trim());
  return q
    ? {
        gmaps: `https://www.google.com/maps?q=${q}`,
        waze: `https://waze.com/ul?q=${q}&navigate=yes`,
        label: direccion || "",
      }
    : null;
};

const getEstadoId = (c: Cliente): number => {
  if (typeof c.estado_id === "number") return c.estado_id;
  const d = (c.descripcion || "").toLowerCase();
  if (d === "activo") return 1;
  if (d === "inactivo") return 2;
  if (d === "suspendido") return 3;
  return 0;
};

const GestionClientes = () => {
  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;
  const anioActual = hoy.getFullYear();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([]);
  const [planes, setPlanes] = useState<PlanMap>({});
  const [modalCliente, setModalCliente] = useState<Cliente | null>(null);
  const [aniosCliente, setAniosCliente] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [searchTerm, setSearchTerm] = useState("");
  const [estadoFilters, setEstadoFilters] = useState<{ [k: number]: boolean }>(
    { 1: false, 2: false, 3: false }
  );

  // ✅ Cache de estados por cliente y año
  const [estadosCache, setEstadosCache] = useState<
    Record<number, Record<number, EstadoMensual[]>>
  >({});

  // ✅ Para deshabilitar botones mientras carga el año de un cliente
  const [loadingEstados, setLoadingEstados] = useState<Record<string, boolean>>(
    {}
  );

  // ====== Helpers sin "any" ======
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

  const toNumber = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  };

  const toStringSafe = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  };

  const toNullableString = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = toStringSafe(v).trim();
    return s === "" ? null : s;
  };

  const normalizarEstados = (payload: unknown): EstadoMensual[] => {
    if (!Array.isArray(payload)) return [];
    const out: EstadoMensual[] = [];

    for (const item of payload) {
      if (!isRecord(item)) continue;

      const mes = toNumber(item.mes);
      const anio = toNumber(item.anio);
      const estado = toStringSafe(item.estado);

      if (
        Number.isFinite(mes) &&
        Number.isFinite(anio) &&
        mes >= 1 &&
        mes <= 12 &&
        anio > 0
      ) {
        out.push({ mes, anio, estado });
      }
    }

    return out;
  };

  const normalizarClientes = (payload: unknown): Cliente[] => {
    if (!Array.isArray(payload)) return [];
    const out: Cliente[] = [];

    for (const item of payload) {
      if (!isRecord(item)) continue;

      const id = toNumber(item.id);
      const nombre = toStringSafe(item.nombre);
      const ip = toStringSafe(item.ip);
      const direccion = toStringSafe(item.direccion);
      const telefono = toStringSafe(item.telefono);
      const pass_onu = toStringSafe(item.pass_onu);
      const plan_id = toNumber(item.plan_id);

      if (!Number.isFinite(id) || !Number.isFinite(plan_id) || !nombre) continue;

      out.push({
        id,
        nombre,
        ip,
        direccion,
        telefono,
        vineta: toNullableString(item.vineta),
        pass_onu,
        coordenadas: toNullableString(item.coordenadas),
        plan_id,
        dia_pago: Number.isFinite(toNumber(item.dia_pago))
          ? toNumber(item.dia_pago)
          : null,
        estado_id: Number.isFinite(toNumber(item.estado_id))
          ? toNumber(item.estado_id)
          : undefined,
        fecha_instalacion: toNullableString(item.fecha_instalacion),
        descripcion: toStringSafe(item.descripcion) || toStringSafe(item.nombreEstado),
        estados: [],
        plan: isRecord(item.plan)
          ? {
              id: toNumber(item.plan.id),
              nombre: toStringSafe(item.plan.nombre),
              precio_mensual: toNumber(item.plan.precio_mensual),
            }
          : undefined,
      });
    }

    return out;
  };

  const cargarPlanes = async (): Promise<PlanMap> => {
    try {
      const resp = await fetch(`${apiHost}/api/planes`);
      if (!resp.ok) return {};
      const data = (await resp.json()) as unknown;
      if (!Array.isArray(data)) return {};

      const mapa: PlanMap = {};
      for (const p of data) {
        if (!isRecord(p)) continue;
        const id = toNumber(p.id);
        if (!Number.isFinite(id)) continue;
        mapa[id] = {
          id,
          nombre: toStringSafe(p.nombre),
          precio_mensual: toNumber(p.precio_mensual),
        };
      }

      setPlanes(mapa);
      return mapa;
    } catch {
      return {};
    }
  };

  const obtenerOInicializarEstados = async (
    clienteId: number,
    anio: number
  ): Promise<EstadoMensual[]> => {
    // Sólo se inicializan los meses cuando el backend confirma que no hay
    // ninguno. Si la petición falla no se toca nada: dar por hecho que el año
    // está vacío y mandar 12 POST de "Pendiente" es lo que borraba meses ya
    // pagados.
    try {
      const response = await fetch(
        `${apiHost}/api/estado-mensual/cliente/${clienteId}/anio/${anio}`
      );
      if (!response.ok) {
        console.error(
          `Error al obtener estados (HTTP ${response.status}); no se inicializan meses.`
        );
        return [];
      }
      const raw = (await response.json()) as unknown;
      const estados = normalizarEstados(raw);
      if (estados.length > 0) return estados;
    } catch (e) {
      console.error("Error al obtener estados; no se inicializan meses:", e);
      return [];
    }

    // ✅ Recomendado: NO crear históricos automáticamente
    if (anio < anioActual) return [];

    // Crear solo año actual si no existen
    const nuevosEstados = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const mes = i + 1;
        try {
          const res = await fetch(`${apiHost}/api/estado-mensual`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cliente_id: clienteId,
              mes,
              anio,
              estado: "Pendiente",
            }),
          });
          return res.ok
            ? ({ mes, anio, estado: "Pendiente" } as EstadoMensual)
            : null;
        } catch (e) {
          console.error("Error al crear estado:", e);
          return null;
        }
      })
    );

    return nuevosEstados.filter((x): x is EstadoMensual => x !== null);
  };

  const cargarEstadosAnio = async (clienteId: number, anio: number) => {
    // Si ya está cacheado (aunque sea vacío), no volver a pedir:
    // (nota: dejamos pedir si NO existe la llave; si existe con [], significa "consultado y no hay")
    if (estadosCache[clienteId] && Object.prototype.hasOwnProperty.call(estadosCache[clienteId], anio)) {
      return;
    }

    const key = `${clienteId}-${anio}`;
    setLoadingEstados((prev) => ({ ...prev, [key]: true }));

    try {
      const estados = await obtenerOInicializarEstados(clienteId, anio);
      setEstadosCache((prev) => ({
        ...prev,
        [clienteId]: {
          ...(prev[clienteId] || {}),
          [anio]: estados,
        },
      }));
    } finally {
      setLoadingEstados((prev) => ({ ...prev, [key]: false }));
    }
  };

  const cambiarAnio = async (clienteId: number, nuevoAnio: number) => {
    setAniosCliente((prev) => ({ ...prev, [clienteId]: nuevoAnio }));
    await cargarEstadosAnio(clienteId, nuevoAnio);
  };

  const fetchClientes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiHost}/api/clientes`);
      const raw = (await res.json()) as unknown;

      const clientesBase = normalizarClientes(raw);
      const year = anioActual;

      const clientesConEstados: Cliente[] = await Promise.all(
        clientesBase.map(async (cliente) => {
          try {
            const estados = await obtenerOInicializarEstados(cliente.id, year);

            // cachear año actual
            setEstadosCache((prev) => ({
              ...prev,
              [cliente.id]: {
                ...(prev[cliente.id] || {}),
                [year]: estados,
              },
            }));

            return { ...cliente, estados };
          } catch (e) {
            console.error(`Error con cliente ${cliente.id}:`, e);
            return { ...cliente, estados: [] };
          }
        })
      );

      setClientes(clientesConEstados);
      setClientesFiltrados(clientesConEstados);

      const faltaPlan = clientesConEstados.some(
        (c) => !c.plan || typeof c.plan.precio_mensual !== "number"
      );
      if (faltaPlan) await cargarPlanes();
    } catch (e) {
      console.error("Error al obtener clientes:", e);
      setError("No se pudo cargar la lista de clientes.");
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const base = { total: clientes.length, a: 0, i: 0, s: 0 };
    for (const c of clientes) {
      const id = getEstadoId(c);
      if (id === 1) base.a++;
      else if (id === 2) base.i++;
      else if (id === 3) base.s++;
    }
    return base;
  }, [clientes]);

  const filtradosMemo = useMemo(() => {
    let base = [...clientes];

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      base = base.filter((cliente) => {
        const nombre = cliente.nombre.toLowerCase();
        const tel = (cliente.telefono || "").toLowerCase();
        const vin = (cliente.vineta || "").toLowerCase();
        const dir = (cliente.direccion || "").toLowerCase();
        const est = (cliente.descripcion || "").toLowerCase();

        return (
          nombre.includes(term) ||
          tel.includes(term) ||
          vin.includes(term) ||
          dir.includes(term) ||
          est.includes(term)
        );
      });
    }

    const activos = Object.entries(estadoFilters)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));

    if (activos.length > 0) {
      base = base.filter((c) => activos.includes(getEstadoId(c)));
    }

    return base;
  }, [clientes, searchTerm, estadoFilters]);

  useEffect(() => {
    setClientesFiltrados(filtradosMemo);
    setCurrentPage(1);
  }, [filtradosMemo]);

  const handleSearch = (val: string) => setSearchTerm(val || "");

  const handleEliminar = async (id: number) => {
    const clienteAEliminar = clientes.find((cliente) => cliente.id === id);
    if (!clienteAEliminar) {
      await Swal.fire("Error", "No se encontró el cliente a eliminar", "error");
      return;
    }

    const result = await Swal.fire({
      title: "¿Estás seguro?",
      html: `Estás a punto de eliminar al cliente: <br><strong>${clienteAEliminar.nombre}</strong>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      focusCancel: true,
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${apiHost}/api/clientes/${id}`, {
          method: "DELETE",
        });

        if (!response.ok) throw new Error("Error en la respuesta del servidor");

        setClientes((prev) => prev.filter((cliente) => cliente.id !== id));
        setClientesFiltrados((prev) => prev.filter((cliente) => cliente.id !== id));

        await Swal.fire(
          "¡Eliminado!",
          `El cliente <strong>${clienteAEliminar.nombre}</strong> ha sido eliminado correctamente.`,
          "success"
        );
      } catch (e) {
        console.error("Error al eliminar cliente:", e);
        await Swal.fire(
          "Error",
          `No se pudo eliminar a ${clienteAEliminar.nombre}`,
          "error"
        );
      }
    }
  };

  const clientNames = clientes.map((cliente) => cliente.nombre);

  const indexOfLastClient = currentPage * itemsPerPage;
  const indexOfFirstClient = indexOfLastClient - itemsPerPage;
  const currentClients = clientesFiltrados.slice(indexOfFirstClient, indexOfLastClient);

  useEffect(() => {
    fetchClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Helpers para control de año =====
  const parseYear = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const d = new Date(iso);
    const y = d.getFullYear();
    return Number.isFinite(y) ? y : null;
  };

  const getMinYearCliente = (cliente: Cliente): number => {
    const yInst = parseYear(cliente.fecha_instalacion);
    if (yInst && yInst > 1900) return yInst;

    const yearsCached = estadosCache[cliente.id]
      ? Object.keys(estadosCache[cliente.id])
          .map((k) => Number(k))
          .filter(Number.isFinite)
      : [];
    if (yearsCached.length > 0) return Math.min(...yearsCached);

    return anioActual - 5;
  };

  const clampYear = (y: number, minY: number, maxY: number): number =>
    Math.max(minY, Math.min(maxY, y));

  const getEstadoColor = (estado?: string) => {
    if (estado === "Pagado") return "bg-green-100 text-green-700";
    if (estado === "Pagado Parcial") return "bg-yellow-100 text-yellow-700";
    if (estado === "Pendiente") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-600";
  };

  const isLoadingYear = (clienteId: number, anio: number): boolean =>
    !!loadingEstados[`${clienteId}-${anio}`];

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">
              Gestión de Clientes
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Consulta el estado de los clientes y gestiona sus pagos
            </p>
          </div>

          <Link
            href="/pages/admin/planes"
            className="inline-flex items-center justify-center px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm font-medium"
          >
            Planes de Internet
          </Link>

          <Link
            href="/pages/admin/clientes/registrar"
            className="inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nuevo Cliente
          </Link>
        </div>

        <div className="mb-4">
          <SearchDropdown
            items={clientNames}
            placeholder="Buscar por nombre, teléfono, viñeta, dirección o estado..."
            onSearch={handleSearch}
            className="w-full max-w-md"
          />
        </div>

        {/* Filtros por estado */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                checked={estadoFilters[1]}
                onChange={() =>
                  setEstadoFilters((prev) => ({ ...prev, 1: !prev[1] }))
                }
              />
              <span className="inline-flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                  Activos
                </span>
                <span className="text-slate-500 text-xs">({counts.a})</span>
              </span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                checked={estadoFilters[2]}
                onChange={() =>
                  setEstadoFilters((prev) => ({ ...prev, 2: !prev[2] }))
                }
              />
              <span className="inline-flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                  Inactivos
                </span>
                <span className="text-slate-500 text-xs">({counts.i})</span>
              </span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                checked={estadoFilters[3]}
                onChange={() =>
                  setEstadoFilters((prev) => ({ ...prev, 3: !prev[3] }))
                }
              />
              <span className="inline-flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                  Suspendidos
                </span>
                <span className="text-slate-500 text-xs">({counts.s})</span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => setEstadoFilters({ 1: false, 2: false, 3: false })}
              className="text-xs px-3 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
              title="Mostrar todos"
            >
              Ver todos
            </button>
          </div>

          <div className="text-sm text-slate-600">
            Mostrando <span className="font-semibold">{clientesFiltrados.length}</span>{" "}
            de <span className="font-semibold">{counts.total}</span> clientes
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-orange-200 p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
              <p className="text-slate-600 mt-4">Cargando clientes...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 text-lg mb-4">{error}</p>
              <button
                onClick={fetchClientes}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Reintentar
              </button>
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 text-lg mb-4">No hay clientes registrados.</p>
              <Link
                href="/pages/admin/clientes/registrar"
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Registrar primer cliente
              </Link>
            </div>
          ) : (
            <>
              {/* Vista móvil */}
              <div className="grid gap-4 md:hidden">
                {currentClients.map((cliente) => {
                  const anio = aniosCliente[cliente.id] || anioActual;
                  const maps = buildMapLinks(cliente.coordenadas, cliente.direccion);

                  const estadosDelAnio =
                    estadosCache[cliente.id]?.[anio] ??
                    cliente.estados?.filter((e) => e.anio === anio) ??
                    [];

                  const cargandoEsteAnio = isLoadingYear(cliente.id, anio);

                  return (
                    <div
                      key={cliente.id}
                      className="rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-orange-700 truncate">
                            {cliente.nombre}
                          </h3>
                          <p className="text-sm text-slate-600">{cliente.telefono}</p>
                          <p className="text-sm text-slate-600">
                            {cliente.vineta ? `Viñeta: ${cliente.vineta}` : "Viñeta: —"}
                          </p>
                          <p className="text-sm text-slate-500 break-words mt-1">
                            {cliente.direccion}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {badgeEstado(cliente.descripcion, cliente.estado_id)}
                        </div>
                      </div>

                      {maps && (
                        <div className="mb-3">
                          <a
                            href={maps.gmaps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-xs text-blue-600 hover:text-blue-700"
                          >
                            📍 Ver en Google Maps
                          </a>
                        </div>
                      )}

                      <div className="mb-4">
                        {/* Controles de año */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-slate-600">
                            Año: {anio}
                          </span>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const minY = getMinYearCliente(cliente);
                                const next = clampYear(anio - 1, minY, anioActual);
                                cambiarAnio(cliente.id, next);
                              }}
                              className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-60"
                              disabled={
                                cargandoEsteAnio || anio <= getMinYearCliente(cliente)
                              }
                              title="Ver año anterior"
                            >
                              ← Anterior
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const minY = getMinYearCliente(cliente);
                                const next = clampYear(anio + 1, minY, anioActual);
                                cambiarAnio(cliente.id, next);
                              }}
                              className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-60"
                              disabled={cargandoEsteAnio || anio >= anioActual}
                              title="Ver año siguiente"
                            >
                              Siguiente →
                            </button>
                          </div>
                        </div>

                        {cargandoEsteAnio ? (
                          <div className="py-3 text-center text-sm text-slate-500">
                            Cargando estados...
                          </div>
                        ) : estadosDelAnio.length === 0 ? (
                          <div className="py-2 text-center text-xs text-slate-500">
                            Sin estados registrados para {anio}.
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              "Ene",
                              "Feb",
                              "Mar",
                              "Abr",
                              "May",
                              "Jun",
                              "Jul",
                              "Ago",
                              "Sep",
                              "Oct",
                              "Nov",
                              "Dic",
                            ].map((mes, index) => {
                              const estado = estadosDelAnio.find(
                                (e) => e.mes === index + 1
                              );
                              const color = getEstadoColor(estado?.estado);

                              return (
                                <div
                                  key={index}
                                  className={`p-2 rounded text-center ${color}`}
                                  title={estado?.estado || "Sin estado"}
                                >
                                  <div className="text-xs font-semibold">{mes}</div>
                                  <div className="text-[10px] mt-1">
                                    {estado?.estado?.charAt(0) || "-"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setModalCliente(cliente)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium"
                        >
                          Ver detalles
                        </button>
                        <button
                          onClick={() => handleEliminar(cliente.id)}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vista desktop */}
              <div className="hidden md:block">
                <div className="overflow-x-auto rounded-lg">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-orange-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">ID</th>
                        <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                        <th className="px-4 py-3 text-left font-semibold">Teléfono</th>
                        <th className="px-4 py-3 text-left font-semibold">Viñeta</th>
                        <th className="px-4 py-3 text-left font-semibold">Dirección</th>
                        <th className="px-4 py-3 text-left font-semibold">Ubicación</th>
                        <th className="px-4 py-3 text-left font-semibold">Estado</th>
                        <th className="px-4 py-3 text-left font-semibold">Estados de Pago</th>
                        <th className="px-4 py-3 text-left font-semibold">Acciones</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {currentClients.map((cliente) => {
                        const anio = aniosCliente[cliente.id] || anioActual;
                        const maps = buildMapLinks(cliente.coordenadas, cliente.direccion);

                        const estadosDelAnio =
                          estadosCache[cliente.id]?.[anio] ??
                          cliente.estados?.filter((e) => e.anio === anio) ??
                          [];

                        const cargandoEsteAnio = isLoadingYear(cliente.id, anio);

                        return (
                          <tr key={cliente.id} className="hover:bg-orange-50">
                            <td className="px-4 py-3 font-medium">{cliente.id}</td>
                            <td className="px-4 py-3 font-medium text-orange-700">
                              {cliente.nombre}
                            </td>
                            <td className="px-4 py-3">{cliente.telefono}</td>
                            <td className="px-4 py-3">{cliente.vineta ?? "—"}</td>
                            <td className="px-4 py-3 break-words max-w-xs">
                              {cliente.direccion}
                            </td>
                            <td className="px-4 py-3">
                              {maps ? (
                                <a
                                  href={maps.gmaps}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-700 text-xs"
                                >
                                  Ver ubicación
                                </a>
                              ) : (
                                <span className="text-slate-400 text-xs">Sin ubicación</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {badgeEstado(cliente.descripcion, cliente.estado_id)}
                            </td>

                            <td className="px-4 py-3">
                              {/* Controles de año */}
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-slate-600">
                                  Año: {anio}
                                </span>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const minY = getMinYearCliente(cliente);
                                      const next = clampYear(anio - 1, minY, anioActual);
                                      cambiarAnio(cliente.id, next);
                                    }}
                                    className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-60"
                                    disabled={
                                      cargandoEsteAnio || anio <= getMinYearCliente(cliente)
                                    }
                                    title="Ver año anterior"
                                  >
                                    ← Anterior
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const minY = getMinYearCliente(cliente);
                                      const next = clampYear(anio + 1, minY, anioActual);
                                      cambiarAnio(cliente.id, next);
                                    }}
                                    className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-60"
                                    disabled={cargandoEsteAnio || anio >= anioActual}
                                    title="Ver año siguiente"
                                  >
                                    Siguiente →
                                  </button>
                                </div>
                              </div>

                              {cargandoEsteAnio ? (
                                <div className="py-2 text-sm text-slate-500">
                                  Cargando estados...
                                </div>
                              ) : estadosDelAnio.length === 0 ? (
                                <div className="py-2 text-xs text-slate-500">
                                  Sin estados registrados para {anio}.
                                </div>
                              ) : (
                                <div className="grid grid-cols-6 gap-1">
                                  {["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map(
                                    (mes, index) => {
                                      const estado = estadosDelAnio.find(
                                        (e) => e.mes === index + 1
                                      );
                                      const color = getEstadoColor(estado?.estado);

                                      return (
                                        <div
                                          key={index}
                                          className={`p-1 rounded text-center text-xs ${color}`}
                                          title={`${mesLargo[index]}: ${estado?.estado || "Sin estado"}`}
                                        >
                                          {mes}
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setModalCliente(cliente)}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                                >
                                  Ver
                                </button>
                                <button
                                  onClick={() => handleEliminar(cliente.id)}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {clientesFiltrados.length > itemsPerPage && (
                <div className="mt-8">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={clientesFiltrados.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(page) => setCurrentPage(page)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modalCliente && (
        <ClienteModal
          cliente={modalCliente}
          onClose={() => setModalCliente(null)}
          onClienteUpdated={() => {
            setModalCliente(null);
            fetchClientes();
          }}
          apiHost={apiHost}
        />
      )}
    </AdminLayout>
  );
};

export default GestionClientes;
