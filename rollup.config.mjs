// import typescript from "rollup-plugin-typescript2";
import typescript from "@rollup/plugin-typescript";
import pkg from "./package.json" assert { type: "json" };

// export default {
//   input: "src/index.ts",
//   output: {
//     dir: "output",
//     format: "cjs",
//   },
//   plugins: [typescript()],
// };

export default {
  input: "src/index.ts",
  output: [
    {
      file: pkg.main,
      format: "cjs",
    },
    {
      file: pkg.module,
      format: "es",
    },
  ],
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
  plugins: [typescript()],
};
