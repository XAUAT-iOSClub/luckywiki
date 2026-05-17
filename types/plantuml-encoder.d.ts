declare module "plantuml-encoder" {
  function encode(source: string): string;
  function decode(encoded: string): string;
  export { decode, encode };
  const encoder: { encode: typeof encode; decode: typeof decode };
  export default encoder;
}
