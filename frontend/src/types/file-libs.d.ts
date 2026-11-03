// Versão para navegador do mammoth (leitura de .docx), que não traz tipos.
declare module "mammoth/mammoth.browser.min.js" {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}
