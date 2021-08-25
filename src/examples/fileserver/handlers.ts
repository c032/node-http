import * as fs from 'fs';
import * as path from 'path';

import {
	IContext,
	IHandler,
	INextFunction,
} from '../../server';

function serveFile(ctx: IContext, filePath: string): void {
	ctx.response.status = 200;

	// TODO: Guess file type from extension.
	ctx.response.setHeader('Content-Type', 'application/octet-stream');

	ctx.response.body = fs.createReadStream(filePath);
}

async function serveDirectory(ctx: IContext, directoryPath: string): Promise<void> {
	let requestPath = ctx.request.path;
	if (!requestPath.endsWith('/')) {
		requestPath += '/';
	}

	interface IEntry {
		type: string;
		name: string;
		absolutePath: string;
	}

	const responseBody = {
		entries: [] as IEntry[],
	};

	const rawEntries = await fs.promises.readdir(directoryPath, {
		withFileTypes: true,
	});

	for (let i = 0; i < rawEntries.length; i += 1) {
		const rawEntry = rawEntries[i];
		if (!rawEntry) {
			continue;
		}

		const { name } = rawEntry;
		if (name.startsWith('.')) {
			continue;
		}

		let type: 'directory' | 'file' | 'symlink';
		if (rawEntry.isDirectory()) {
			type = 'directory';
		} else if (rawEntry.isFile()) {
			type = 'file';
		} else if (rawEntry.isSymbolicLink()) {
			// TODO: Recursively find the type of the symlink target.
			//
			// `type` should only be either `file` or `directory`.
			type = 'symlink';
		} else {
			continue;
		}

		let urlPath = requestPath + name;
		if (type === 'directory') {
			urlPath += '/';
		}

		const entry: IEntry = {
			type,
			name,
			absolutePath: urlPath,
		};

		responseBody.entries.push(entry);
	}

	responseBody.entries.sort((a, b) => a.name.localeCompare(b.name));

	ctx.response.json(responseBody);
}

export async function requestLoggerHandler(ctx: IContext, next: INextFunction): Promise<void> {
	const start = Date.now();
	const startTimestamp = JSON.parse(
		JSON.stringify(new Date(start)),
	);

	// eslint-disable-next-line no-console
	console.log(`--> ${startTimestamp} ${ctx.request.method} ${ctx.request.path}`);

	await next();

	const end = Date.now();
	const endTimestamp = JSON.parse(
		JSON.stringify(new Date(end)),
	);

	const diff = end - start;

	// eslint-disable-next-line no-console
	console.log(`<-- ${endTimestamp} ${ctx.request.method} ${ctx.request.path} (${diff}ms)`);
}

export function staticFileHandlerFactory(root: string): IHandler {
	return async function staticFileHandler(ctx: IContext, next: INextFunction): Promise<void> {
		const { request } = ctx;
		const urlPath = request.path;

		let relativePath;
		if (urlPath === '/') {
			relativePath = '.';
		} else {
			relativePath = urlPath.substring(1);
		}

		const absolutePath = path.join(root, relativePath);

		const stat = await fs.promises.stat(absolutePath);
		if (stat.isDirectory()) {
			if (!urlPath.endsWith('/')) {
				ctx.response.status = 303;
				ctx.response.setHeader('Location', `${urlPath}/`);

				return Promise.resolve();
			}

			return serveDirectory(ctx, absolutePath);
		} if (stat.isFile()) {
			return serveFile(ctx, absolutePath);
		}

		return next();
	};
}

export async function notFoundHandler(ctx: IContext): Promise<void> {
	ctx.response.status = 404;
	ctx.response.json({
		error: {
			message: 'Not found.',
		},
	});
}

export async function errorWrapperHandler(ctx: IContext, next: INextFunction): Promise<void> {
	try {
		await next();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error(err.stack);

		ctx.response.status = 500;
		ctx.response.json({
			error: {
				message: 'Internal server error.',
				debug: {
					message: err.message,
					stack: err.stack,
				},
			},
		});
	}
}
