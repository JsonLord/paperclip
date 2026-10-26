// Monkey-patch embedded-postgres to auto-create user when running as root
const embeddedPg = require('./server/node_modules/embedded-postgres/dist/index.js');
const originalConstructor = embeddedPg.default;

embeddedPg.default = class extends originalConstructor {
  constructor(options = {}) {
    // If running as root, auto-enable createPostgresUser
    const { uid } = require('os').userInfo();
    if (uid === 0 && !options.hasOwnProperty('createPostgresUser')) {
      options = { ...options, createPostgresUser: true };
    }
    super(options);
  }
};
