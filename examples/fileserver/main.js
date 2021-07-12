import * as path from 'path';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { Server } from '../../src/server.js';

import {
    errorWrapperHandler,
    notFoundHandler,
    requestLoggerHandler,
    staticFileHandler,
} from './handlers.js';

function main() {
    const root = path.join(__dirname, '..');
    const s = new Server();

    s.pushHandler(requestLoggerHandler);
    s.pushHandler(errorWrapperHandler);
    s.pushHandler(staticFileHandler(root));
    s.pushHandler(notFoundHandler);

    s.listen(3000);
}

main();
