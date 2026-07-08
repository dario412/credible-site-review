import { readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SNIPPET = `
<!-- Credible Review Mode -->
<link rel="stylesheet" href="/css/review.css">
<script src="/js/auth-guard.js"></script>
<script src="/js/review.js" defer></script>
`;

const MARKER = '<!-- Credible Review Mode -->';

async function main() {
  const files = (await readdir(root)).filter((f) => f.endsWith('.html'));
  let updated = 0;

  for (const file of files) {
    if (file === 'login.html') continue;

    const path = join(root, file);
    let html = await readFile(path, 'utf-8');

    if (html.includes(MARKER)) {
      console.log(`Skip (already injected): ${file}`);
      continue;
    }

    if (!html.includes('</body>')) {
      console.warn(`No </body> in ${file}`);
      continue;
    }

    html = html.replace('</body>', `${SNIPPET}\n</body>`);
    await writeFile(path, html);
    console.log(`Injected: ${file}`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} file(s).`);
}

main().catch(console.error);
