import * as http from 'http';
import * as stream from 'stream';
import { Buffer } from 'buffer';

export interface IHeaders {
	[key: string]: string|undefined;
}

class Request {
	public raw: http.IncomingMessage;

	constructor(rawRequest: http.IncomingMessage) {
		this.raw = rawRequest;
	}

	get method() {
		return this.raw.method;
	}

	get path() {
		const { url } = this.raw;
		if (!url) {
			throw new Error('Missing `url` property');
		}

		const host: string = this.raw.headers.host || 'domain.invalid';

		const parsedUrl = new URL(
			url,
			`http://${host}`,
		);

		return parsedUrl.pathname;
	}

	get headers() {
		return this.raw.headers;
	}
}

function formatHeaderKey(key: string): string {
	const parts = key.split('-');
	const formattedKey = parts
		.map((part) => (
			part.substring(0, 1).toUpperCase() +
			part.substring(1, part.length).toLowerCase()
		))
		.join('-');

	return formattedKey;
}

class Response {
	public raw: http.ServerResponse;

	public status: number = 200;

	public headers: IHeaders = {};

	public body: null | string | Buffer | stream.Stream = null;

	constructor(raw: http.ServerResponse) {
		this.raw = raw;
	}

	getHeaders(): IHeaders {
		return Object.keys(this.headers)
			.map((key: string) => ({
				key: formatHeaderKey(key),
				value: this.headers[key],
			}))
			.reduce((d, { key, value }) => ({
				...d,

				[key]: value,
			}), {});
	}

	getHeader(key: string): string|null {
		const searchKey = key.toLowerCase();

		const keys = Object.keys(this.headers);
		for (let i = 0; i < keys.length; i += 1) {
			const currentKeyOriginal = keys[i];
			if (typeof currentKeyOriginal === 'undefined') {
				continue;
			}

			const currentKey = currentKeyOriginal.toLowerCase();
			if (searchKey === currentKey) {
				const value = this.headers[currentKeyOriginal];
				if (typeof value === 'undefined') {
					return null;
				}

				return value;
			}
		}

		return null;
	}

	setHeader(key: string, value: string): void {
		const searchKey = key.toLowerCase();

		const keys = Object.keys(this.headers);
		for (let i = 0; i < keys.length; i += 1) {
			const currentKeyOriginal = keys[i];
			if (typeof currentKeyOriginal === 'undefined') {
				continue;
			}

			const currentKey = currentKeyOriginal.toLowerCase();
			if (searchKey === currentKey) {
				this.headers[currentKeyOriginal] = value;

				return;
			}
		}

		this.headers[key] = value;
	}

	json(body: any) {
		const jsonStr = JSON.stringify(body, null, 4);

		const buffer = Buffer.from(
			`${jsonStr}\n`,
			'utf8',
		);

		this.body = buffer;

		this.setHeader('Content-Type', 'application/json; charset=UTF-8');
		this.setHeader('Content-Length', buffer.length.toString());
	}
}

export interface IContext {
	request: Request;
	response: Response;
}

export interface INextFunction {
	(): Promise<void>;
}

function nopHandler(): Promise<void> {
	return Promise.resolve();
}

export interface IHandler {
	(ctx: IContext, next: INextFunction): Promise<void>;
}

interface IInternalHandler {
	(ctx: IContext): Promise<void>
}

export class Server {
	private server: http.Server | null = null;

	private handlers: IHandler[] = [];

	pushHandler(handler: IHandler): void {
		this.handlers.push(handler);

		return;
	}

	private getInternalHandler(i = 0): IInternalHandler {
		return async (ctx: IContext) => {
			if (i > this.handlers.length) {
				throw new Error(`Handler not found at index: ${i}`);
			}

			let handler: IHandler;
			let nextHandler: IInternalHandler;
			if (i === this.handlers.length) {
				handler = nopHandler;
				nextHandler = nopHandler;
			} else {
				handler = this.handlers[i] || nopHandler;
				nextHandler = this.getInternalHandler(i + 1);
			}

			return handler(ctx, () => nextHandler(ctx));
		};
	}

	getHttpHandler(): http.RequestListener {
		return (req: http.IncomingMessage, res: http.ServerResponse) => {
			const ctx: IContext = {
				request: new Request(req),
				response: new Response(res),
			};

			const handler = this.getInternalHandler();

			handler(ctx).then(() => {
				const {
					status,
					headers,
					body,
				} = ctx.response;

				res.writeHead(status, headers);

				if (body === null) {
					res.end();
				} else if (body instanceof stream.Readable) {
					body.pipe(res);
				} else {
					res.end(body);
				}
			}).catch((err) => {
				// eslint-disable-next-line no-console
				console.error(err.stack);

				res.writeHead(500);
				res.end();
			});
		};
	}

	listen(...args: any[]): void {
		if (this.server !== null) {
			throw new Error('already listening');
		}

		const handler: http.RequestListener = this.getHttpHandler();

		this.server = http.createServer(handler);

		this.server.listen(...args);

		return;
	}
}
