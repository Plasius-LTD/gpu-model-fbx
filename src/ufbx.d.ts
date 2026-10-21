declare module "*.mjs" {
  const factory: (options: unknown) => Promise<unknown>;
  export default factory;
}
