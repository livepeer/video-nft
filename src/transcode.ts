import { Asset, FfmpegProfile } from './types/schema';

const openSeaNftSizeLimit = 100_000_000; // 100 MB
const min720pBitrate = 500_000; // 0.5 Mbps
const minBitrate = 100_000; // 0.1 Mbps

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
	if (desiredBitrate < minBitrate) {
		console.error(
			`Warning: Asset is larger than OpenSea file limit so the video won't playback automatically. ` +
				`It will still be stored in IPFS and referenced in the NFT metadata, so a proper application is still able to play it back. ` +
				`For more information check http://bit.ly/opensea-file-limit`
		);
		return null;
	}
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
