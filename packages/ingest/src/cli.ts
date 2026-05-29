import { createSourcePackManifest } from "./index";

const targetPath = process.argv[2];

if (!targetPath) {
  console.error("Usage: pnpm ingest <source-pack-path>");
  process.exit(1);
}

const manifest = await createSourcePackManifest(targetPath);

console.log(JSON.stringify(manifest, null, 2));
