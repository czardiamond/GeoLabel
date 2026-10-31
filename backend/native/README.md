# Expat for the Vercel Python runtime

Rasterio/GDAL requires `libexpat.so.1`, which is absent from the minimal Vercel Python runtime. GeoLabel includes this small Linux x86_64 shared library rather than disabling raster processing. `backend.native_runtime` checks its recorded SHA-256 and preloads the library before Rasterio imports on Vercel. Local development continues to use the host environment.

This artifact was built from the official [Expat 2.9.0 release](https://github.com/libexpat/libexpat/releases/tag/R_2_9_0), which includes security fixes. Its unmodified MIT license is in `EXPAT-LICENSE`.

- Source archive: `https://github.com/libexpat/libexpat/releases/download/R_2_9_0/expat-2.9.0.tar.xz`
- Source SHA-256: `1e6371862cc31999b368c3b89b49994f0677e1bab5f1b2b85ae3741f5d803051`
- Binary SHA-256: recorded in `libexpat.sha256` and checked at startup.
- Runtime target: Linux x86_64, glibc 2.34 or older symbol requirements. The build rejects newer requirements.

Rebuild from the repository root on Linux x86_64 with `bash tools/build_native_expat.sh`. This requires a C compiler, make, curl, tar, strip and readelf. The script verifies the pinned official source before compiling, disables newer glibc-only entropy interfaces, retains Linux `getrandom`, and copies the license. Review Expat security releases and update the source version/checksum plus tests when upgrading; do not replace this artifact with an arbitrary system library from a newer Linux distribution.
