import * as fs from 'fs';
import * as path from 'path';

function serveFile(ctx, filePath) {
    ctx.response.status = 200;

    // TODO: Guess file type from extension.
    ctx.response.setHeader('Content-Type', 'application/octet-stream');

    ctx.response.body = fs.createReadStream(filePath);
}

async function serveDirectory(ctx, directoryPath) {
    let requestPath = ctx.request.path;
    if (!requestPath.endsWith('/')) {
        requestPath += '/';
    }

    const responseBody = {
        entries: [],
    };

    const rawEntries = await fs.promises.readdir(directoryPath, {
        withFileTypes: true,
    });

    for (const rawEntry of rawEntries) {
        const { name } = rawEntry;
        if (name.startsWith('.')) {
            continue;
        }

        let type;
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

        const entry = {
            type,
            name,
            absolutePath: urlPath,
        };

        responseBody.entries.push(entry);
    }

    responseBody.entries.sort((a, b) => a.name.localeCompare(b.name));

    ctx.response.json(responseBody);
}

export async function requestLoggerHandler(ctx, next) {
    const start = Date.now();
    const startTimestamp = JSON.parse(
        JSON.stringify(new Date(start))
    );

    const {
        method,
        path,
    } = ctx.request;

    console.log(`--> ${startTimestamp} ${method} ${path}`);

    await next();

    const end = Date.now();
    const endTimestamp = JSON.parse(
        JSON.stringify(new Date(end))
    );

    const diff = end - start;

    console.log(`<-- ${endTimestamp} ${method} ${path} (${diff}ms)`);
}

export function staticFileHandler(root) {
    return async function staticFileHandler(ctx, next) {
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

                return;
            }

            return serveDirectory(ctx, absolutePath);
        } else if (stat.isFile()) {
            return serveFile(ctx, absolutePath);
        } else {
            return next();
        }
    };
}

export async function notFoundHandler(ctx) {
    ctx.response.status = 404;
    ctx.response.json({
        error: {
            message: 'Not found.',
        },
    });
}

export async function errorWrapperHandler(ctx, next) {
    try {
        await next();
    } catch (err) {
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
