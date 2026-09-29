import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@huggingface/transformers';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from '../lib/embedding-config.mjs';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPDFIngestion() {
  const pdfFilePath = path.resolve('document.pdf'); // Name of your multi-page PDF file
  const source = path.basename(pdfFilePath);

  console.log(`Checking for ${pdfFilePath}...`);
  if (!fs.existsSync(pdfFilePath)) {
    console.error(`Error: ${pdfFilePath} not found in the root directory!`);
    return;
  }

  // 1. Read the PDF file into a buffer chunk
  const dataBuffer = fs.readFileSync(pdfFilePath);

  console.log('Extracting text content from multi-page PDF...');
  
  // 2. Parse text out of all pages
  const parser = new PDFParse({ data: dataBuffer });
  let parsedPdf;
  try {
    parsedPdf = await parser.getText();
  } finally {
    await parser.destroy();
  }
  console.log(`Successfully extracted text from ${parsedPdf.total} pages.`);

  // 3. Split the entire text corpus into smaller contextual overlaps
  const splitter = new RecursiveCharacterTextSplitter({ 
    chunkSize: 600, // 600 characters fits well for technical document contexts
    chunkOverlap: 60 
  });
  const documentChunks = [];
  for (const page of parsedPdf.pages) {
    const pageChunks = await splitter.splitText(page.text);
    pageChunks.forEach((content, chunkIndex) => {
      documentChunks.push({ content, source, page_number: page.num, chunk_index: chunkIndex });
    });
  }
  console.log(`Split text corpus into ${documentChunks.length} distinct chunks. Generating embeddings...`);

  // 4. Generate embeddings locally (the Supabase column expects 1024 dimensions)
  console.log('Loading the local embedding model (first run downloads it)...');
  const embeddingsModel = await pipeline('feature-extraction', EMBEDDING_MODEL_ID);
  const embeddings = [];
  const embeddingBatchSize = 4;
  for (let i = 0; i < documentChunks.length; i += embeddingBatchSize) {
    const batch = documentChunks.slice(i, i + embeddingBatchSize).map(({ content }) => content);
    const output = await embeddingsModel(batch, { pooling: 'mean', normalize: true });
    embeddings.push(...output.tolist());
  }
  if (embeddings.length !== documentChunks.length || embeddings.some((embedding) => embedding.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(`Embedding model output must contain ${EMBEDDING_DIMENSIONS}-dimensional vectors for every chunk.`);
  }

  // 5. Structure data rows for our database structure
  const rows = documentChunks.map((chunk, i) => ({
    ...chunk,
    chunk_id: createHash('sha256')
      .update(`${chunk.source}:${chunk.page_number}:${chunk.chunk_index}:${chunk.content}`)
      .digest('hex'),
    embedding: embeddings[i],
  }));

  console.log('Uploading vector coordinates into Supabase table rows...');
  const uploadBatchSize = 100;
  for (let i = 0; i < rows.length; i += uploadBatchSize) {
    const batch = rows.slice(i, i + uploadBatchSize);
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await supabase.from('documents').upsert(batch, { onConflict: 'chunk_id' });
      if (!error) {
        lastError = undefined;
        break;
      }
      lastError = error;
      console.error(`Upload batch ${Math.floor(i / uploadBatchSize) + 1} failed (attempt ${attempt}/3):`, error.message);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
    if (lastError) throw new Error(`Supabase upload failed: ${lastError.message}`);
    console.log(`Uploaded ${Math.min(i + batch.length, rows.length)} / ${rows.length} chunks.`);
  }

  // Remove pre-metadata rows only after every replacement chunk has uploaded successfully.
  const { error: cleanupError } = await supabase
    .from('documents')
    .delete()
    .eq('source', source)
    .like('chunk_id', 'legacy-%');
  if (cleanupError) {
    throw new Error(`Chunks were uploaded, but legacy rows could not be cleaned up: ${cleanupError.message}`);
  }

  console.log(`🎉 Success! Loaded ${rows.length} PDF chunks into your database context.`);
}

runPDFIngestion().catch((error) => {
  console.error('PDF ingestion failed:', error);
  process.exitCode = 1;
});
