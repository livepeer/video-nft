import { Asset, FfmpegProfile } from './types/schema';

const openSeaNftSizeLimit = 100_000_000; // 100 MB
const min720pBitrate = 500_000; // 0.5 Mbps
const minBitrate = 100_000; // 0.1 Mbps

export function getDesiredBitrate(
	asset: Asset,
	sizeLimit: number = openSeaNftSizeLimit
): number | null {
	const size = asset.size ?? 0;
	const bitrate = getVideoTrack(asset)?.bitrate ?? 0;
	if (size <= sizeLimit || !bitrate) {
		return null;
	}

	const audioTrack = asset.videoSpec?.tracks?.find(t => t.type === 'audio');
	const audioBitrate = audioTrack?.bitrate ?? 0;
	const desiredBitrate = Math.floor(
		(bitrate + audioBitrate) * (sizeLimit / size) - audioBitrate
	);
	if (desiredBitrate < minBitrate) {
		throw new Error('Asset is too large to be downscaled to desired size');
	}
	return desiredBitrate;
}

export function makeProfile(
	asset: Asset,
	desiredBitrate: number
): FfmpegProfile {
	const { bitrate = 1, width = 0, height = 0 } = getVideoTrack(asset) ?? {};

	// We only change the resolution if the bitrate changes too much. We don't go
	// below 720p though since the bitrate is the thing that really matters. We
	// don't need to handle aspect ratio since go-livepeer will do it for us.
	const referenceHeight = height * Math.sqrt(desiredBitrate / bitrate);
	const resolution =
		height < 480 || referenceHeight > 720
			? { name: 'low-bitrate', width, height }
			: desiredBitrate < min720pBitrate
			? { name: '480p', width: 854, height: 480 }
			: { name: '720p', width: 1280, height: 720 };
	return {
		...resolution,
		bitrate: desiredBitrate,
		fps: 0
	};
}

function getVideoTrack(asset: Asset) {
	return asset.videoSpec?.tracks?.find(t => t.type === 'video');
}
