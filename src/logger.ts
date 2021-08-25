export interface ILogger {
	print(summary: string, data?: Record<string, unknown>): Promise<void>;
}

export class NopLogger implements ILogger {
	// eslint-disable-next-line class-methods-use-this
	public print(): Promise<void> {
		return Promise.resolve();
	}
}

export const DEFAULT_LOGGER = new NopLogger();
