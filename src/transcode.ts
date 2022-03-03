import inquirer from 'inquirer';
import { Asset, FfmpegProfile } from './types/schema';

const openSeaNftSizeLimit = 100_000_000; // 100 MB
const min720pBitrate = 500_000; // 0.5 Mbps
const minBitrate = 100_000; // 0.1 Mbps

export async function getDesiredProfile(
	asset: Asset
): Promise<FfmpegProfile | null> {
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

	console.log(
		`File is too big for OpenSea 100MB limit (learn more at http://bit.ly/opensea-file-limit).`
	);
	const { action } = await inquirer.prompt({
		type: 'list',
		name: 'action',
		message: 'What do you want to do?',
		choices: [
			{
				value: 'transcode',
				name: 'Transcode it to a lower quality so OpenSea is able to preview'
			},
			{
				value: 'ignore',
				name: 'Mint it as is (should work in any other platform that uses the NFT file)'
			}
		]
	});
	if (action === 'ignore') {
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
