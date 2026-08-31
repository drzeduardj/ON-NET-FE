'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { obtenerMisModulos, esErrorDeAcceso, type Modulo } from '@/app/lib/planillasApi';

/**
 * Guarda de pantalla para los módulos restringidos.
 *
 * Comprueba dos cosas distintas:
 *   - que haya sesión (useAuth, mirando el token);
 *   - que el cargo del usuario tenga ESE módulo, preguntándoselo al backend.
 *
 * Lo segundo sale de la tabla cargo_modulo, la misma que usa el middleware.
 * Esconder la pantalla no protege nada por sí solo — el backend igual corta
 * con 403 —, pero evita que a un cajero le aparezca un menú que no puede usar.
 */
export const useModulo = (clave: string) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [permitido, setPermitido] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      window.location.href = '/noAuth';
      return;
    }

    let cancelado = false;

    obtenerMisModulos()
      .then((lista) => {
        if (cancelado) return;
        setModulos(lista);
        const tieneAcceso = lista.some((m) => m.clave === clave);
        setPermitido(tieneAcceso);
        setVerificando(false);
        if (!tieneAcceso) window.location.href = '/noAuth';
      })
      .catch((e) => {
        if (cancelado) return;
        setVerificando(false);

        // Sesión vencida o cargo sin permiso: a la pantalla de siempre.
        if (esErrorDeAcceso(e)) {
          window.location.href = '/noAuth';
          return;
        }

        // Cualquier otra falla (backend caído, red) NO es falta de permiso.
        // Se guarda el motivo: sin esto la pantalla se quedaba en
        // "Verificando acceso..." para siempre y sin decir por qué.
        setError(e instanceof Error ? e.message : 'No se pudo verificar el acceso');
      });

    return () => {
      cancelado = true;
    };
  }, [authLoading, isAuthenticated, clave]);

  return { permitido, verificando: authLoading || verificando, error, modulos };
};
