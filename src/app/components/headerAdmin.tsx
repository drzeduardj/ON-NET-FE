"use client";

export default function HeaderAdmin({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void;
}) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-[#00AEEF] py-3 px-4 shadow-md flex items-center justify-between">
      {/* Botón hamburguesa (móvil) — opcional */}
      <button
        onClick={onToggleSidebar}
        aria-label="Abrir / cerrar menú"
        className="md:hidden inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition px-2 py-2"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex items-center">
        <img
          src="/img/ON-NET-BANNER.jpeg"
          alt="ON-Net Wireless Banner"
          className="h-10 w-auto object-contain sm:h-12"
        />
      </div>

      <div>
        <button
          onClick={() => (window.location.href = "/pages/login")}
          className="bg-white text-[#00AEEF] font-semibold px-4 py-2 rounded-full shadow hover:bg-gray-100 transition text-sm"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
