const fs = require('fs');
const path = require('path');
const files = [
  'src/routes/bookmarks/+page.server.ts',
  'src/routes/bookmarks/archived/+page.server.ts',
  'src/routes/bookmarks/shared/+page.server.ts',
  'src/routes/bookmarks/new/+page.server.ts',
  'src/routes/bookmarks/[bookmarkId]/edit/+page.server.ts',
  'src/routes/bookmarks/[bookmarkId]/details/+page.server.ts',
  'src/routes/settings/+page.server.ts',
  'src/routes/tags/+page.server.ts',
  'src/lib/server/auth/middleware.ts',
  'src/lib/server/auth/user-upsert.ts',
  'src/lib/server/hono.ts'
];
let totalUpdated = 0;
for (const f of files) {
  const full = path.join(process.cwd(), f);
  if (!fs.existsSync(full)) continue;
  let s = fs.readFileSync(full, 'utf8');
  const before = s;
  s = s.split('$lib/server/../db').join('$db');
  s = s.split('$lib/server/../domain').join('$domain');
  s = s.split('$lib/server/../validation').join('$validation');
  s = s.split('$lib/server/../server').join('$server');
  s = s.split('../../db').join('$db');
  s = s.split('../../domain').join('$domain');
  s = s.split('../../validation').join('$validation');
  s = s.split('../../server').join('$server');
  if (s !== before) {
    fs.writeFileSync(full, s);
    console.log('updated', f);
    totalUpdated++;
  }
}
console.log('total updated:', totalUpdated);
