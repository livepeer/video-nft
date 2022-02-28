import { Asset, FfmpegProfile } from './types/schema';

const openSeaNftSizeLimit = 100_000_000; // 100 MB

export function getDesiredProfile(asset: Asset): FfmpegProfile | null {
	const size = asset.size ?? 0;
	const videoTrack = asset.videoSpec?.tracks?.find(t => t.type === 'video');
	const { bitrate, width, height } = videoTrack ?? {};
	if (size <= openSeaNftSizeLimit || !bitrate || !width || !height) {
		return null;
	}

	const audioTrack = asset.videoSpec?.tracks?.find(t => t.type === 'audio');
	const audioBitrate = audioTrack?.bitrate ?? 0;
	const desiredBitrate = Math.floor(
		(bitrate + audioBitrate) * (openSeaNftSizeLimit / size) - audioBitrate
	);
	// We only change the resolution if the bitrate changes too much. We don't go
	// below 720p though since the bitrate is the thing that really matters. We
	// don't need to handle aspect ratio since go-livepeer will do it for us.
	const referenceWidth = width * Math.sqrt(desiredBitrate / bitrate);
	const changeResolution = width > 1280 && referenceWidth < 1280;
	return {
		name: 'nft',
		bitrate: desiredBitrate,
		width: changeResolution ? 1280 : width,
		height: changeResolution ? 720 : height,
		fps: 0
	};
}
