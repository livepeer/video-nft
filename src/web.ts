import lib from '.';

declare global {
	var videonft: typeof lib;
}

globalThis.videonft = lib;
