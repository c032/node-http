import * as path from 'path';

import { Server } from '../../server';

import {
	errorWrapperHandler,
	notFoundHandler,
	requestLoggerHandler,
	staticFileHandlerFactory,
} from './handlers';

function main() {
	const root = path.join(__dirname, '..');
	const s = new Server();

	s.pushHandler(requestLoggerHandler);
	s.pushHandler(errorWrapperHandler);
	s.pushHandler(staticFileHandlerFactory(root));
	s.pushHandler(notFoundHandler);

	s.listen(3000);
}

main();
