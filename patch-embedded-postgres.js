// This script patches embedded-postgres before it's loaded by the app
const Module = require('module');
const path = require('path');
const fs = require('fs');

// Find embedded-postgres in pnpm's virtual store
const epPaths = [
  '/app/node_modules/.pnpm/embedded-postgres@18.1.0-beta.16/node_modules/embedded-postgres/dist/index.js',
  '/app/node_modules/embedded-postgres/dist/index.js'
];

let patched = false;
for (const epPath of epPaths) {
  if (fs.existsSync(epPath)) {
    let content = fs.readFileSync(epPath, 'utf8');
    if (!content.includes('createPostgresUser === false')) {
      content = content.replace(
        'if (!this.options.createPostgresUser) {',
        'if (this.options.createPostgresUser === false) {'
      );
      fs.writeFileSync(epPath, content);
      console.log(`Patched embedded-postgres at ${epPath}`);
      patched = true;
      break;
    } else {
      console.log('embedded-postgres already patched at', epPath);
      patched = true;
      break;
    }
  }
}

if (!patched) {
  console.warn('Could not find embedded-postgres to patch');
}
