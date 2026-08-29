"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SearchDropdown from "@/app/components/searchBar";
import CajeroLayout from "@/app/components/cajeroLayout";
import {
    esMesConDeuda,
    getEstadoColor,
    etiquetaEstado,
} from "@/app/lib/estadoMensual";

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
    pass_onu: string;
    coordenadas: string;
    plan_id: number;
    dia_pago: number;
    estado_id?: number;
    fecha_instalacion: string;
    descripcion?: EstadoNombre;
    estados: EstadoMensual[];
    plan?: Plan; // opcional, si viene poblado desde el API
}

interface ClienteIndex {
    id: number;
    nombre: string;
    telefono?: string;
    direccion?: string;
}

// Formateo de moneda
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

const buildMapLinks = (coordenadas?: string, direccion?: string) => {
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

    const q = encodeURIComponent(direccion || "");
    return q
        ? {
            gmaps: `https://www.google.com/maps?q=${q}`,
            waze: `https://waze.com/ul?q=${q}&navigate=yes`,
            label: direccion,
        }
        : null;
};

// Helper para mapear estado_id/descripcion a ID numérico
const getEstadoId = (c: Cliente): number => {
    if (typeof c.estado_id === "number") return c.estado_id;
    const d = (c.descripcion || "").toLowerCase();
    if (d === "activo") return 1;
    if (d === "inactivo") return 2;
    if (d === "suspendido") return 3;
    return 0; // desconocido
};

/** Devuelve los meses (1-12) adeudados del año dado hasta el mes indicado (inclusive) */
const obtenerMesesAdeudados = (
    cliente: Cliente,
    anio: number,
    mesLimite: number
): number[] => {
    const meses: number[] = [];
    for (let m = 1; m <= mesLimite; m++) {
        const estado = cliente.estados?.find(
            (e) => e.mes === m && e.anio === anio
        )?.estado;
        // Cuenta "Pendiente", "Pagado Parcial" y "Sin estado". Quedan fuera
        // "Suspendido" y "Sin servicio": en esos meses no hay nada que cobrar.
        if (esMesConDeuda(estado)) {
            meses.push(m);
        }
    }
    return meses;
};

const GestionClientes = () => {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();

    const [clientesIndex, setClientesIndex] = useState<ClienteIndex[]>([]);
    const [planes, setPlanes] = useState<PlanMap>({});
    const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

    const [anioVista, setAnioVista] = useState(anioActual);

    const [searchTerm, setSearchTerm] = useState("");
    const [loadingIndex, setLoadingIndex] = useState(true);
    const [loadingCliente, setLoadingCliente] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Carga de planes (para precio_mensual)
    const cargarPlanes = async (): Promise<PlanMap> => {
        try {
            const resp = await fetch(`${apiHost}/api/planes`);
            if (!resp.ok) return {};
            const data: Plan[] = await resp.json();
            const mapa: PlanMap = {};
            data.forEach((p) => {
                mapa[p.id] = p;
            });
            setPlanes(mapa);
            return mapa;
        } catch {
            return {};
        }
    };

    // Obtener o inicializar estados de un cliente para un año
    const obtenerOInicializarEstados = async (
        clienteId: number,
        anio: number
    ): Promise<EstadoMensual[]> => {
        // Sólo se inicializan los meses cuando el backend confirma que no hay
        // ninguno. Si la petición falla no se toca nada: dar por hecho que el
        // año está vacío y mandar 12 POST de "Pendiente" es lo que borraba
        // meses ya pagados.
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
            const estados = await response.json();
            if (Array.isArray(estados) && estados.length > 0) return estados;
        } catch (error) {
            console.error("Error al obtener estados; no se inicializan meses:", error);
            return [];
        }

        // Inicializa 12 meses si no existen
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
                    return res.ok ? { mes, anio, estado: "Pendiente" } : null;
                } catch (error) {
                    console.error("Error al crear estado:", error);
                    return null;
                }
            })
        );

        return nuevosEstados.filter(Boolean) as EstadoMensual[];
    };

    // Cargar índice de clientes (solo id + nombre) para el buscador
    const fetchClientesIndex = async () => {
        setLoadingIndex(true);
        setError(null);
        try {
            const res = await fetch(`${apiHost}/api/clientes`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Respuesta inesperada del servidor");

            const index: ClienteIndex[] = data.map((c) => ({
                id: c.id,
                nombre: c.nombre,
                telefono: c.telefono,
                direccion: c.direccion,
            }));

            setClientesIndex(index);
        } catch (err) {
            console.error("Error al obtener índice de clientes:", err);
            setError("No se pudo cargar la lista de clientes para búsqueda.");
        } finally {
            setLoadingIndex(false);
        }
    };

    // Buscar cliente por ID usando el endpoint /api/clientes/:id
    const fetchClienteById = async (id: number, anio: number) => {
        setLoadingCliente(true);
        setError(null);
        try {
            const res = await fetch(`${apiHost}/api/clientes/${id}`);
            if (!res.ok) {
                throw new Error("Cliente no encontrado");
            }
            const data: Cliente = await res.json();

            const estados = await obtenerOInicializarEstados(id, anio);

            const plan = planes[data.plan_id];

            setClienteSeleccionado({
                ...data,
                estados,
                plan,
            });
        } catch (err) {
            console.error("Error al obtener cliente:", err);
            setClienteSeleccionado(null);
            setError("No se pudo cargar el cliente. Verifica el dato ingresado.");
        } finally {
            setLoadingCliente(false);
        }
    };

    // Manejo de búsqueda desde SearchDropdown
    const handleSearch = (val: string) => {
        const term = (val || "").trim();
        setSearchTerm(term);
        setError(null);
        setClienteSeleccionado(null);

        if (!term) return;

        let id: number | null = null;

        // Si el término es numérico -> lo interpretamos como ID
        if (/^\d+$/.test(term)) {
            id = Number(term);
        } else {
            // Si es texto -> buscamos coincidencia exacta por nombre en el índice
            const found = clientesIndex.find(
                (c) => c.nombre.toLowerCase() === term.toLowerCase()
            );
            if (found) {
                id = found.id;
            }
        }

        if (id === null) {
            setError("No se encontró un cliente con ese nombre o ID.");
            return;
        }

        fetchClienteById(id, anioVista);
    };

    // Cambiar de año de vista y recargar estados del cliente
    const cambiarAnio = async (delta: number) => {
        if (!clienteSeleccionado) return;
        const nuevoAnio = anioVista + delta;
        setAnioVista(nuevoAnio);
        await fetchClienteById(clienteSeleccionado.id, nuevoAnio);
    };

    // Cálculo de adeudo (solo para clientes suspendidos)
    const resumenAdeudo = useMemo(() => {
        if (!clienteSeleccionado) return { meses: [] as number[], total: 0 };

        const esSuspendido = getEstadoId(clienteSeleccionado) === 3;
        if (!esSuspendido) return { meses: [], total: 0 };

        const precio =
            clienteSeleccionado.plan?.precio_mensual ??
            planes[clienteSeleccionado.plan_id]?.precio_mensual ??
            0;

        const mesLimite = anioVista === anioActual ? mesActual : 12;
        const mesesAdeudados = obtenerMesesAdeudados(
            clienteSeleccionado,
            anioVista,
            mesLimite
        );
        const total = precio * mesesAdeudados.length;

        return { meses: mesesAdeudados, total };
    }, [clienteSeleccionado, planes, anioVista, anioActual, mesActual]);

    useEffect(() => {
        cargarPlanes();
        fetchClientesIndex();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clientNames = clientesIndex.map((c) => c.nombre);

    return (
        <CajeroLayout>
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/pages/cajero"
                                className="inline-flex items-center px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-sm"
                            >
                                ← Volver a Menu Principal
                            </Link>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">
                            Consulta de Estado de Cliente
                        </h1>
                        <p className="text-sm text-slate-600 mt-2">
                            Busca un cliente por nombre o ID y visualiza su información y estados de pago.
                        </p>
                    </div>
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

                {/* Barra de búsqueda */}
                <div className="mb-6">
                    <SearchDropdown
                        items={clientNames}
                        placeholder="Escribe el ID o selecciona un cliente por nombre..."
                        onSearch={handleSearch}
                        className="w-full max-w-xl"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                        🔍 Si escribes solo números, se buscará por <strong>ID</strong>. Si escribes texto, se buscará por <strong>nombre exacto</strong>.
                    </p>
                </div>

                {/* Mensajes de estado */}
                {loadingIndex && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center mb-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto"></div>
                        <p className="mt-3 text-slate-600 text-sm">
                            Cargando índice de clientes para búsqueda...
                        </p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}

                {/* Contenedor principal */}
                <div className="bg-white rounded-2xl shadow-lg border border-orange-200 p-6">
                    {loadingCliente ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
                            <p className="text-slate-600 mt-4">Buscando cliente...</p>
                        </div>
                    ) : !clienteSeleccionado ? (
                        <div className="text-center py-10 text-slate-600 text-sm">
                            {searchTerm
                                ? "Ingresa un ID válido o selecciona un nombre exacto de la lista para ver los detalles del cliente."
                                : "Usa la barra de búsqueda superior para seleccionar un cliente y ver su información completa."}
                        </div>
                    ) : (
                        <>
                            {/* Información general del cliente */}
                            <div className="flex flex-col lg:flex-row gap-6">
                                <div className="flex-1 space-y-2">
                                    <h2 className="text-xl font-semibold text-orange-700">
                                        {clienteSeleccionado.nombre}
                                    </h2>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">ID:</span> {clienteSeleccionado.id}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">Teléfono:</span>{" "}
                                        {clienteSeleccionado.telefono || "Sin especificar"}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">Dirección:</span>{" "}
                                        {clienteSeleccionado.direccion || "Sin especificar"}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">IP:</span>{" "}
                                        {clienteSeleccionado.ip || "Sin especificar"}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">Contraseña ONU:</span>{" "}
                                        {clienteSeleccionado.pass_onu || "Sin especificar"}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">Fecha instalación:</span>{" "}
                                        {clienteSeleccionado.fecha_instalacion
                                            ? new Date(clienteSeleccionado.fecha_instalacion).toLocaleDateString(
                                                "es-HN"
                                            )
                                            : "Sin especificar"}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="font-medium">Día de pago:</span>{" "}
                                        {clienteSeleccionado.dia_pago || "Sin especificar"}
                                    </p>

                                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                                        <div>
                                            <span className="text-xs uppercase text-slate-500">Estado</span>
                                            <div className="mt-1">
                                                {badgeEstado(
                                                    clienteSeleccionado.descripcion,
                                                    clienteSeleccionado.estado_id
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <span className="text-xs uppercase text-slate-500">Plan</span>
                                            <div className="mt-1 text-sm text-slate-700">
                                                {clienteSeleccionado.plan
                                                    ? `${clienteSeleccionado.plan.nombre} · ${HNL.format(
                                                        clienteSeleccionado.plan.precio_mensual
                                                    )}/mes`
                                                    : planes[clienteSeleccionado.plan_id]
                                                        ? `${planes[clienteSeleccionado.plan_id].nombre} · ${HNL.format(
                                                            planes[clienteSeleccionado.plan_id].precio_mensual
                                                        )}/mes`
                                                        : "Plan no disponible"}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Links de mapa */}
                                    {buildMapLinks(
                                        clienteSeleccionado.coordenadas,
                                        clienteSeleccionado.direccion
                                    ) && (
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <span className="text-xs uppercase text-slate-500">
                                                    Ubicación aproximada
                                                </span>
                                                {(() => {
                                                    const maps = buildMapLinks(
                                                        clienteSeleccionado.coordenadas,
                                                        clienteSeleccionado.direccion
                                                    )!;
                                                    return (
                                                        <>
                                                            <a
                                                                href={maps.gmaps}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-700"
                                                            >
                                                                📍 Google Maps
                                                            </a>
                                                            <a
                                                                href={maps.waze}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center text-xs text-purple-600 hover:text-purple-700"
                                                            >
                                                                🚗 Waze
                                                            </a>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                </div>

                                {/* Resumen de adeudo si está suspendido */}
                                <div className="w-full lg:w-72 bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
                                    <h3 className="text-sm font-semibold text-orange-700">
                                        Resumen de adeudos
                                    </h3>
                                    <p className="text-xs text-slate-600">
                                        Año seleccionado:{" "}
                                        <span className="font-semibold">{anioVista}</span>
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => cambiarAnio(-1)}
                                            className="flex-1 px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50"
                                        >
                                            ← Año anterior
                                        </button>
                                        <button
                                            onClick={() => cambiarAnio(1)}
                                            className="flex-1 px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50"
                                        >
                                            Año siguiente →
                                        </button>
                                    </div>

                                    {getEstadoId(clienteSeleccionado) !== 3 ? (
                                        <p className="text-xs text-slate-600">
                                            El cliente <strong>no está suspendido</strong>, por lo que no se
                                            calcula adeudo aquí.
                                        </p>
                                    ) : (
                                        <>
                                            <div className="text-sm">
                                                Monto estimado adeudado al{" "}
                                                <strong>
                                                    {anioVista === anioActual
                                                        ? mesLargo[mesActual - 1]
                                                        : "fin de año"}
                                                </strong>
                                                :
                                                <div className="mt-1 text-lg font-bold text-orange-700">
                                                    {HNL.format(resumenAdeudo.total)}
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                Se consideran adeudados los meses del año seleccionado que{" "}
                                                <span className="font-semibold">no están en “Pagado”</span>.
                                            </div>
                                            {resumenAdeudo.meses.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {resumenAdeudo.meses.map((m) => (
                                                        <span
                                                            key={`chip-${clienteSeleccionado.id}-${m}`}
                                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200"
                                                            title={`${mesLargo[m - 1]} ${anioVista} pendiente`}
                                                        >
                                                            {mesCorto[m - 1]}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Estados mensuales del año seleccionado */}
                            <div className="mt-8">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                                    Estados de pago · Año {anioVista}
                                </h3>

                                {clienteSeleccionado.estados?.length ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
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
                                            const estado = clienteSeleccionado.estados?.find(
                                                (e) => e.mes === index + 1 && e.anio === anioVista
                                            );
                                            return (
                                                <div
                                                    key={index}
                                                    className={`p-3 rounded-lg text-center ${getEstadoColor(
                                                        estado?.estado
                                                    )}`}
                                                    title={etiquetaEstado(estado?.estado)}
                                                >
                                                    <div className="text-xs font-semibold">{mes}</div>
                                                    <div className="text-[11px] mt-1">
                                                        {etiquetaEstado(estado?.estado)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500">
                                        No hay estados registrados para este cliente en el año seleccionado.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </CajeroLayout>
    );
};

export default GestionClientes;
