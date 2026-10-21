import ts from "typescript";
/** Decode only the generated literal's syntax; never execute generated JavaScript. */
export function wasmBytes(glue) {
  const ast = ts.createSourceFile("ufbx.mjs", glue.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let wasm;
  function inspect(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "findWasmBinary") {
      const value = node.body?.statements[0]?.expression?.arguments?.[0];
      if (value && ts.isStringLiteral(value)) wasm = value.text.startsWith("data:") ? Buffer.from(value.text.split(",")[1], "base64") : Buffer.from(value.text, "latin1");
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
  if (!wasm || !WebAssembly.validate(wasm)) throw new Error("Expected valid embedded WASM, no resource fetch");
  return wasm;
}
