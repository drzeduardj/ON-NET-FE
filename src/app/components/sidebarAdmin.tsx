"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { obtenerMisModulos, type Modulo } from "@/app/lib/planillasApi";

export default function SidebarAdmin({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // Módulos restringidos. No se listan a mano: se preguntan al backend, que
  // los saca de cargo_modulo. Así el menú y el permiso real nunca se separan,
  // y dar acceso a otro cargo mañana es un INSERT y no un despliegue.
  //
  // Si la petición falla (sesión vencida, cargo sin módulos), la lista queda
  // vacía y la sección simplemente no se pinta.
  const [modulos, setModulos] = useState<Modulo[]>([]);

  useEffect(() => {
    let cancelado = false;
    obtenerMisModulos()
      .then((lista) => {
        if (!cancelado) setModulos(lista);
      })
      .catch(() => {
        if (!cancelado) setModulos([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const Item = ({ href, label, exact = false }: { href: string; label: string; exact?: boolean }) => {
    // Comparación exacta o por startsWith según sea necesario
    let active = false;

    if (exact) {
      active = pathname === href;
    } else {
      // Para rutas que no tienen subrutas, usar exact match
      const routesWithoutSubpaths = [
        '/pages/admin/caja',
        '/pages/tecnico/tareas',
        '/pages/tecnico/instalacion',
        '/pages/tecnico/reportar'
      ];

      if (routesWithoutSubpaths.includes(href)) {
        active = pathname === href;
      } else {
        active = pathname?.startsWith(href) || false;
      }
    }

    return (
      <li>
        <Link
          href={href}
          onClick={onClose}
          className={[
            "block rounded-xl px-3 py-2 text-sm transition-all duration-200",
            active
              ? "bg-white text-orange-900 shadow-inner font-medium"
              : "text-orange-800 hover:bg-orange-200/70 hover:text-orange-900",
          ].join(" ")}
        >
          {label}
        </Link>
      </li>
    );
  };

  return (
    <aside className="h-full bg-orange-100 text-orange-900 shadow-xl border-r border-orange-200 flex flex-col">
      {/* Top bar del sidebar con el botón de abrir/cerrar */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-orange-200">
        <div className="text-base font-semibold">Panel Admin</div>
        <button
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={onToggle}
          className="inline-flex items-center justify-center rounded-lg border border-orange-300 px-2 py-2 active:scale-95 transition-transform duration-150 md:hidden"
        >
          {open ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
        </button>
      </div>

      {/* Menú - Contenedor con scroll */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto px-4 py-5 space-y-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-orange-500/80 font-medium">Administración</p>
            <ul className="space-y-1">
              <Item href="/pages/admin/clientes" label="Gestión de Clientes de Internet" />
              <Item href="/pages/admin/iptv/clientes" label="Gestión de Clientes de IPTV" />
              <Item href="/pages/admin/empleados" label="Gestión de Empleados" />
              <Item href="/pages/admin/cotizaciones" label="Cotizaciones" /> 
              <Item href="/pages/admin/bitacora" label="Bitacora" />
            </ul>
          </div>

          <hr className="border-orange-300/60" />

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-orange-500/80 font-medium">Gestion Internet</p>
            <ul className="space-y-1">
              <Item href="/pages/admin/caja" label="Registrar Pago" />
              <Item href="/pages/admin/caja/historial" label="Pagos Internet" />
              <Item href="/pages/admin/caja/gastos" label="Registrar Gastos" />
              <Item href="/pages/admin/caja/balances" label="Balances" />
              <Item href="/pages/admin/caja/pendientes" label="Clientes Pendientes" />
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-orange-500/80 font-medium">Gestion TV</p>
            <ul className="space-y-1">
              <Item href="/pages/admin/iptv/historialtv" label="Pagos IPTV" />
              <Item href="/pages/admin/iptv/gastostv" label="Gastos IPTV" />
              <Item href="/pages/admin/iptv/balancestv" label="Balances IPTV" />
            </ul>
          </div>

          {modulos.length > 0 && (
            <>
              <hr className="border-orange-300/60" />

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-orange-500/80 font-medium">
                  Operaciones de campo
                </p>
                <ul className="space-y-1">
                  {modulos
                    .filter((m) => m.ruta)
                    .map((m) => (
                      <Item key={m.id} href={m.ruta as string} label={m.nombre} />
                    ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
