"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "./adminLayout";
import html2pdf from "html2pdf.js";
import SearchSelect from "./searchSelect";

const apiHost = process.env.NEXT_PUBLIC_API_HOST as string;

interface EstadoMensual {
  id?: number;
  mes: number;
  anio: number;
  estado: string;
  total_pagado?: number;
}

interface Plan {
  id: number;
  nombre: string;
  precio_mensual: number;
}

interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  direccion: string;
  coordenadas?: string;
  plan_id: number;
  plan?: Plan;
  estados?: EstadoMensual[];
}

interface MetodoPago {
  id: number;
  descripcion: string;
}

interface MesSeleccionado {
  id?: number;
  mes: number;
  anio: number;
  seleccionado: boolean;
}

type FacturaTipo = "simple" | "multiple";

interface PagoMultipleItem {
  id: number;
  mes_aplicado: number;
  anio_aplicado: number;
  monto: number;
}

interface PagoMultipleResponse {
  message?: string;
  pagos?: PagoMultipleItem[];
  totales?: {
    solicitados: number;
    aplicados: number;
    omitidos: number;
  };
  motivo_omision_posible?: string;
  monto_por_mes?: number[] | number;
}

interface PagoSimpleResponse {
  message?: string;
  id: number;
  mes_aplicado: number;
  anio_aplicado: number;
  aplicado_a?: { mes: number; anio: number };
  nota?: string;
}

interface FacturaData {
  numero?: string;
  fechaEmision: string;
  cliente: {
    id: number;
    nombre: string;
    telefono: string;
    direccion: string;
  };
  plan?: { nombre?: string; precio_mensual?: number };
  estadoPago?: "Pagado" | "Pagado Parcial";
  montoPlan?: number;
  montoPrevioMes?: number;
  montoAbonadoMes?: number;
  saldoPendienteMes?: number;
  metodoPago: string;
  referencia?: string | null;
  observacion?: string | null;
  tipo: FacturaTipo;
  mes_aplicado?: number;
  anio_aplicado?: number;
  pagoId?: number;
  meses?: { mes: number; anio: number }[];
  pagoIds?: number[];
  total: number;
  recibido: number;
  cambio: number;
}

/** ===== Tipos estrictos html2pdf/jsPDF (sin any) ===== */
type JsPDFOutputType =
  | "datauristring"
  | "dataurlstring"
  | "dataurlnewwindow"
  | "pdfobjectnewwindow"
  | "pdfjsnewwindow"
  | "save"
  | "arraybuffer"
  | "blob"
  | "bloburi"
  | "bloburl"
  | "formdata"
  | "img"
  | "jpeg"
  | "png"
  | "svg";

type JsPDFOutputRet = string | ArrayBuffer | Blob | Uint8Array | null;

interface JsPDFInstance {
  save: (name?: string) => void;
  output: (type?: JsPDFOutputType, options?: unknown) => JsPDFOutputRet;
}

interface Html2PdfOptions {
  margin?: number | [number, number] | [number, number, number, number];
  filename?: string;
  image?: { type?: "jpeg" | "png"; quality?: number };
  html2canvas?: {
    scale?: number;
    useCORS?: boolean;
    allowTaint?: boolean;
    backgroundColor?: string | null;
  };
  jsPDF?: { unit?: "pt" | "mm" | "cm" | "in"; format?: string | number[]; orientation?: "portrait" | "landscape" };
  pagebreak?: { mode?: Array<"css" | "legacy" | "avoid-all"> };
}
interface Html2PdfChain {
  set: (opt: Html2PdfOptions) => Html2PdfChain;
  from: (el: HTMLElement | string) => Html2PdfChain;
  save: () => Promise<void>;
  toPdf: () => Html2PdfChain;
  get: (key: "pdf") => Promise<JsPDFInstance>;
}
type Html2Pdf = () => Html2PdfChain;
const html2pdfTyped = html2pdf as unknown as Html2Pdf;
/** ============================================ */

const monthNames = [
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

const fmt = (n: number | undefined | null) =>
  new Intl.NumberFormat("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

type ClienteOption = Pick<Cliente, "id" | "nombre">;

/** ✅ FIX: fecha local YYYY-MM-DD (evita corrimiento por UTC/toISOString) */
const toLocalISODate = (d: Date = new Date()): string => {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
};

const combinarObservacion = (base: string, extra: string): string | null => {
  const b = (base || "").trim();
  const e = (extra || "").trim();
  if (b && e) return `${b} | ${e}`;
  if (b) return b;
  if (e) return e;
  return null;
};

export default function RegistrarPago() {
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("clienteId");

  const [clienteIdInput, setClienteIdInput] = useState<string>(clienteIdParam ? String(clienteIdParam) : "");
  const [clienteId, setClienteId] = useState<number | null>(clienteIdParam ? Number(clienteIdParam) : null);

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [metodoId, setMetodoId] = useState<number | null>(null);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [mesesPendientes, setMesesPendientes] = useState<EstadoMensual[]>([]);
  const [mesesListos, setMesesListos] = useState(false);


  const [clientesCatalogo, setClientesCatalogo] = useState<ClienteOption[]>([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState<boolean>(false);

  const getProximoMesYAno = () => {
    const hoy = new Date();
    let mes = hoy.getMonth() + 2; // siguiente
    let anio = hoy.getFullYear();
    if (mes > 12) {
      mes = 1;
      anio++;
    }
    return { mes, anio };
  };

  /** ✅ FIX: fecha por defecto en local, NO con toISOString directo */
  const [fechaPago, setFechaPago] = useState<string>(toLocalISODate());
  // Los montos se guardan como texto para que la casilla pueda quedar VACÍA.
  // Con un número, borrar el contenido daba Number("") = 0 y el campo se
  // quedaba pegado en "0": el cajero tenía que seleccionarlo para escribir.
  // `montoTotal` y `recibido` siguen siendo números para el resto del código,
  // y los setters siguen recibiendo números, así que nada más cambia.
  const [montoTotalTexto, setMontoTotalTexto] = useState<string>("");
  const montoTotal = Number(montoTotalTexto || 0);
  // Math.floor y no round: el monto sugerido sale del saldo pendiente, que
  // puede traer centavos de pagos viejos. Redondear hacia arriba lo dejaría
  // por encima del saldo y la validación bloquearía el cobro.
  const setMontoTotal = (n: number) =>
    setMontoTotalTexto(n > 0 ? String(Math.floor(n)) : "");

  const [referencia, setReferencia] = useState("");
  const [observacion, setObservacion] = useState("");

  const [recibidoTexto, setRecibidoTexto] = useState<string>("");
  const recibido = Number(recibidoTexto || 0);
  const setRecibido = (n: number) =>
    setRecibidoTexto(n > 0 ? String(Math.floor(n)) : "");

  // El cobro se maneja en lempiras enteros: se descarta todo lo que no sea
  // dígito y los ceros a la izquierda.
  //
  // El tope de 6 dígitos es una red de seguridad: si alguien teclea "650.50"
  // por costumbre, el punto se descarta y quedaría 65050. No lo evita del
  // todo, pero impide que un resbalón se convierta en un monto disparatado.
  const MAX_DIGITOS = 6;
  const soloEnteros = (valor: string) =>
    valor.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITOS);
  const [mesesSeleccionados, setMesesSeleccionados] = useState<MesSeleccionado[]>([]);
  const [modoMultiplesMeses, setModoMultiplesMeses] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [loadingMetodos, setLoadingMetodos] = useState(false);
  const [loadingMeses, setLoadingMeses] = useState(false);
  const [error, setError] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");

  // PDF
  const [factura, setFactura] = useState<FacturaData | null>(null);
  const pdfRef = useRef<HTMLDivElement | null>(null);

  const mesesSeleccionadosCount = useMemo(
    () => mesesSeleccionados.filter((m) => m.seleccionado).length,
    [mesesSeleccionados]
  );

  const cambio = useMemo(() => {
    const c = (recibido || 0) - (montoTotal || 0);
    return Number.isFinite(c) ? c : 0;
  }, [recibido, montoTotal]);

  const montoPorMes = useMemo(() => {
    if (!mesesSeleccionadosCount) return 0;
    return Number(montoTotal) / mesesSeleccionadosCount;
  }, [montoTotal, mesesSeleccionadosCount]);

  const mesMasAntiguoPendiente = useMemo(() => {
    if (!mesesSeleccionados.length) return undefined;
    const copia = [...mesesSeleccionados];
    copia.sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));
    return copia[0];
  }, [mesesSeleccionados]);

  const planPrecioMensual = useMemo(() => Number(plan?.precio_mensual || 0), [plan]);

  const estadoMesObjetivo = useMemo(() => {
    if (modoMultiplesMeses || !mesMasAntiguoPendiente) return undefined;
    return mesesPendientes.find(
      (m) =>
        m.mes === mesMasAntiguoPendiente.mes &&
        m.anio === mesMasAntiguoPendiente.anio
    );
  }, [modoMultiplesMeses, mesMasAntiguoPendiente, mesesPendientes]);

  const totalPagadoMesObjetivo = useMemo(() => {
    const raw = Number(estadoMesObjetivo?.total_pagado || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }, [estadoMesObjetivo]);

  const saldoPendienteMesObjetivo = useMemo(() => {
    if (!planPrecioMensual) return 0;
    if (!mesMasAntiguoPendiente) return planPrecioMensual;
    const saldo = Number((planPrecioMensual - totalPagadoMesObjetivo).toFixed(2));
    return saldo > 0 ? saldo : planPrecioMensual;
  }, [planPrecioMensual, totalPagadoMesObjetivo, mesMasAntiguoPendiente]);

  /** ==================== UTILIDADES MESES ==================== */

  const buildProximosMeses = (n: number) => {
    const hoy = new Date();
    let mes = hoy.getMonth() + 1; // 1..12 (MES ACTUAL)
    let anio = hoy.getFullYear();

    const out: { mes: number; anio: number }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ mes, anio });
      mes++;
      if (mes > 12) {
        mes = 1;
        anio++;
      }
    }
    return out;
  };

  const mergeMesesEnSeleccionados = useCallback(
    (nuevos: { mes: number; anio: number }[], seleccionado = false) => {
      setMesesSeleccionados((prev) => {
        const existe = new Set(prev.map((x) => `${x.mes}-${x.anio}`));
        const toAdd: MesSeleccionado[] = [];
        for (const n of nuevos) {
          const key = `${n.mes}-${n.anio}`;
          if (!existe.has(key)) toAdd.push({ mes: n.mes, anio: n.anio, seleccionado });
        }
        const merged = [...prev, ...toAdd].sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));
        return merged;
      });
    },
    []
  );

  const getMesKey = (mes: number, anio: number) => `${mes}-${anio}`;

  const toggleMesSeleccionado = (key: string) => {
    setMesesSeleccionados((prev) =>
      prev.map((m) => {
        const k = `${m.mes}-${m.anio}`;
        return k === key ? { ...m, seleccionado: !m.seleccionado } : m;
      })
    );
  };

  const toggleTodosMeses = (sel: boolean) => {
    setMesesSeleccionados((prev) => prev.map((m) => ({ ...m, seleccionado: sel })));
  };

  /** ==================== CARGAS ==================== */

  useEffect(() => {
    const cargarCatalogo = async () => {
      setLoadingCatalogo(true);
      try {
        const res = await fetch(`${apiHost}/api/clientes?limit=500&order=nombre`);
        if (!res.ok) throw new Error("No se pudo cargar el catálogo de clientes");
        const data: Cliente[] = await res.json();
        const opciones: ClienteOption[] = (Array.isArray(data) ? data : []).map((c) => ({
          id: c.id,
          nombre: c.nombre,
        }));
        setClientesCatalogo(opciones);
      } catch (e) {
        console.error("Catálogo clientes:", e);
        setClientesCatalogo([]);
      } finally {
        setLoadingCatalogo(false);
      }
    };
    void cargarCatalogo();
  }, []);

  useEffect(() => {
    const fetchMetodosPago = async () => {
      setLoadingMetodos(true);
      try {
        const res = await fetch(`${apiHost}/api/pagos/metodos`);
        if (!res.ok) throw new Error("Error al cargar métodos de pago");
        const data: MetodoPago[] = await res.json();
        setMetodosPago(data);
        if (data.length > 0) setMetodoId(data[0].id);
      } catch (e) {
        console.error("Error cargando métodos de pago:", e);
        setError("No se pudieron cargar los métodos de pago.");
      } finally {
        setLoadingMetodos(false);
      }
    };
    void fetchMetodosPago();
  }, []);

  const fetchCliente = useCallback(async (id: number) => {
    setLoadingCliente(true);
    setError("");
    try {
      const res = await fetch(`${apiHost}/api/clientes/${id}`);
      if (!res.ok) throw new Error("No se pudo obtener el cliente");
      const data: Cliente = await res.json();
      setCliente(data);

      if (data.plan && typeof data.plan.precio_mensual === "number") {
        setPlan(data.plan);
        setMontoTotal(Number(data.plan.precio_mensual || 0));
      } else {
        const pr = await fetch(`${apiHost}/api/planes/${data.plan_id}`);
        if (pr.ok) {
          const p: Plan = await pr.json();
          setPlan(p);
          setMontoTotal(Number(p.precio_mensual || 0));
        } else {
          setPlan(null);
          setMontoTotal(0);
        }
      }
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar la información del cliente/plan.");
      setCliente(null);
    } finally {
      setLoadingCliente(false);
    }
  }, []);

  /** ✅ FIX: filtrar pendientes contra el INICIO del mes actual (evita efecto por horas) */
  const fetchMesesPendientes = useCallback(async (cid: number): Promise<number> => {
    setLoadingMeses(true);
    setMesesListos(false);
    try {
      const res = await fetch(`${apiHost}/api/pagos/meses-pendientes/${cid}`);
      if (!res.ok) {
        setMesesPendientes([]);
        setMesesSeleccionados([]);
        return 0;
      }

      const data: EstadoMensual[] = await res.json();

      const hoy = new Date();
      const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

      const filtrados = data
        .filter((m) => new Date(m.anio, m.mes - 1, 1) <= inicioMesActual)
        .sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));

      setMesesPendientes(filtrados);

      const mesesInit: MesSeleccionado[] = filtrados.map((m, idx) => ({
        id: m.id,
        mes: m.mes,
        anio: m.anio,
        seleccionado: idx === 0,
      }));
      setMesesSeleccionados(mesesInit);

      return filtrados.length;
    } catch (e) {
      console.error("Error al cargar meses pendientes:", e);
      setMesesPendientes([]);
      setMesesSeleccionados([]);
      return 0;
    } finally {
      setLoadingMeses(false);
      setMesesListos(true);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!clienteId) return;

      await fetchCliente(clienteId);
      const pendientesCount = await fetchMesesPendientes(clienteId);

      if (pendientesCount === 0) {
        const futuros12 = buildProximosMeses(12);
        setMesesSeleccionados(futuros12.map((f) => ({ mes: f.mes, anio: f.anio, seleccionado: false })));
        setModoMultiplesMeses(true);
      } else {
        setModoMultiplesMeses(false);
      }
    };
    void run();
  }, [clienteId, fetchCliente, fetchMesesPendientes]);

  useEffect(() => {
    if (!plan) return;

    if (modoMultiplesMeses) {
      if (mesesSeleccionadosCount > 0) {
        setMontoTotal(Number(plan.precio_mensual) * mesesSeleccionadosCount);
      } else {
        setMontoTotal(0);
      }
      return;
    }

    setMontoTotal(Number(saldoPendienteMesObjetivo || planPrecioMensual || 0));
  }, [modoMultiplesMeses, plan, mesesSeleccionadosCount, saldoPendienteMesObjetivo, planPrecioMensual]);

  /** ===== Exportar PDF ===== */
  const exportarPDF = async () => {
    const source = pdfRef.current;
    if (!source) return;

    const clone = source.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, {
      position: "static",
      left: "auto",
      top: "auto",
      width: "210mm",
      background: "white",
      opacity: "1",
      pointerEvents: "auto",
      zIndex: "99999",
      margin: "0 auto",
    } as Partial<CSSStyleDeclaration>);

    document.body.appendChild(clone);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => setTimeout(() => r(), 60));

    const nombreCliente = cliente?.nombre ? cliente.nombre.replace(/\s+/g, "_") : "cliente";
    const filename = `factura_${nombreCliente}_${fechaPago}.pdf`;

    const opt: Html2PdfOptions = {
      margin: 0,
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css"] },
    };

    try {
      const pdf = await html2pdfTyped().set(opt).from(clone).toPdf().get("pdf");
      pdf.save(filename);
    } catch (err) {
      console.error("html2pdf save() falló:", err);
      try {
        const pdf = await html2pdfTyped().set(opt).from(clone).toPdf().get("pdf");
        const out = pdf.output("blob");
        if (out instanceof Blob) {
          const url = URL.createObjectURL(out);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } else {
          const dataUri = pdf.output("datauristring");
          if (typeof dataUri === "string") {
            const a = document.createElement("a");
            a.href = dataUri;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
          } else {
            throw new Error("No se pudo generar salida válida del PDF");
          }
        }
      } catch (err2) {
        console.error("Fallback también falló:", err2);
        setError("No se pudo generar el PDF. Revisa la consola para más detalles.");
      }
    } finally {
      document.body.removeChild(clone);
    }
  };

  useEffect(() => {
    if (factura && pdfRef.current) {
      const t = setTimeout(() => {
        void exportarPDF();
      }, 80);
      return () => clearTimeout(t);
    }
  }, [factura]);

  /** ===== Submit ===== */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOkMsg("");
    setError("");

    if (!clienteId) return setError("Selecciona o indica un cliente válido.");
    if (!metodoId) return setError("Selecciona un método de pago.");
    if (!montoTotal || montoTotal <= 0) return setError("El monto debe ser mayor a 0.");
    if (!fechaPago) return setError("La fecha de pago es requerida.");
    if (!modoMultiplesMeses && loadingMeses) {
      return setError("Espera a que carguen los meses pendientes para registrar el pago.");
    }
    if (!modoMultiplesMeses && mesesPendientes.length > 0 && !mesMasAntiguoPendiente) {
      return setError("No se pudo determinar el mes objetivo del pago. Recarga la vista e intenta de nuevo.");
    }
    if (modoMultiplesMeses && recibido < montoTotal) {
      return setError("En pagos múltiples, el recibido no puede ser menor que el monto total.");
    }
    if (!modoMultiplesMeses && recibido <= 0) {
      return setError("Ingresa un monto recibido mayor a 0 para registrar el pago.");
    }
    if (!modoMultiplesMeses && saldoPendienteMesObjetivo > 0 && Number(montoTotal) > saldoPendienteMesObjetivo) {
      return setError(
        `El monto supera el saldo pendiente del mes objetivo (L.${fmt(saldoPendienteMesObjetivo)}).`
      );
    }

    setLoading(true);
    try {
      const metodoDesc = metodosPago.find((m) => m.id === metodoId)?.descripcion || `Método #${metodoId}`;

      if (modoMultiplesMeses) {
        const months = mesesSeleccionados.filter((m) => m.seleccionado);
        if (months.length === 0) {
          setError("Selecciona al menos un mes para aplicar el pago.");
          setLoading(false);
          return;
        }

        const body = {
          cliente_id: clienteId,
          monto_total: Number(montoTotal),
          fecha_pago: fechaPago, // ✅ ya es local
          metodo_id: metodoId,
          referencia: referencia || null,
          observacion: observacion || null,
          meses: months.map((m) => (m.id ? { id: m.id, mes: m.mes, anio: m.anio } : { mes: m.mes, anio: m.anio })),
        };

        const res = await fetch(`${apiHost}/api/pagos/multiples`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorData: Partial<PagoMultipleResponse> = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Error al registrar los pagos");
        }

        const data: PagoMultipleResponse = await res.json();

        const pagosAplicados = Array.isArray(data.pagos) ? data.pagos : [];
        const pagoIds: number[] = pagosAplicados.map((p) => Number(p.id)).filter(Number.isFinite);

        const solicitados = data.totales?.solicitados ?? months.length;
        const aplicados = data.totales?.aplicados ?? pagosAplicados.length;
        const omitidos = data.totales?.omitidos ?? (solicitados - aplicados);

        let msg = `✅ Pagos registrados: ${aplicados}/${solicitados}. Omitidos: ${omitidos}.`;
        if (omitidos > 0 && data.motivo_omision_posible) {
          msg += ` (${data.motivo_omision_posible})`;
        }
        setOkMsg(msg);

        void fetchMesesPendientes(clienteId);

        setFactura({
          numero: (pagoIds[0] ?? Date.now()).toString(),
          fechaEmision: fechaPago,
          cliente: {
            id: clienteId,
            nombre: cliente?.nombre || "",
            telefono: cliente?.telefono || "",
            direccion: cliente?.direccion || "",
          },
          plan: { nombre: plan?.nombre, precio_mensual: plan?.precio_mensual },
          metodoPago: metodoDesc,
          referencia: referencia || null,
          observacion: observacion || null,
          tipo: "multiple",
          meses: pagosAplicados.map((p) => ({ mes: p.mes_aplicado, anio: p.anio_aplicado })),
          pagoIds,
          total: Number(montoTotal),
          recibido: Number(recibido),
          cambio: Number(cambio),
        });
      } else {
        const target = mesMasAntiguoPendiente;
        const { mes: nextMes, anio: nextAnio } = getProximoMesYAno();

        const montoBase = Number(montoTotal);
        const montoRecibido = Number(recibido);
        const montoIngresado = Number(Math.max(0, Math.min(montoBase, montoRecibido)).toFixed(2));
        if (montoIngresado <= 0) {
          setLoading(false);
          setError("El abono parcial debe ser mayor a 0.");
          return;
        }
        const montoPrevioMes = Number(totalPagadoMesObjetivo || 0);
        const montoAcumuladoMes = Number((montoPrevioMes + montoIngresado).toFixed(2));
        const pagoQuedaParcial =
          planPrecioMensual > 0 && montoAcumuladoMes + 0.0001 < planPrecioMensual;
        const saldoPendienteDespues = planPrecioMensual > 0
          ? Math.max(Number((planPrecioMensual - montoAcumuladoMes).toFixed(2)), 0)
          : 0;
        const estadoPagoMes: "Pagado" | "Pagado Parcial" = pagoQuedaParcial
          ? "Pagado Parcial"
          : "Pagado";

        const detalleParcial = pagoQuedaParcial
          ? `[PAGO PARCIAL] Abonado: L.${fmt(montoIngresado)} de L.${fmt(planPrecioMensual)}. Acumulado: L.${fmt(montoAcumuladoMes)}. Saldo pendiente: L.${fmt(saldoPendienteDespues)}.`
          : "";
        const observacionFinal = combinarObservacion(observacion, detalleParcial);

        const bodyBase = {
          cliente_id: clienteId,
          monto: montoIngresado,
          fecha_pago: fechaPago, // ✅ ya es local
          metodo_id: metodoId,
          referencia: referencia || null,
          observacion: observacionFinal,
          mes_aplicado: target?.mes ?? nextMes,
          anio_aplicado: target?.anio ?? nextAnio,
        };

        const body = {
          ...bodyBase,
          estado: estadoPagoMes,
          es_parcial: pagoQuedaParcial,
          monto_plan: planPrecioMensual || null,
          monto_previo: montoPrevioMes,
          monto_acumulado: montoAcumuladoMes,
          saldo_pendiente: saldoPendienteDespues,
        };

        let res = await fetch(`${apiHost}/api/pagos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        let persistenciaParcialLimitada = false;
        if (!res.ok) {
          const errorData: Partial<PagoSimpleResponse> & { message?: string } =
            await res.json().catch(() => ({} as Partial<PagoSimpleResponse> & { message?: string }));
          const msgError = errorData?.message || "Error al registrar el pago";

          const pareceErrorDeEsquema =
            /unknown|unexpected|invalid|property|campo|permitido|schema/i.test(msgError);

          if (pagoQuedaParcial && pareceErrorDeEsquema) {
            res = await fetch(`${apiHost}/api/pagos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bodyBase),
            });
            persistenciaParcialLimitada = true;
          }
        }

        if (!res.ok) {
          const errorData: Partial<PagoSimpleResponse> & { message?: string } =
            await res.json().catch(() => ({} as Partial<PagoSimpleResponse> & { message?: string }));
          throw new Error(errorData?.message || "Error al registrar el pago");
        }

        const result: PagoSimpleResponse = await res.json();

        const mesFinal = result.aplicado_a?.mes ?? result.mes_aplicado;
        const anioFinal = result.aplicado_a?.anio ?? result.anio_aplicado;

        let msg = `✅ Pago registrado para ${monthNames[mesFinal - 1]} ${anioFinal}.`;
        if (pagoQuedaParcial) {
          msg += ` Estado: Pagado Parcial (saldo pendiente: L.${fmt(saldoPendienteDespues)}).`;
          if (persistenciaParcialLimitada) {
            msg += " El backend no aceptó campos extendidos; se dejó trazabilidad del parcial en observación.";
          }
        }
        if (result.nota) msg += ` (${result.nota})`;
        setOkMsg(msg);

        void fetchMesesPendientes(clienteId);

        setFactura({
          numero: String(result.id ?? Date.now()),
          fechaEmision: fechaPago,
          cliente: {
            id: clienteId,
            nombre: cliente?.nombre || "",
            telefono: cliente?.telefono || "",
            direccion: cliente?.direccion || "",
          },
          plan: { nombre: plan?.nombre, precio_mensual: plan?.precio_mensual },
          estadoPago: estadoPagoMes,
          montoPlan: planPrecioMensual || undefined,
          montoPrevioMes: montoPrevioMes,
          montoAbonadoMes: montoAcumuladoMes,
          saldoPendienteMes: saldoPendienteDespues,
          metodoPago: metodoDesc,
          referencia: referencia || null,
          observacion: observacionFinal,
          tipo: "simple",
          mes_aplicado: Number(mesFinal),
          anio_aplicado: Number(anioFinal),
          pagoId: Number(result.id),
          total: Number(montoIngresado),
          recibido: Number(montoRecibido),
          cambio: Number((montoRecibido - montoIngresado).toFixed(2)),
        });
      }

      setReferencia("");
      setObservacion("");
      setRecibido(0);
      setMesesSeleccionados((prev) => prev.map((m, i) => ({ ...m, seleccionado: i === 0 })));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "❌ No se pudo registrar el pago.");
    } finally {
      setLoading(false);
    }
  };

  const handleSeleccionCliente = (val: string) => {
    setClienteIdInput(val);
    const idSel = Number(val);
    if (Number.isFinite(idSel)) {
      setClienteId(idSel);
    }
  };

  // Bloqueo total de submit cuando aún está cargando / incompleto
  const bloquearSubmit =
    loading ||
    loadingCliente ||
    !clienteId ||
    !metodoId ||
    (modoMultiplesMeses && mesesSeleccionadosCount === 0) ||
    (modoMultiplesMeses && recibido < montoTotal) ||
    (!modoMultiplesMeses && recibido <= 0);


  return (
    <AdminLayout>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-orange-600">Registrar Pago</h1>
          <div className="flex flex-wrap gap-2">
            <Link href="/pages/admin/clientes" className="inline-flex items-center px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-sm">
              ← Volver a Clientes
            </Link>
          </div>
        </div>

        <div className="w-full bg-white p-4 sm:p-6 lg:p-8 rounded-2xl shadow-xl border border-orange-300">
          {!cliente && !loadingCliente && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Buscar Cliente (por nombre o ID)</label>

              <div className="max-w-lg">
                <SearchSelect
                  clientes={clientesCatalogo}
                  value={clienteIdInput}
                  onChange={handleSeleccionCliente}
                  placeholder={loadingCatalogo ? "Cargando clientes..." : "Buscar cliente..."}
                />
              </div>

              <p className="mt-1 text-xs text-slate-500">
                También puedes abrir esta página como <code>?clienteId=123</code>
              </p>
            </div>
          )}

          {loadingCliente ? (
            <p className="text-slate-500 text-sm">Cargando cliente...</p>
          ) : cliente ? (
            <div className="rounded-lg border border-slate-200 p-3 sm:p-4 mb-6 relative">
              <button
                type="button"
                onClick={() => {
                  setCliente(null);
                  setClienteId(null);
                  setClienteIdInput("");
                  setPlan(null);
                  setMontoTotal(0);
                  setMesesSeleccionados([]);
                  setModoMultiplesMeses(false);
                }}
                className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600"
                title="Cambiar cliente"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-slate-500">Cliente</p>
                  <p className="font-semibold">{cliente.nombre}</p>
                  <p className="text-sm text-slate-600">{cliente.telefono}</p>
                  <p className="text-sm text-slate-600 break-words">{cliente.direccion}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Plan</p>
                  <p className="font-semibold">{plan?.nombre || "—"}</p>
                  <p className="text-sm">
                    Precio mensual: <span className="font-semibold">L.{fmt(plan?.precio_mensual)}</span>
                  </p>
                </div>
              </div>

              {!modoMultiplesMeses && (
                <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                  {mesMasAntiguoPendiente ? (
                    <>
                      Este pago se acreditará al <b>mes más antiguo pendiente</b>: {monthNames[mesMasAntiguoPendiente.mes - 1]} {mesMasAntiguoPendiente.anio}.{" "}
                      <i>Si ese mes estuviera suspendido, se aplicará automáticamente al último mes pendiente no suspendido.</i>
                    </>
                  ) : (
                    <>
                      Este cliente está al día. El pago se acreditará al <b>próximo mes</b> ({monthNames[getProximoMesYAno().mes - 1]} {getProximoMesYAno().anio}).
                    </>
                  )}
                  {!!mesMasAntiguoPendiente && planPrecioMensual > 0 && (
                    <div className="mt-2 text-xs">
                      Mensualidad: <b>L.{fmt(planPrecioMensual)}</b>. Abonado acumulado:{" "}
                      <b>L.{fmt(totalPagadoMesObjetivo)}</b>. Saldo pendiente:{" "}
                      <b>L.{fmt(saldoPendienteMesObjetivo)}</b>.
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCliente(null);
                    setClienteId(null);
                    setClienteIdInput("");
                    setPlan(null);
                    setMontoTotal(0);
                    setMesesSeleccionados([]);
                    setModoMultiplesMeses(false);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Cambiar de cliente
                </button>
              </div>
            </div>
          ) : clienteId ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
              <p className="text-red-600 font-medium mb-2">No se pudo cargar el cliente con ID: {clienteId}</p>
              <button
                type="button"
                onClick={() => {
                  setClienteId(null);
                  setClienteIdInput("");
                  setCliente(null);
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Intentar con otro cliente
              </button>
            </div>
          ) : null}

          {cliente && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Pago</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input type="radio" checked={!modoMultiplesMeses} onChange={() => setModoMultiplesMeses(false)} className="mr-2" />
                  Pago de un mes
                </label>
                <label className="flex items-center">
                  <input type="radio" checked={modoMultiplesMeses} onChange={() => setModoMultiplesMeses(true)} className="mr-2" />
                  Pago de múltiples meses o clientes suspendidos
                </label>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de pago</label>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Método de pago</label>
              {loadingMetodos ? (
                <select className="w-full px-3 py-2 border rounded-md bg-white" disabled>
                  <option>Cargando métodos...</option>
                </select>
              ) : (
                <select
                  value={metodoId ?? ""}
                  onChange={(e) => setMetodoId(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md bg-white"
                  required
                >
                  <option value="">Seleccionar método</option>
                  {metodosPago.map((metodo) => (
                    <option key={metodo.id} value={metodo.id}>
                      {metodo.descripcion}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {cliente && modoMultiplesMeses && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Meses a pagar ({mesesSeleccionadosCount} seleccionados)
                </label>

                {loadingMeses ? (
                  <p className="text-slate-500">Cargando meses pendientes...</p>
                ) : mesesSeleccionados.length === 0 ? (
                  <p className="text-slate-500">No hay meses pendientes de pago.</p>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          const futuros12 = buildProximosMeses(12);
                          mergeMesesEnSeleccionados(futuros12, false);
                        }}
                        className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                      >
                        Agregar pago de meses adelantados
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleTodosMeses(true)}
                        className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        Seleccionar todos
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTodosMeses(false)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Deseleccionar todos
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border rounded">
                      {mesesSeleccionados.map((mes) => (
                        <label key={`${mes.mes}-${mes.anio}`} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={mes.seleccionado}
                            onChange={() => toggleMesSeleccionado(getMesKey(mes.mes, mes.anio))}
                            className="mr-2"
                          />
                          <span className="text-sm">
                            {monthNames[mes.mes - 1]} {mes.anio}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{modoMultiplesMeses ? "Monto Total" : "Monto a pagar"}</label>
              {/* Sólo lectura: lo calcula el sistema (el saldo del mes, o el
                  plan por la cantidad de meses seleccionados). Si el cliente
                  abona menos, eso se captura en "Recibido" y queda como pago
                  parcial: el monto a pagar no se toca. */}
              <input
                type="text"
                readOnly
                aria-readonly="true"
                tabIndex={-1}
                value={montoTotal > 0 ? `L. ${fmt(montoTotal)}` : "—"}
                className="w-full px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-semibold cursor-not-allowed"
              />
              {modoMultiplesMeses && mesesSeleccionadosCount > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {mesesSeleccionadosCount} mes(es) × L.{fmt(montoPorMes)} = L.{fmt(montoTotal)}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Lo calcula el sistema. Si el cliente abona menos, anotalo en
                &quot;Recibido&quot; y queda como pago parcial.
              </p>
              {!modoMultiplesMeses && <p className="mt-1 text-xs text-slate-500">Sugerido por plan: L.{fmt(plan?.precio_mensual)}</p>}
              {!modoMultiplesMeses && !!mesMasAntiguoPendiente && (
                <p className="mt-1 text-xs text-amber-700">
                  Monto máximo para este mes: L.{fmt(saldoPendienteMesObjetivo)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recibido</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={recibidoTexto}
                onChange={(e) => setRecibidoTexto(soloEnteros(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="mt-1 text-xs text-slate-500">Sólo lempiras enteros, sin centavos.</p>
              <p className={`mt-1 text-sm ${cambio < 0 ? "text-red-600" : "text-slate-700"}`}>
                {cambio < 0 ? "Falta" : "Cambio"}: <span className="font-semibold">L.{fmt(Math.abs(cambio))}</span>
              </p>
              {!modoMultiplesMeses && (
                <p className="mt-1 text-xs text-slate-500">
                  Si el recibido es menor a la mensualidad, se registrará como pago parcial.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Referencia (opcional)</label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="N° transacción, voucher, etc."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones (opcional)</label>
              <textarea
                rows={3}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Notas adicionales sobre el pago..."
              />
            </div>

            <div className="md:col-span-2 mt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={bloquearSubmit}
                className="w-full md:w-auto px-6 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                title={
                  !modoMultiplesMeses && !mesesListos
                    ? "Espera a que carguen los meses pendientes para evitar aplicar el pago al mes incorrecto."
                    : undefined
                }
              >
                {loading
                  ? "Registrando..."
                  : modoMultiplesMeses
                    ? `Registrar ${mesesSeleccionadosCount} Pago(s)`
                    : "Registrar Pago"}
              </button>

              {factura && (
                <button
                  type="button"
                  onClick={() => {
                    void exportarPDF();
                  }}
                  className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Descargar PDF
                </button>
              )}
            </div>
          </form>

          {(okMsg || error) && (
            <div className="mt-4 text-center">
              {okMsg && <p className="text-green-600 font-semibold">{okMsg}</p>}
              {error && <p className="text-red-600 font-semibold">{error}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ====== Plantilla PDF (2 páginas: Original + Copia) ====== */}
      {factura && (
        <div
          ref={pdfRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "210mm",
            background: "white",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <style>{`
            .pdf-wrap { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #0f172a; }
            .pdf-page { width: 190mm; min-height: 277mm; padding: 10mm; box-sizing: border-box; margin: 0 auto; }
            .pdf-page + .pdf-page { page-break-before: always; }
            .pdf-banner { margin-bottom: 8px; }
            .pdf-banner img { display:block; width:100%; height:auto; max-height:28mm; object-fit:contain; }
            .pdf-header { display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px; }
            .pdf-brand { font-size: 18px; font-weight: 800; color: #ea580c; }
            .pdf-title { font-size: 14px; font-weight: 700; color:#334155; }
            .pdf-subtle { color:#475569; font-size:12px; }
            .pdf-box { border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-bottom:12px; }
            .pdf-table { width:100%; border-collapse: collapse; font-size:12px; }
            .pdf-table th, .pdf-table td { border:1px solid #e2e8f0; padding:8px; text-align:left; }
            .pdf-footer { display:flex; justify-content: space-between; margin-top: 18px; font-size:12px; color:#334155; }
            .h-sep { height:8px; }
          `}</style>

          {["Factura original", "Copia"].map((etiqueta, idx) => (
            <div className="pdf-wrap pdf-page" key={idx}>
              <div className="pdf-banner">
                <img src="/img/ON-NET-BANNER.png" alt="ON-NET" crossOrigin="anonymous" />
              </div>

              <div className="pdf-header">
                <div className="pdf-brand">ONNET Gestión de Cobros</div>
                <div>
                  <div className="pdf-title">{etiqueta}</div>
                  <div className="pdf-subtle">N.º {factura.numero || "—"}</div>
                </div>
              </div>

              <div className="pdf-box">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div className="pdf-title" style={{ marginBottom: 6 }}>
                      Datos del cliente
                    </div>
                    <div className="pdf-subtle">
                      <b>Nombre:</b> {factura.cliente.nombre || "—"}
                    </div>
                    <div className="pdf-subtle">
                      <b>Teléfono:</b> {factura.cliente.telefono || "—"}
                    </div>
                    <div className="pdf-subtle">
                      <b>Dirección:</b> {factura.cliente.direccion || "—"}
                    </div>
                  </div>
                  <div style={{ width: 260 }}>
                    <div className="pdf-title" style={{ marginBottom: 6 }}>
                      Datos del cobro
                    </div>
                    <div className="pdf-subtle">
                      <b>Fecha:</b> {factura.fechaEmision}
                    </div>
                    <div className="pdf-subtle">
                      <b>Método:</b> {factura.metodoPago}
                    </div>
                    {factura.referencia && (
                      <div className="pdf-subtle">
                        <b>Referencia:</b> {factura.referencia}
                      </div>
                    )}
                    {factura.plan?.nombre && (
                      <div className="pdf-subtle">
                        <b>Plan:</b> {factura.plan.nombre}{" "}
                        {factura.plan?.precio_mensual ? `(L.${fmt(factura.plan.precio_mensual)}/mes)` : ""}
                      </div>
                    )}
                    {factura.estadoPago && (
                      <div className="pdf-subtle">
                        <b>Estado:</b> {factura.estadoPago}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pdf-box">
                <div className="pdf-title" style={{ marginBottom: 6 }}>
                  Detalle del pago
                </div>
                {factura.tipo === "multiple" ? (
                  <table className="pdf-table">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th>Año</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(factura.meses || []).map((m, i) => (
                        <tr key={`${m.mes}-${m.anio}-${i}`}>
                          <td>{monthNames[m.mes - 1]}</td>
                          <td>{m.anio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="pdf-table">
                    <thead>
                      <tr>
                        <th>Mes aplicado</th>
                        <th>Año</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{monthNames[(factura.mes_aplicado || 1) - 1]}</td>
                        <td>{factura.anio_aplicado}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                <div className="h-sep" />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 24 }}>
                  {factura.montoPlan ? (
                    <div className="pdf-subtle">
                      <b>Mensualidad:</b> L.{fmt(factura.montoPlan)}
                    </div>
                  ) : null}
                  <div className="pdf-subtle">
                    <b>Total:</b> L.{fmt(factura.total)}
                  </div>
                  <div className="pdf-subtle">
                    <b>Recibido:</b> L.{fmt(factura.recibido)}
                  </div>
                  <div className="pdf-subtle">
                    <b>{factura.cambio < 0 ? "Falta" : "Cambio"}:</b> L.{fmt(Math.abs(factura.cambio))}
                  </div>
                </div>
                {factura.estadoPago === "Pagado Parcial" && (
                  <div className="pdf-subtle" style={{ marginTop: 6, textAlign: "right" }}>
                    <b>Saldo pendiente del mes:</b> L.{fmt(factura.saldoPendienteMes)}
                  </div>
                )}
              </div>

              {factura.observacion && (
                <div className="pdf-box">
                  <div className="pdf-title" style={{ marginBottom: 6 }}>
                    Observaciones
                  </div>
                  <div className="pdf-subtle">{factura.observacion}</div>
                </div>
              )}

              <div className="pdf-footer">
                <div>Gracias por su pago.</div>
                <div>Generado por ONNET · {new Date().toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
