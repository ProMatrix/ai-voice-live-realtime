import * as pdfjsLib from 'pdfjs-dist';

// Set worker source to a local asset
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';

/**
 * Processes a loaded PDF document and converts its pages to JPG images.
 * @param pdf The loaded PDF document proxy.
 * @returns A Promise that resolves to an array of objects containing pageNumber and jpgDataUrl.
 */
async function processPdfDocument(
  pdf: pdfjsLib.PDFDocumentProxy,
): Promise<{ pageNumber: number; jpgDataUrl: string }[]> {
  const totalPages = pdf.numPages;
  const results: { pageNumber: number; jpgDataUrl: string }[] = [];
  const promises: Promise<void>[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    promises.push(
      (async () => {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not get 2d context from canvas');
        }
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await page.render(renderContext).promise;
        const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.9);

        results.push({ pageNumber: pageNum, jpgDataUrl });
      })(),
    );
  }

  await Promise.all(promises);

  // Sort results by page number as parallel execution can mix up the order
  results.sort((a, b) => a.pageNumber - b.pageNumber);

  return results;
}

/**
 * Converts a PDF file to JPG images.
 * @param pdfUrl The URL of the PDF to be converted.
 * @returns A Promise that resolves to an array of objects containing pageNumber and jpgDataUrl.
 */
export async function convertPdfUrlToJpg(
  pdfUrl: string,
): Promise<{ pageNumber: number; jpgDataUrl: string }[]> {
  try {
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const results = await processPdfDocument(pdf);
    return results;
  } catch (error: any) {
    console.error('Error converting PDF to JPG:', error);
    throw new Error(`Failed to convert PDF to JPG: ${error.message || error}`);
  }
}

/**
 * Converts a PDF file to JPG images.
 * @param pdfFile The PDF file to be converted.
 * @returns A Promise that resolves to an array of objects containing pageNumber and jpgDataUrl.
 */
export async function convertPdfFileToJpg(
  pdfFile: File,
): Promise<{ pageNumber: number; jpgDataUrl: string }[]> {
  try {
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(pdfFile);
    });

    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    const results = await processPdfDocument(pdf);
    return results;
  } catch (error: any) {
    console.error('Error converting PDF file to JPG:', error);
    throw new Error(`Failed to convert PDF file to JPG: ${error.message || error}`);
  }
}
