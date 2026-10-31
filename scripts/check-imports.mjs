import fs from 'node:fs';
import path from 'node:path';

const D = '$' + '$';
const dir = 'client/js';
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js'));

const sources = new Map();
for (const name of files) sources.set(name, fs.readFileSync(path.join(dir, name), 'utf8'));

const exportedNames = new Set();
for (const source of sources.values()) {
  const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  let match;
  while ((match = re.exec(source))) exportedNames.add(match[1]);
}

let problems = 0;

for (const [name, source] of sources) {
  const imported = new Set();
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
  let match;
  while ((match = importRe.exec(source))) {
    for (const raw of match[1].split(',')) {
      const id = raw.trim().split(/\s+as\s+/).pop();
      if (id) imported.add(id);
    }
  }

  const declared = new Set();
  const declRe = /(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((match = declRe.exec(source))) declared.add(match[1]);

  const usesDouble = new RegExp('(^|[^\\w$])' + D.replace(/\$/g, '\\$') + '\\s*\\(').test(source);
  if (usesDouble && !imported.has(D) && !declared.has(D)) {
    console.log(`  ! ${name}: использует ${D} без импорта/объявления`);
    problems += 1;
  }

  for (const id of imported) {
    if (!exportedNames.has(id)) {
      console.log(`  ! ${name}: импортирует «${id}», но экспорта нет`);
      problems += 1;
    }
  }
}

console.log(problems ? `\nПроблем: ${problems}` : '\nИмпорты в порядке');
process.exitCode = problems ? 1 : 0;
