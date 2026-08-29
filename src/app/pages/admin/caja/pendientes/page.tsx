"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/app/components/adminLayout";
import Pagination from "@/app/components/pagination";
import SearchDropdown from "@/app/components/searchBar";
import { esMesConDeuda } from "@/app/lib/estadoMensual";

const apiHost = process.env.NEXT_PUBLIC_API_HOST as string;

interface EstadoMensual {
  mes: number;
  anio: number;
  estado: string; // "Pagado" | "Pendiente" | "Pagado Parcial" | ...
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
const cajaHref = (c: Cliente) => `/pages/admin/caja?clienteId=${encodeURIComponent(c.id)}`;

/** Devuelve los meses (1-12) adeudados del año actual hasta el mes actual (inclusive) */
const obtenerMesesAdeudados = (
  cliente: Cliente,
  anioActual: number,
  mesActual: number,
  hoy: Date
): number[] => {
  // Determinar último mes contable del año actual
  let ultimoMes = mesActual;

  // Si aún no llegó el día de pago de este mes, no contar el mes actual
  const diaCorte = Number.isFinite(cliente.dia_pago) ? cliente.dia_pago : 1;
  const esMismoMes = (hoy.getMonth() + 1) === mesActual;
  if (esMismoMes && hoy.getDate() < diaCorte) {
    ultimoMes = mesActual - 1;
  }

  // Si hay fecha de instalación, no contar meses previos
  let primerMes = 1;
  if (cliente.fecha_instalacion) {
    const fi = new Date(cliente.fecha_instalacion);
    const anioInst = fi.getFullYear();
    const mesInst = fi.getMonth() + 1;
    if (anioInst > anioActual) return [];                 // instalado en año futuro -> nada
    if (anioInst === anioActual) primerMes = Math.max(1, mesInst);
  }

  if (ultimoMes < primerMes) return [];

  const meses: number[] = [];
  for (let m = primerMes; m <= ultimoMes; m++) {
    const estado = cliente.estados?.find(e => e.mes === m && e.anio === anioActual)?.estado;
    // Cuenta "Pendiente", "Pagado Parcial" y "Sin estado". Quedan fuera
    // "Suspendido" y "Sin servicio": en esos meses no hay nada que cobrar.
    if (esMesConDeuda(estado)) {
      meses.push(m);
    }
  }
  return meses;
};

const Pendientes = () => {
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
    // Si todos traen plan con precio, no hacemos request extra
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

      // Cargar estados del año actual en paralelo
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

      // Intentar completar planes si faltan
      const mapaPlanes = await cargarPlanesSiHaceFalta(clientesConEstados);

      // Filtrar pendientes por meses adeudados > 0
      const pendientes = clientesConEstados.filter(c => {
        const planPrecio = c.plan?.precio_mensual ?? mapaPlanes[c.plan_id]?.precio_mensual ?? 0;
        const mesesAdeudados = obtenerMesesAdeudados(c, anioActual, mesActual, hoy); // <-- pasa 'hoy'
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
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-600">Clientes Pendientes de Pago</h1>
            <p className="text-sm text-slate-600 mt-2">
              Lista de clientes con pagos pendientes del mes actual (muestra el monto adeudado a la fecha)
            </p>
          </div>
        </div>

        {/* Búsqueda y filtros */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1">
            <SearchDropdown
              items={clientNames}
              placeholder="Buscar clientes pendientes..."
              onSearch={handleSearch}
              className="w-full max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleFiltroDiaPago('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filtroDiaPago === 'todos'
                ? 'bg-orange-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
            >
              Todos
            </button>
            <button
              onClick={() => handleFiltroDiaPago(15)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filtroDiaPago === 15
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
            >
              Día 15
            </button>
            <button
              onClick={() => handleFiltroDiaPago(30)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filtroDiaPago === 30
                ? 'bg-green-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
            >
              Día 30
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-700 text-sm">
            Se considera adeudado todo mes del año actual hasta {mesLargo[mesActual - 1]} que no esté en estado <b>Pagado</b>.
            El monto mostrado = meses adeudados × precio mensual del plan.
          </p>
        </div>

        {/* Contenido */}
        <div className="bg-white rounded-2xl shadow-lg border border-orange-200 p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
              <p className="text-slate-600 mt-4">Cargando clientes pendientes...</p>
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
          ) : clientesPendientes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-green-600 text-lg mb-4">¡Excelente! No hay clientes pendientes de pago.</p>
              <p className="text-slate-600">Todos los clientes están al día.</p>
            </div>
          ) : (
            <>
              {clientesFiltrados.length === 0 && (
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-600 text-center">
                    {filtroDiaPago === 'todos'
                      ? "No se encontraron clientes pendientes que coincidan con la búsqueda."
                      : `No hay clientes pendientes con día de pago ${filtroDiaPago}.`}
                  </p>
                </div>
              )}

              {/* Resumen */}
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-orange-700 text-sm">
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

              {/* ===== Vista móvil (cards) ===== */}
              <div className="md:hidden grid gap-3">
                {currentClients.map((cliente) => {
                  const planPrecio = cliente.plan?.precio_mensual
                    ?? planes[cliente.plan_id]?.precio_mensual
                    ?? 0;

                  const mesesAdeudados = obtenerMesesAdeudados(cliente, anioActual, mesActual, hoy);
                  const montoAdeudado = planPrecio * mesesAdeudados.length;

                  return (
                    <div
                      key={`m-${cliente.id}`}
                      className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-orange-700 truncate">
                            {cliente.nombre}
                          </h3>
                          <p className="text-xs text-slate-500 break-words">
                            {cliente.direccion}
                          </p>
                        </div>

                        {/* Estado servicio */}
                        <span
                          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cliente.descripcion === "Activo" || cliente.estado_id === 1
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

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-slate-500">Teléfono</p>
                          <p className="font-medium">{cliente.telefono || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Día de pago</p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cliente.dia_pago === 15
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
                          <p className="text-base font-bold">{HNL.format(montoAdeudado)}</p>
                          <p className="text-[11px] text-slate-500">{mesesAdeudados.length} mes(es)</p>
                        </div>
                      </div>

                      {/* Meses pendientes chips */}
                      <div className="mt-3">
                        <p className="text-xs text-slate-500 mb-1">Meses pendientes</p>
                        {mesesAdeudados.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {mesesAdeudados.map((m) => (
                              <span
                                key={`chip-${cliente.id}-${m}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200"
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

                      <div className="mt-4">
                        <Link
                          href={cajaHref(cliente)}
                          className="inline-flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                       bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none
                       focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"
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

              {/* ===== Vista escritorio (tabla) ===== */}
              <div className="hidden md:block overflow-x-auto rounded-lg">
                <table className="w-full min-w-[980px] text-sm border-collapse">
                  <thead className="bg-orange-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                      <th className="px-4 py-3 text-left font-semibold">Teléfono</th>
                      <th className="px-4 py-3 text-left font-semibold">Dirección</th>
                      <th className="px-4 py-3 text-left font-semibold">Plan</th>
                      <th className="px-4 py-3 text-left font-semibold">Meses Pendientes</th>
                      <th className="px-4 py-3 text-left font-semibold">Monto</th>
                      <th className="px-4 py-3 text-left font-semibold">Día Pago</th>
                      <th className="px-4 py-3 text-left font-semibold">Estado Servicio</th>
                      <th className="px-4 py-3 text-left font-semibold">Acciones</th>
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
                          <td className="px-4 py-3 font-medium">{cliente.id}</td>
                          <td className="px-4 py-3 font-medium text-orange-700">{cliente.nombre}</td>
                          <td className="px-4 py-3">{cliente.telefono}</td>
                          <td className="px-4 py-3 break-words max-w-xs">{cliente.direccion}</td>

                          {/* Plan */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {cliente.plan?.nombre ?? planes[cliente.plan_id]?.nombre ?? "—"}
                              </span>
                              <span className="text-xs text-slate-500">
                                {planPrecio > 0 ? `${HNL.format(planPrecio)}/mes` : "sin precio"}
                              </span>
                            </div>
                          </td>

                          {/* Meses pendientes (chips) */}
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
                              <span className="text-slate-400">—</span>
                            )}
                            <div className="mt-1 text-xs text-slate-500">
                              {mesesAdeudados.length} mes(es)
                            </div>
                          </td>

                          {/* Monto adeudado */}
                          <td className="px-4 py-3 font-semibold">
                            {HNL.format(montoAdeudado)}
                          </td>

                          {/* Día de pago */}
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

                          {/* Estado servicio */}
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

                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <Link
                              href={cajaHref(cliente)}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                           bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none
                           focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1"
                              title="Ir a caja y preseleccionar cliente"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"
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

              {/* Paginación */}
              {clientesFiltrados.length > itemsPerPage && (
                <div className="mt-8">
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
    </AdminLayout>
  );
};

export default Pendientes;
