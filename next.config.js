/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['ffmpeg-static'],
  // The app uses no next/image; turning the optimizer off removes that endpoint's attack surface.
  images: { unoptimized: true }
};
