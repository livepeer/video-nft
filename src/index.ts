import * as videonft from './videonft';

try {
	const anyGlobal = window as any;
	if (anyGlobal.videonft == null) {
		anyGlobal.videonft = videonft;
	}
} catch (error) {}

export { videonft };

export * from './types/schema';
export * from './videonft';
