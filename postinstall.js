const fs = require('fs');
const path = require('path');

// Find embedded-postgres in node_modules
const epPath = path.join(__dirname, 'node_modules', 'embedded-postgres', 'dist', 'index.js');
if (fs.existsSync(epPath)) {
  let content = fs.readFileSync(epPath, 'utf8');
  if (!content.includes('createPostgresUser === false')) {
    content = content.replace(
      'if (!this.options.createPostgresUser) {',
      'if (this.options.createPostgresUser === false) {'
    );
    fs.writeFileSync(epPath, content);
    console.log('Patched embedded-postgres!');
  } else {
    console.log('embedded-postgres already patched.');
  }
}
