"use client";

import { useEffect, useState } from "react";
import {
  guardarIntegrantes,
  obtenerColaboradores,
  num,
  type Colaborador,
  type IntegrantePlanilla
} from "@/app/lib/planillasApi";
import {
  Modal,
  MensajeError,
  claseInput,
  claseBotonPrimario,
  claseBotonSecundario
} from "../../components/ui";

interface Fila {
  colaborador_id: number;
  nombre: string;
  incluido: boolean;
  tarifa_diaria: string;
}

/**
 * Sólo se necesita el id y los integrantes actuales, no la planilla entera.
 * Tipado así, el modal sirve igual a la pantalla detallada y a la rápida.
 */
interface PlanillaMinima {
  id: number;
  colaboradores: IntegrantePlanilla[];
}

interface Props {
  abierto: boolean;
  planilla: PlanillaMinima;
  onCerrar: () => void;
  onGuardado: () => void;
}

/**
 * Quiénes integran la planilla y con qué jornal.
 *
 * Es lo que en el Excel eran las columnas de nombres. Aquí son filas, así que
 * sumar gente a mitad de quincena no rompe nada.
 */
const IntegrantesModal = ({ abierto, planilla, onCerrar, onGuardado }: Props) => {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto) return;

    setError("");
    setBusqueda("");
    setCargando(true);

    obtenerColaboradores(true)
      .then((colaboradores: Colaborador[]) => {
        const yaEstan = new Map(
          planilla.colaboradores.map((c: IntegrantePlanilla) => [c.colaborador_id, num(c.tarifa_diaria)])
        );

        setFilas(
          colaboradores.map((c) => ({
            colaborador_id: c.id,
            nombre: c.alias || `${c.nombre} ${c.apellido ?? ""}`.trim(),
            incluido: yaEstan.has(c.id),
            // Si ya está en la planilla se respeta lo pactado ahí, que puede
            // diferir de su tarifa por defecto.
            tarifa_diaria: String(yaEstan.get(c.id) ?? num(c.tarifa_diaria))
          }))
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los colaboradores"))
      .finally(() => setCargando(false));
  }, [abierto, planilla]);

  const visibles = filas.filter((f) => f.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const seleccionados = filas.filter((f) => f.incluido);

  const cambiar = (id: number, cambios: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.colaborador_id === id ? { ...f, ...cambios } : f)));

  const guardar = async () => {
    setError("");

    if (seleccionados.some((f) => num(f.tarifa_diaria) < 0)) {
      return setError("Hay una tarifa negativa");
    }

    setGuardando(true);
    try {
      await guardarIntegrantes(
        planilla.id,
        seleccionados.map((f) => ({
          colaborador_id: f.colaborador_id,
          tarifa_diaria: num(f.tarifa_diaria),
          observaciones: null
        }))
      );
      onGuardado();
      onCerrar();
    } catch (e) {
      // El backend devuelve 409 si se intenta sacar a alguien que ya tiene
      // días capturados: sus jornales quedarían fuera de la liquidación.
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Integrantes de la planilla" onCerrar={onCerrar} ancho="max-w-2xl">
      <MensajeError mensaje={error} />

      <input
        className={`${claseInput} mb-3`}
        placeholder="Buscar colaborador..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {cargando ? (
        <p className="py-8 text-center text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-16">Incluir</th>
                <th className="px-3 py-2 text-left font-medium">Colaborador</th>
                <th className="px-3 py-2 text-right font-medium w-40">Jornal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((f) => (
                <tr key={f.colaborador_id} className={f.incluido ? "bg-orange-50/40" : ""}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-orange-500"
                      checked={f.incluido}
                      onChange={(e) => cambiar(f.colaborador_id, { incluido: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-slate-700">{f.nombre}</td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number" step="0.01" min="0"
                      className={`${claseInput} text-right`}
                      value={f.tarifa_diaria}
                      disabled={!f.incluido}
                      onChange={(e) => cambiar(f.colaborador_id, { tarifa_diaria: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {seleccionados.length} seleccionados. No se puede quitar a quien ya tenga días registrados en
        esta planilla: sus jornales quedarían fuera de la liquidación. Primero hay que borrar esos días.
      </p>

      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onCerrar} className={claseBotonSecundario}>Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando} className={claseBotonPrimario}>
          {guardando ? "Guardando..." : "Guardar integrantes"}
        </button>
      </div>
    </Modal>
  );
};

export default IntegrantesModal;
