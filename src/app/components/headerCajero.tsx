const HeaderCajero = () => {
  const handleLogout = () => {
    window.location.href = "/pages/login";
  };

  return (
    <header className="w-full bg-[#00AEEF] py-2 shadow-md">
      <div className="flex justify-between items-center px-4">
        <img
          src="/img/ON-NET-BANNER.jpeg"
          alt="ON-Net Wireless Banner"
          className="h-20 w-auto object-contain"
        />
        <button
          onClick={handleLogout}
          className="bg-white text-[#00AEEF] font-semibold px-4 py-2 rounded-full shadow hover:bg-gray-100 transition text-sm"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
};

export default HeaderCajero;