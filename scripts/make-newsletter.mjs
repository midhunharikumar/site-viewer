#!/usr/bin/env node
// Generate a weekly-newsletter DRAFT from real repo data and write it to a file
// for review. The heavy lifting lives in scripts/lib/newsletter.mjs (shared with
// the Vercel cron). Numbers are deterministic; the LLM only writes the intro.
//
//   npm run draft                       # writes newsletter/<today>.md (LLM if key set)
//   npm run draft -- --no-llm           # deterministic only, no API call
//   npm run draft -- --out my.md --movers 6 --launches 5
//   npm run draft -- --model anthropic/claude-haiku-4.5

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildNewsletter } from './lib/newsletter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { out: null, noLlm: false, model: null, movers: 5, launches: 5 };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--no-llm') a.noLlm = true;
    else if (v === '--out') a.out = argv[++i];
    else if (v === '--model') a.model = argv[++i];
    else if (v === '--movers') a.movers = parseInt(argv[++i], 10) || 5;
    else if (v === '--launches') a.launches = parseInt(argv[++i], 10) || 5;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const { markdown, facts, subject, via } = await buildNewsletter(args);
  const outPath = args.out || join(ROOT, 'newsletter', `${facts.date}.md`);

  await writeFile(outPath, markdown);
  console.log(`✅ Draft written: ${outPath}`);
  console.log(`   via: ${via}`);
  console.log(`   facts: ${facts.movers.length} movers, ${facts.launches.length} launches, heat updated ${facts.heat.updated}\n`);
  console.log('--- preview ---\n' + markdown.slice(0, 900) + (markdown.length > 900 ? '\n…' : ''));
  console.log('\nNext: review/edit the file, then send:');
  console.log(`  npm run newsletter -- --draft "${outPath}" --subject "${subject}"`);
  console.log('  (add --to you@email.com --send to test on yourself first)');
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
