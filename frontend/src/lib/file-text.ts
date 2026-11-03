/**
 * Tira o texto de um arquivo no próprio navegador (PDF, Word .docx, .txt e
 * .md). Só o texto segue para o servidor; o arquivo não é enviado. As
 * bibliotecas de PDF e Word são pesadas e só carregam quando alguém importa
 * um arquivo.
 */

export const FILE_TEXT_ACCEPT = ".pdf,.docx,.txt,.md";

function extensionOf(name: string) {
  return name.toLowerCase().split(".").pop() || "";
}

async function readPdf(data: ArrayBuffer) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : "");
    }
    pages.push(text.trim());
  }
  await document.loadingTask.destroy();
  return pages.filter(Boolean).join("\n\n");
}

async function readDocx(data: ArrayBuffer) {
  const mammoth = (await import("mammoth/mammoth.browser.min.js")).default;
  return (await mammoth.extractRawText({ arrayBuffer: data })).value;
}

/** Devolve o texto do arquivo. Lança um erro com mensagem pronta para mostrar. */
export async function readFileText(file: File) {
  const extension = extensionOf(file.name);
  let text: string;

  if (extension === "txt" || extension === "md") {
    text = await file.text();
  } else if (extension === "pdf") {
    text = await readPdf(await file.arrayBuffer());
  } else if (extension === "docx") {
    text = await readDocx(await file.arrayBuffer());
  } else {
    throw new Error("Formato não aceito. Use PDF, Word (.docx), .txt ou .md.");
  }

  // Linhas em branco em excesso só gastam espaço da base.
  text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error(
      "Não encontrei texto neste arquivo. PDF escaneado (imagem) não tem texto para ler: cole o conteúdo à mão.",
    );
  }
  return text;
}
