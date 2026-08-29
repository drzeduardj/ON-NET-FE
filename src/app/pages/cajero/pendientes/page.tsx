"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Pagination from "@/app/components/pagination";
import SearchDropdown from "@/app/components/searchBar";
import CajeroLayout from "@/app/components/cajeroLayout";
import { esMesConDeuda } from "@/app/lib/estadoMensual";

const apiHost = process.env.NEXT_PUBLIC_API_HOST as string;

interface EstadoMensual {
    mes: number;
    anio: number;
    estado: string;
}

interface Plan {
    id: number;
    nombre: string;
    precio_mensual: number;
}

interface Cliente {
    id: number;
    nombre: string;
    ip: string;
    direccion: string;
    telefono: string;
    plan_id: number;
    plan?: Plan;
    dia_pago: number;
    estado_id?: number;
    descripcion?: string;
    estados: EstadoMensual[];
    fecha_instalacion?: string;
}

type PlanMap = Record<number, Plan>;

const HNL = new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    maximumFractionDigits: 2,
});

const mesCorto = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const mesLargo = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const cajaHref = (c: Cliente) => `/pages/cajero/pago?clienteId=${encodeURIComponent(c.id)}`;

const obtenerMesesAdeudados = (
    cliente: Cliente,
    anioActual: number,
    mesActual: number,
    hoy: Date
): number[] => {
    let ultimoMes = mesActual;
    const diaCorte = Number.isFinite(cliente.dia_pago) ? cliente.dia_pago : 1;
    const esMismoMes = (hoy.getMonth() + 1) === mesActual;
    if (esMismoMes && hoy.getDate() < diaCorte) {
        ultimoMes = mesActual - 1;
    }

    let primerMes = 1;
    if (cliente.fecha_instalacion) {
        const fi = new Date(cliente.fecha_instalacion);
        const anioInst = fi.getFullYear();
        const mesInst = fi.getMonth() + 1;
        if (anioInst > anioActual) return [];
        if (anioInst === anioActual) primerMes = Math.max(1, mesInst);
    }

    if (ultimoMes < primerMes) return [];

    const meses: number[] = [];
    for (let m = primerMes; m <= ultimoMes; m++) {
        const estado = cliente.estados?.find(e => e.mes === m && e.anio === anioActual)?.estado;
        // Quedan fuera "Suspendido" y "Sin servicio": nada que cobrar ahí.
        if (esMesConDeuda(estado)) {
            meses.push(m);
        }
    }
    return meses;
};

const PendientesCajero = () => {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [planes, setPlanes] = useState<PlanMap>({});
    const [clientesPendientes, setClientesPendientes] = useState<Cliente[]>([]);
    const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [filtroDiaPago, setFiltroDiaPago] = useState<number | 'todos'>('todos');
    const itemsPerPage = 10;

    const cargarPlanesSiHaceFalta = async (lista: Cliente[]) => {
        const faltaPlan = lista.some(c => !c.plan || typeof c.plan.precio_mensual !== "number");
        if (!faltaPlan) return {};

        try {
            const resp = await fetch(`${apiHost}/api/planes`);
            if (!resp.ok) return {};
            const data: Plan[] = await resp.json();
            const mapa: PlanMap = {};
            data.forEach(p => { mapa[p.id] = p; });
            setPlanes(mapa);
            return mapa;
        } catch {
            return {};
        }
    };

    const fetchClientes = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiHost}/api/clientes`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Respuesta inesperada del servidor");

            const year = anioActual;
            const clientesConEstados: Cliente[] = await Promise.all(
                data.map(async (cliente: Cliente) => {
                    try {
                        const response = await fetch(`${apiHost}/api/estado-mensual/cliente/${cliente.id}/anio/${year}`);
                        if (response.ok) {
                            const estados = await response.json();
                            return { ...cliente, estados: Array.isArray(estados) ? estados : [] };
                        }
                        return { ...cliente, estados: [] };
                    } catch {
                        return { ...cliente, estados: [] };
                    }
                })
            );

            setClientes(clientesConEstados);
            const mapaPlanes = await cargarPlanesSiHaceFalta(clientesConEstados);

            const pendientes = clientesConEstados.filter(c => {
                const planPrecio = c.plan?.precio_mensual ?? mapaPlanes[c.plan_id]?.precio_mensual ?? 0;
                const mesesAdeudados = obtenerMesesAdeudados(c, anioActual, mesActual, hoy);
                return planPrecio > 0 && mesesAdeudados.length > 0;
            });

            setClientesPendientes(pendientes);
            aplicarFiltros(pendientes, filtroDiaPago);
        } catch (err) {
            console.error(err);
            setError("No se pudo cargar la lista de clientes.");
        } finally {
            setLoading(false);
        }
    };

    const aplicarFiltros = (lista: Cliente[], diaPagoFiltro: number | 'todos') => {
        let filtered = [...lista];
        if (diaPagoFiltro !== 'todos') {
            filtered = filtered.filter(cliente => cliente.dia_pago === diaPagoFiltro);
        }
        setClientesFiltrados(filtered);
        setCurrentPage(1);
    };

    const handleSearch = (searchTerm: string) => {
        if (!searchTerm.trim()) {
            aplicarFiltros(clientesPendientes, filtroDiaPago);
            return;
        }
        const term = searchTerm.toLowerCase().trim();
        const filtered = clientesPendientes.filter(cliente =>
            cliente.nombre.toLowerCase().includes(term) ||
            cliente.telefono.includes(term) ||
            cliente.direccion.toLowerCase().includes(term)
        );
        aplicarFiltros(filtered, filtroDiaPago);
    };

    const handleFiltroDiaPago = (diaPago: number | 'todos') => {
        setFiltroDiaPago(diaPago);
        aplicarFiltros(clientesPendientes, diaPago);
    };

    const clientNames = clientesPendientes.map(cliente => cliente.nombre);
    const indexOfLastClient = currentPage * itemsPerPage;
    const indexOfFirstClient = indexOfLastClient - itemsPerPage;
    const currentClients = clientesFiltrados.slice(indexOfFirstClient, indexOfLastClient);

    const handlePageChange = (page: number) => setCurrentPage(page);

    useEffect(() => {
        fetchClientes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <CajeroLayout>
            {/* Contenedor principal responsive */}
            <div className="w-full min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
                <div className="max-w-7xl mx-auto">

                    {/* Header responsive */}
                    <div className="mb-6 sm:mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap gap-2">
                                <Link
                                    href="/pages/cajero"
                                    className="inline-flex items-center px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-sm"
                                >
                                    ← Volver a Menu Principal
                                </Link>
                            </div>
                            <div className="flex-1">
                                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-600 break-words">
                                    Clientes Pendientes de Pago
                                </h1>
                                <p className="text-xs sm:text-sm text-slate-600 mt-1 sm:mt-2 max-w-3xl">
                                    Lista de clientes con pagos pendientes del mes actual (muestra el monto adeudado a la fecha)
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Búsqueda y filtros responsive */}
                    <div className="flex flex-col gap-3 sm:gap-4 mb-6 sm:mb-8">
                        <div className="w-full">
                            <SearchDropdown
                                items={clientNames}
                                placeholder="Buscar clientes pendientes..."
                                onSearch={handleSearch}
                                className="w-full max-w-full sm:max-w-md"
                            />
                        </div>

                        {/* Filtros de día de pago */}
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => handleFiltroDiaPago('todos')}
                                className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none text-center min-w-[70px] ${filtroDiaPago === 'todos'
                                        ? 'bg-orange-600 text-white'
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                    }`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => handleFiltroDiaPago(15)}
                                className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none text-center min-w-[70px] ${filtroDiaPago === 15
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                    }`}
                            >
                                Día 15
                            </button>
                            <button
                                onClick={() => handleFiltroDiaPago(30)}
                                className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none text-center min-w-[70px] ${filtroDiaPago === 30
                                        ? 'bg-green-600 text-white'
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                    }`}
                            >
                                Día 30
                            </button>
                        </div>
                    </div>

                    {/* Información responsive */}
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-blue-700 text-xs sm:text-sm leading-relaxed">
                            Se considera adeudado todo mes del año actual hasta {mesLargo[mesActual - 1]} que no esté en estado <b>Pagado</b>.
                            El monto mostrado = meses adeudados × precio mensual del plan.
                        </p>
                    </div>

                    {/* Contenido principal */}
                    <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-orange-200 p-3 sm:p-4 md:p-6">
                        {loading ? (
                            <div className="text-center py-8 sm:py-12">
                                <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-orange-600 mx-auto"></div>
                                <p className="text-slate-600 mt-3 sm:mt-4 text-sm sm:text-base">Cargando clientes pendientes...</p>
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 sm:py-12">
                                <p className="text-red-600 text-base sm:text-lg mb-3 sm:mb-4">{error}</p>
                                <button
                                    onClick={fetchClientes}
                                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm sm:text-base"
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : clientesPendientes.length === 0 ? (
                            <div className="text-center py-8 sm:py-12">
                                <p className="text-green-600 text-base sm:text-lg mb-3 sm:mb-4">¡Excelente! No hay clientes pendientes de pago.</p>
                                <p className="text-slate-600 text-sm sm:text-base">Todos los clientes están al día.</p>
                            </div>
                        ) : (
                            <>
                                {clientesFiltrados.length === 0 && (
                                    <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-50 rounded-lg">
                                        <p className="text-slate-600 text-center text-sm sm:text-base">
                                            {filtroDiaPago === 'todos'
                                                ? "No se encontraron clientes pendientes que coincidan con la búsqueda."
                                                : `No hay clientes pendientes con día de pago ${filtroDiaPago}.`}
                                        </p>
                                    </div>
                                )}

                                {/* Resumen responsive */}
                                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <p className="text-orange-700 text-xs sm:text-sm">
                                        Total de clientes pendientes: <strong>{clientesPendientes.length}</strong>
                                        {filtroDiaPago !== 'todos' && (
                                            <> | Día {filtroDiaPago}: <strong>{
                                                clientesPendientes.filter(c => c.dia_pago === filtroDiaPago).length
                                            }</strong></>
                                        )}
                                        {clientesFiltrados.length !== clientesPendientes.length && (
                                            <> | Mostrando: <strong>{clientesFiltrados.length}</strong></>
                                        )}
                                    </p>
                                </div>

                                {/* ===== Vista móvil (cards) - Siempre visible en móvil ===== */}
                                <div className="block md:hidden">
                                    <div className="grid gap-3">
                                        {currentClients.map((cliente) => {
                                            const planPrecio = cliente.plan?.precio_mensual
                                                ?? planes[cliente.plan_id]?.precio_mensual
                                                ?? 0;

                                            const mesesAdeudados = obtenerMesesAdeudados(cliente, anioActual, mesActual, hoy);
                                            const montoAdeudado = planPrecio * mesesAdeudados.length;

                                            return (
                                                <div
                                                    key={`m-${cliente.id}`}
                                                    className="rounded-xl border border-orange-200 bg-white p-3 sm:p-4 shadow-sm"
                                                >
                                                    <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2">
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="text-sm sm:text-base font-semibold text-orange-700 truncate">
                                                                {cliente.nombre}
                                                            </h3>
                                                            <p className="text-xs text-slate-500 break-words mt-1">
                                                                {cliente.direccion}
                                                            </p>
                                                        </div>

                                                        {/* Estado servicio */}
                                                        <span
                                                            className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${cliente.descripcion === "Activo" || cliente.estado_id === 1
                                                                    ? "bg-green-100 text-green-700"
                                                                    : cliente.descripcion === "Suspendido" || cliente.estado_id === 3
                                                                        ? "bg-yellow-100 text-yellow-700"
                                                                        : "bg-red-100 text-red-700"
                                                                }`}
                                                            title="Estado del servicio"
                                                        >
                                                            {cliente.descripcion ||
                                                                (cliente.estado_id === 1
                                                                    ? "Activo"
                                                                    : cliente.estado_id === 2
                                                                        ? "Inactivo"
                                                                        : "Suspendido")}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm mb-3">
                                                        <div>
                                                            <p className="text-xs text-slate-500">Teléfono</p>
                                                            <p className="font-medium">{cliente.telefono || "—"}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-slate-500">Día de pago</p>
                                                            <span
                                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${cliente.dia_pago === 15
                                                                        ? "bg-blue-100 text-blue-700"
                                                                        : "bg-green-100 text-green-700"
                                                                    }`}
                                                            >
                                                                {cliente.dia_pago}
                                                            </span>
                                                        </div>

                                                        <div>
                                                            <p className="text-xs text-slate-500">Plan</p>
                                                            <p className="font-medium">
                                                                {cliente.plan?.nombre ?? planes[cliente.plan_id]?.nombre ?? "—"}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                {planPrecio > 0 ? `${HNL.format(planPrecio)}/mes` : "sin precio"}
                                                            </p>
                                                        </div>

                                                        <div className="text-right">
                                                            <p className="text-xs text-slate-500">Monto</p>
                                                            <p className="text-sm sm:text-base font-bold">{HNL.format(montoAdeudado)}</p>
                                                            <p className="text-[10px] sm:text-[11px] text-slate-500">{mesesAdeudados.length} mes(es)</p>
                                                        </div>
                                                    </div>

                                                    {/* Meses pendientes chips */}
                                                    <div className="mb-3">
                                                        <p className="text-xs text-slate-500 mb-1">Meses pendientes</p>
                                                        {mesesAdeudados.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {mesesAdeudados.map((m) => (
                                                                    <span
                                                                        key={`chip-${cliente.id}-${m}`}
                                                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200"
                                                                        title={`${mesLargo[m - 1]} ${anioActual} pendiente`}
                                                                    >
                                                                        {mesCorto[m - 1]}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <Link
                                                            href={cajaHref(cliente)}
                                                            className="inline-flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium
                                 bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none
                                 focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4"
                                                                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                    d="M12 8c-1.657 0-3 1.343-3 3m6 0a3 3 0 00-3-3m-7 8a4 4 0 014-4h6a4 4 0 014 4v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-1z" />
                                                            </svg>
                                                            Realizar pago
                                                        </Link>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ===== Vista tablet/desktop (tabla) ===== */}
                                <div className="hidden md:block overflow-hidden">
                                    <div className="overflow-x-auto rounded-lg">
                                        <table className="w-full min-w-[980px] text-sm border-collapse">
                                            <thead className="bg-orange-100">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">ID</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Nombre</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Teléfono</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Dirección</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Plan</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Meses Pendientes</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Monto</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Día Pago</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Estado Servicio</th>
                                                    <th className="px-4 py-3 text-left font-semibold text-xs sm:text-sm">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {currentClients.map((cliente) => {
                                                    const planPrecio = cliente.plan?.precio_mensual
                                                        ?? planes[cliente.plan_id]?.precio_mensual
                                                        ?? 0;

                                                    const mesesAdeudados = obtenerMesesAdeudados(cliente, anioActual, mesActual, hoy);
                                                    const montoAdeudado = planPrecio * mesesAdeudados.length;

                                                    return (
                                                        <tr key={`d-${cliente.id}`} className="hover:bg-orange-50 align-top">
                                                            <td className="px-4 py-3 font-medium text-xs sm:text-sm">{cliente.id}</td>
                                                            <td className="px-4 py-3 font-medium text-orange-700 text-xs sm:text-sm">{cliente.nombre}</td>
                                                            <td className="px-4 py-3 text-xs sm:text-sm">{cliente.telefono}</td>
                                                            <td className="px-4 py-3 break-words max-w-xs text-xs sm:text-sm">{cliente.direccion}</td>

                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-xs sm:text-sm">
                                                                        {cliente.plan?.nombre ?? planes[cliente.plan_id]?.nombre ?? "—"}
                                                                    </span>
                                                                    <span className="text-xs text-slate-500">
                                                                        {planPrecio > 0 ? `${HNL.format(planPrecio)}/mes` : "sin precio"}
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            <td className="px-4 py-3">
                                                                {mesesAdeudados.length > 0 ? (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {mesesAdeudados.map((m) => (
                                                                            <span
                                                                                key={m}
                                                                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200"
                                                                                title={`${mesLargo[m - 1]} ${anioActual} pendiente`}
                                                                            >
                                                                                {mesCorto[m - 1]}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-400 text-xs">—</span>
                                                                )}
                                                                <div className="mt-1 text-xs text-slate-500">
                                                                    {mesesAdeudados.length} mes(es)
                                                                </div>
                                                            </td>

                                                            <td className="px-4 py-3 font-semibold text-xs sm:text-sm">
                                                                {HNL.format(montoAdeudado)}
                                                            </td>

                                                            <td className="px-4 py-3 font-medium text-center">
                                                                <span
                                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cliente.dia_pago === 15
                                                                            ? "bg-blue-100 text-blue-700"
                                                                            : "bg-green-100 text-green-700"
                                                                        }`}
                                                                >
                                                                    {cliente.dia_pago}
                                                                </span>
                                                            </td>

                                                            <td className="px-4 py-3">
                                                                <span
                                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cliente.descripcion === "Activo" || cliente.estado_id === 1
                                                                            ? "bg-green-100 text-green-700"
                                                                            : cliente.descripcion === "Suspendido" || cliente.estado_id === 3
                                                                                ? "bg-yellow-100 text-yellow-700"
                                                                                : "bg-red-100 text-red-700"
                                                                        }`}
                                                                >
                                                                    {cliente.descripcion ||
                                                                        (cliente.estado_id === 1
                                                                            ? "Activo"
                                                                            : cliente.estado_id === 2
                                                                                ? "Inactivo"
                                                                                : "Suspendido")}
                                                                </span>
                                                            </td>

                                                            <td className="px-4 py-3">
                                                                <Link
                                                                    href={cajaHref(cliente)}
                                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium
                                     bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none
                                     focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 transition-colors"
                                                                    title="Ir a caja y preseleccionar cliente"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4"
                                                                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                            d="M12 8c-1.657 0-3 1.343-3 3m6 0a3 3 0 00-3-3m-7 8a4 4 0 014-4h6a4 4 0 014 4v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-1z" />
                                                                    </svg>
                                                                    Realizar pago
                                                                </Link>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Paginación responsive */}
                                {clientesFiltrados.length > itemsPerPage && (
                                    <div className="mt-6 sm:mt-8">
                                        <Pagination
                                            currentPage={currentPage}
                                            totalItems={clientesFiltrados.length}
                                            itemsPerPage={itemsPerPage}
                                            onPageChange={handlePageChange}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </CajeroLayout>
    );
};

export default PendientesCajero;
