import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    target: "es2020",
    // Hashed build output is kept out of /assets so that static artwork
    // copied from public/ (which is not content-hashed) can be cached
    // under a different, revalidating policy. See netlify.toml.
    assetsDir: "build",
  },
});
