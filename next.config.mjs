/** @type {import('next').NextConfig} */
const nextConfig = {
  // La ruta /api/events lee data/kit y data/sample con fs (botones "Cargar kit
  // oficial" / "Ejemplo extra"). En Vercel solo se suben los archivos que se
  // declaran aqui; sin esto esos botones fallan en produccion.
  outputFileTracingIncludes: {
    '/api/events': ['./data/kit/**/*', './data/sample/**/*'],
  },
}

export default nextConfig
