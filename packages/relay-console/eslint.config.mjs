import reactConfig from "@multica/eslint-config/react";

// The shared base config is enough for phantom-dependency enforcement, but it
// has no JSX rules: the console renders with ink, so every package in this
// repo that carries `.tsx` (packages/core, apps/ui-lab) layers the react preset
// on top. The react preset only adds JSX/hooks lint rules — nothing it enables
// assumes a DOM, so it is safe for a Node-only terminal program.
//
// `tsconfig.json` has to include `DOM` in `lib` because @multica/core exports
// raw TypeScript whose sources reference DOM names. That reopens the door to
// using a browser global by accident, so the Node-only guarantee is enforced
// here instead: `no-restricted-globals` fails the build on a bare reference to
// a browser global. It catches bare identifiers, not `globalThis.document`
// property access — which is the right trade, since core's own guarded
// `typeof document !== "undefined"` check relies on the identifier form.
const DOM_GLOBALS = [
  "alert",
  "confirm",
  "document",
  "localStorage",
  "location",
  "navigator",
  "prompt",
  "sessionStorage",
  "window",
].map((name) => ({
  name,
  message: `relay-console is a Node program — '${name}' does not exist at runtime.`,
}));

export default [
  ...reactConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...DOM_GLOBALS],
    },
  },
];
