import { defineConfig, loadEnv, transformWithEsbuild } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");
  return {
    root: ".",
    base: "./",
    publicDir: "public",
    plugins: [
      {
        name: "jsx-in-js",
        async transform(code, id) {
          if (/\/src\/.*\.jsx?$/.test(id))
            return transformWithEsbuild(code, id, {
              loader: "jsx",
              jsx: "automatic",
            });
        },
      },
    ],
    optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
    define: {
      "process.env.REACT_APP_GAS_URL": JSON.stringify(
        env.REACT_APP_GAS_URL || "",
      ),
    },
    build: { outDir: "dist", emptyOutDir: true },
    server: { fs: { allow: [".."] } },
    test: {
      root: ".",
      environment: "jsdom",
      include: ["tests/**/*.test.jsx"],
      restoreMocks: true,
    },
  };
});
