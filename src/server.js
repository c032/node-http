import * as http from 'http';
import * as stream from 'stream';

function nopHandler(ctx, next) {
    return;
}

export class Request {
    constructor(rawRequest) {
        this.raw = rawRequest;
    }

    get method() {
        return this.raw.method;
    }

    get path() {
        const parsedUrl = new URL(
            this.raw.url,
            `http://${this.raw.headers.host}`
        );

        return parsedUrl.pathname;
    }

    get headers() {
        this.raw.headers;
    }
}

function formatHeaderKey(key) {
    const parts = key.split('-');
    const formattedKey = parts
        .map((part) => (
            part.substring(0, 1).toUpperCase() +
            part.substring(1, part.length).toLowerCase()
        ))
        .join('-');

    return formattedKey;
}

export class Response {
    constructor(raw) {
        this.raw = raw;

        this.status = 200;
        this.headers = {};
        this.body = null;
    }

    getHeaders() {
        return Object.keys(this.headers)
            .map(key => [key, this.headers[key]])
            .map(([key, value]) => ([formatHeaderKey(key), value]))
            .reduce((d, [key, value]) => ({
                ...d,

                [key]: value,
            }), {});
    }

    getHeader(key) {
        const searchKey = key.toLowerCase();

        const keys = Object.keys(this.headers);
        for (let i = 0; i < keys.length; i++) {
            const currentKey = keys[i].toLowerCase();
            if (searchKey === currentKey) {
                return this.headers[keys[i]];
            }
        }
    }

    setHeader(key, value) {
        const searchKey = key.toLowerCase();

        const keys = Object.keys(this.headers);
        for (let i = 0; i < keys.length; i++) {
            const currentKey = keys[i].toLowerCase();
            if (searchKey === currentKey) {
                this.headers[keys[i]] = value;

                return;
            }
        }

        this.headers[key] = value;
    }

    json(body) {
        const buffer = Buffer.from(
            JSON.stringify(body, null, 4) + '\n',
            'utf8'
        );

        this.body = buffer;

        this.setHeader('Content-Type', 'application/json; charset=UTF-8');
        this.setHeader('Content-Length', buffer.length);
    }
}

export class Server {
    constructor() {
        this.server = null;
        this.handlers = [];
    }

    pushHandler(handler) {
        this.handlers.push(handler);
    }

    getInternalHandler(i = 0) {
        return async (ctx) => {
            if (i > this.handlers.length) {
                throw new Error(`Handler not found at index: ${i}`);
            }

            let handler;
            let nextHandler;
            if (i === this.handlers.length) {
                handler = nopHandler;
                nextHandler = nopHandler;
            } else {
                handler = this.handlers[i];
                nextHandler = this.getInternalHandler(i + 1);
            }

            return handler(ctx, () => nextHandler(ctx));
        };
    }

    getHttpHandler() {
        return (req, res) => {
            const ctx = {
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
                console.error(err.stack);

                res.writeHead(500, headers);
                res.end();
            });
        };
    }

    listen(...args) {
        if (this.server !== null) {
            throw new Error('already listening');
        }

        const handler = this.getHttpHandler();

        this.server = http.createServer(handler);

        this.server.listen(...args);
    }
}
