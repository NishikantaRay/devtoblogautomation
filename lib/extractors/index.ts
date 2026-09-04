import type { ExtractablePlatform } from "@/lib/types";
import type { Extractor } from "./types";
import { mediumExtractor } from "./medium";
import { hashnodeExtractor } from "./hashnode";
import { devtoExtractor } from "./devto";
import { wordpressExtractor } from "./wordpress";
import { ghostExtractor } from "./ghost";
import { bloggerExtractor } from "./blogger";
import { substackExtractor } from "./substack";
import { genericExtractor } from "./generic";

const EXTRACTORS: Record<ExtractablePlatform, Extractor> = {
  medium: mediumExtractor,
  hashnode: hashnodeExtractor,
  devto: devtoExtractor,
  wordpress: wordpressExtractor,
  ghost: ghostExtractor,
  blogger: bloggerExtractor,
  substack: substackExtractor,
  generic: genericExtractor,
};

export function getExtractor(platform: ExtractablePlatform): Extractor {
  return EXTRACTORS[platform];
}

export { genericExtractor };
