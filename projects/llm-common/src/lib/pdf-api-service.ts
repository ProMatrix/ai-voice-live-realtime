import { Injectable } from '@angular/core';
import OpenAI from 'openai';
import { MODEL_NAME, PROFILES_URL } from './constants';
import {
  IAppraisalSummaryData,
  IAppraisalSummaryField,
  IPdfAssistantConfig,
  IPdfFileReference,
  IProfile,
  defaultProfile,
} from './interfaces';

const PDF_FILE_READY_POLL_INTERVAL_MS = 1000;
const PDF_FILE_READY_TIMEOUT_MS = 30000;
const APPRAISAL_SUMMARY_CACHE_VERSION = 'v2';

@Injectable({ providedIn: 'root' })
export class PdfApiService {
  private profile = defaultProfile;
  private config: IPdfAssistantConfig | null = null;
  private openai: OpenAI | null = null;
  private uploadedFiles: IPdfFileReference[] = [];
  private uploadedSourceKey: string | null = null;
  private selectedPdfFiles: File[] = [];
  private isInitialized = false;

  public initialize(profile: IProfile, config: IPdfAssistantConfig): void {
    this.profile = profile;
    this.config = config;

    if (profile.pdf_file?.trim()) {
      this.selectedPdfFiles = [];

      if (this.uploadedSourceKey !== this.getProfileSourceKey()) {
        this.uploadedFiles = [];
        this.uploadedSourceKey = null;
      }
    } else if (this.selectedPdfFiles.length === 0) {
      this.uploadedFiles = [];
      this.uploadedSourceKey = null;
    }

    this.startup();
    this.isInitialized = true;
  }

  public setUploadedPdfFiles(files: File[]): void {
    this.selectedPdfFiles = [...files];

    if (this.uploadedSourceKey !== this.getSelectedFilesSourceKey()) {
      this.uploadedFiles = [];
      this.uploadedSourceKey = null;
    }
  }

  public clearUploadedPdfFiles(): void {
    this.selectedPdfFiles = [];

    if (!this.profile.pdf_file?.trim()) {
      this.uploadedFiles = [];
      this.uploadedSourceKey = null;
    }
  }

  public getPreparedPdfFiles(): IPdfFileReference[] {
    return [...this.uploadedFiles];
  }

  public async prepareProfilePdfForSession(
    onProgress?: (fileNumber: number, percent: number) => void,
  ): Promise<string[]> {
    this.ensureInitialized();

    const pdfPath = this.profile.pdf_file?.trim();
    const selectedFiles = this.selectedPdfFiles;

    if (pdfPath) {
      const sourceKey = this.getProfileSourceKey();

      if (
        this.uploadedFiles.length > 0 &&
        !this.profile.pdf_flush &&
        this.uploadedSourceKey === sourceKey
      ) {
        console.log(
          `[PdfApiService] PDF ready: reusing uploaded file ${this.uploadedFiles.map((file) => file.fileId).join(', ')}.`,
        );
        onProgress?.(1, 100);
        return this.uploadedFiles.map((file) => file.fileId);
      }

      console.log(`[PdfApiService] Uploading PDF: ${pdfPath}`);
      onProgress?.(1, 10);
      const file = await this.fetchProfilePdfAsFile(pdfPath);
      onProgress?.(1, 55);

      return this.uploadPdfFiles([file], sourceKey, onProgress);
    }

    if (selectedFiles.length === 0) {
      throw new Error(
        'No uploaded PDF document is available yet. Ask the user to choose one or more PDF files first.',
      );
    }

    const sourceKey = this.getSelectedFilesSourceKey();

    if (
      this.uploadedFiles.length > 0 &&
      !this.profile.pdf_flush &&
      this.uploadedSourceKey === sourceKey
    ) {
      console.log(
        `[PdfApiService] PDF ready: reusing uploaded files ${this.uploadedFiles.map((file) => file.fileId).join(', ')}.`,
      );
      onProgress?.(selectedFiles.length, 100);
      return this.uploadedFiles.map((file) => file.fileId);
    }

    return this.uploadPdfFiles(selectedFiles, sourceKey, onProgress);
  }

  public async getAppraisalSummaryData(
    dataInstructions: string,
    onProgress?: (fileNumber: number, percent: number) => void,
  ): Promise<Array<{ fileName: string; data: IAppraisalSummaryData }>> {
    this.ensureInitialized();

    await this.prepareProfilePdfForSession();
    const preparedFiles = this.getPreparedPdfFiles();
    const summaries: Array<{ fileName: string; data: IAppraisalSummaryData }> = [];

    for (const [index, file] of preparedFiles.entries()) {
      const fileNumber = index + 1;
      const cacheKey = this.getSummaryCacheKey(file.fileName);
      const cachedSummary = localStorage.getItem(cacheKey);

      if (cachedSummary) {
        const parsedSummary = this.parseAppraisalSummaryPayload(cachedSummary);
        summaries.push({ fileName: file.fileName, data: parsedSummary });
        onProgress?.(fileNumber, 100);
        continue;
      }

      onProgress?.(fileNumber, 15);
      const summaryData = await this.extractAppraisalSummaryData(file.fileId, dataInstructions);
      localStorage.setItem(cacheKey, JSON.stringify(summaryData));
      summaries.push({ fileName: file.fileName, data: summaryData });
      onProgress?.(fileNumber, 100);
    }

    return summaries;
  }

  public async askQuestionAboutUploadedPdf(
    question: string,
    instructions = 'Answer only from the uploaded PDF document.',
  ): Promise<string> {
    this.ensureInitialized();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      throw new Error('A non-empty PDF question is required.');
    }

    const fileIds = await this.prepareProfilePdfForSession();
    const client = this.getClient();
    try {
      const content: Array<
        { type: 'input_file'; file_id: string } | { type: 'input_text'; text: string }
      > = fileIds.map((fileId) => ({
        type: 'input_file',
        file_id: fileId,
      }));

      content.push({
        type: 'input_text',
        text: trimmedQuestion,
      });

      const response = await client.responses.create({
        model: this.config?.pdfApiModel || MODEL_NAME,
        instructions,
        input: [
          {
            role: 'user',
            content,
          },
        ],
      });

      return (
        response.output_text?.trim() || 'I could not find an answer in the uploaded PDF documents.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('PDF responses.create failed:', {
        model: this.config?.pdfApiModel || MODEL_NAME,
        fileIds,
        error,
      });

      if (message.includes('404')) {
        throw new Error(
          `PDF analysis failed because the configured model or deployment was not found on the Responses endpoint. Current PDF model: ${this.config?.pdfApiModel || MODEL_NAME}. Check the Vision Deployment setting and ensure that deployment supports Responses API calls.`,
        );
      }

      if (message.includes('400')) {
        throw new Error(
          `PDF analysis request was rejected by the Responses API. The uploaded file may still be processing, the deployment may not support PDF input_file content, or the file was uploaded with an unsupported purpose. Current PDF model: ${this.config?.pdfApiModel || MODEL_NAME}. Check the browser console for the detailed server error.`,
        );
      }

      throw error;
    }
  }

  private startup(): void {
    if (!this.config) {
      console.error('PDF API configuration is missing.');
      return;
    }

    try {
      this.openai = new OpenAI({
        baseURL: this.config.pdfApiEndpoint,
        apiKey: this.config.pdfApiKey,
        dangerouslyAllowBrowser: true,
      });
    } catch (error) {
      console.error('Error initializing PDF API client:', error);
      throw error;
    }
  }

  private getClient(): OpenAI {
    if (!this.config) {
      throw new Error('PDF API configuration is missing.');
    }

    if (!this.openai) {
      this.startup();
    }

    if (!this.openai) {
      throw new Error('OpenAI client could not be created for PDF operations.');
    }

    return this.openai;
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.config) {
      throw new Error('PdfApiService was used before initialize() completed.');
    }
  }

  private async uploadPdfFiles(
    files: File[],
    sourceKey: string,
    onProgress?: (fileNumber: number, percent: number) => void,
  ): Promise<string[]> {
    const client = this.getClient();
    const uploadedFiles: IPdfFileReference[] = [];

    for (const [index, file] of files.entries()) {
      const fileNumber = index + 1;
      console.log(`[PdfApiService] Uploading PDF ${fileNumber}/${files.length}: ${file.name}`);
      onProgress?.(fileNumber, 75);

      const uploaded = await client.files.create({
        file,
        purpose: 'assistants',
      });

      console.log(`[PdfApiService] Processing PDF ${fileNumber}/${files.length}: ${uploaded.id}`);
      await this.waitForFileToBecomeReady(uploaded.id);
      uploadedFiles.push({ fileId: uploaded.id, fileName: file.name });
      onProgress?.(fileNumber, 100);
    }

    this.uploadedFiles = uploadedFiles;
    this.uploadedSourceKey = sourceKey;
    console.log(
      `[PdfApiService] PDF ready: ${uploadedFiles.map((file) => file.fileId).join(', ')}`,
    );
    return uploadedFiles.map((file) => file.fileId);
  }

  private async extractAppraisalSummaryData(
    fileId: string,
    dataInstructions: string,
  ): Promise<IAppraisalSummaryData> {
    const client = this.getClient();

    try {
      const response = await client.responses.create({
        model: this.config?.pdfApiModel || MODEL_NAME,
        instructions: dataInstructions,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                file_id: fileId,
              },
              {
                type: 'input_text',
                text: 'Extract the appraisal summary data for this PDF and return only the JSON array specified in the instructions.',
              },
            ],
          },
        ],
      });

      const payload = response.output_text?.trim();
      if (!payload) {
        throw new Error('The PDF summary response was empty.');
      }

      return this.parseAppraisalSummaryPayload(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('404')) {
        throw new Error(
          `PDF summary extraction failed because the configured model or deployment was not found on the Responses endpoint. Current PDF model: ${this.config?.pdfApiModel || MODEL_NAME}.`,
        );
      }

      if (message.includes('400')) {
        throw new Error(
          `PDF summary extraction was rejected by the Responses API. The uploaded file may still be processing or the deployment may not support PDF input_file content. Current PDF model: ${this.config?.pdfApiModel || MODEL_NAME}.`,
        );
      }

      throw error;
    }
  }

  private parseAppraisalSummaryPayload(payload: string): IAppraisalSummaryData {
    const normalizedPayload = payload
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsedPayload = JSON.parse(normalizedPayload) as
      | IAppraisalSummaryData
      | IAppraisalSummaryData[];

    if (Array.isArray(parsedPayload)) {
      if (parsedPayload.length === 0) {
        throw new Error('The PDF summary response did not contain any appraisal summary records.');
      }

      return this.normalizeAppraisalSummaryData(parsedPayload[0]);
    }

    return this.normalizeAppraisalSummaryData(parsedPayload);
  }

  private normalizeAppraisalSummaryData(payload: Record<string, unknown>): IAppraisalSummaryData {
    const normalizedData: IAppraisalSummaryData = {};

    for (const [key, value] of Object.entries(payload)) {
      normalizedData[key] = this.normalizeAppraisalSummaryField(value);
    }

    return normalizedData;
  }

  private normalizeAppraisalSummaryField(value: unknown): IAppraisalSummaryField {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const fieldData = value as Record<string, unknown>;
      const fieldValue = fieldData['value'];
      const pageNumber = fieldData['pageNumber'] ?? fieldData['page'];

      return {
        value: this.normalizeAppraisalSummaryString(fieldValue),
        pageNumber: this.normalizeAppraisalSummaryString(pageNumber, 'Unknown'),
      };
    }

    return {
      value: this.normalizeAppraisalSummaryString(value),
      pageNumber: 'Unknown',
    };
  }

  private normalizeAppraisalSummaryString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value == null) {
      return fallback;
    }

    return String(value);
  }

  private async waitForFileToBecomeReady(fileId: string): Promise<void> {
    const client = this.getClient();
    const timeoutAt = Date.now() + PDF_FILE_READY_TIMEOUT_MS;

    while (Date.now() < timeoutAt) {
      const fileInfo = await client.files.retrieve(fileId);
      const fileStatus = (fileInfo as { status?: string }).status;

      if (fileStatus) {
        console.log(`[PdfApiService] PDF file status for ${fileId}: ${fileStatus}`);
      }

      if (!fileStatus || fileStatus === 'processed') {
        return;
      }

      if (fileStatus === 'error' || fileStatus === 'failed') {
        throw new Error(`Uploaded PDF file ${fileId} failed to process.`);
      }

      await this.delay(PDF_FILE_READY_POLL_INTERVAL_MS);
    }

    throw new Error(`Uploaded PDF file ${fileId} was not ready within 30 seconds.`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchProfilePdfAsFile(pdfPath: string): Promise<File> {
    const response = await fetch(`${PROFILES_URL}/${pdfPath}`);

    if (!response.ok) {
      throw new Error(`Failed to load the profile PDF from ${pdfPath}.`);
    }

    const blob = await response.blob();
    const fileName = pdfPath.split('/').pop() || 'document.pdf';
    const fileType = blob.type || 'application/pdf';

    return new File([blob], fileName, {
      type: fileType,
    });
  }

  private getProfileSourceKey(): string {
    return `profile:${this.profile.pdf_file.trim()}`;
  }

  private getSummaryCacheKey(fileName: string): string {
    return `${this.profile.profile_id}:appraisal-summary-data:${APPRAISAL_SUMMARY_CACHE_VERSION}:${fileName}`;
  }

  private getSelectedFilesSourceKey(): string {
    const fileSignature = this.selectedPdfFiles
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .join('|');

    return `upload:${fileSignature}`;
  }
}
