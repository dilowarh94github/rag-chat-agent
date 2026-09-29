import { pipeline } from "@huggingface/transformers";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID, QUERY_PREFIX } from "./embedding-config.mjs";

let extractorPromise: Promise<FeatureExtractionPipeline> | undefined;

async function getExtractor() {
  extractorPromise ??= pipeline("feature-extraction", EMBEDDING_MODEL_ID);
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(`${QUERY_PREFIX}${text}`, { pooling: "mean", normalize: true });
  const embedding = output.tolist()[0] as number[] | undefined;

  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimensional embedding.`);
  }

  return embedding;
}
