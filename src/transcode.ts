import { Asset, FfmpegProfile } from './types/schema';

const min720pBitrate = 500_000; // 0.5 Mbps

/**
 * Utility function to calculate the bitrate that an asset should be transcoded
 * to to fit within a specified size limit.
 *
 * @remarks
 * An exception will be thrown if the asset is so large that the necessary
 * bitrate would fall below the specified `minBitrate`.
 *
 * @param asset The asset to calculate the bitrate for.
 *
 * @param sizeLimit The size limit to shrink the asset to. Defaults to the
 * {@link
 * https://support.opensea.io/hc/en-us/articles/360061943574-What-file-formats-can-I-use-to-make-NFTs-Is-there-a-maximum-size-
 * | OpenSea file size limit} of 100 MB.
 *
 * @param minBitrate The minimum bitrate considered acceptable for the video.
 * Defaults to 100kbps.
 *
 * @returns The necessary bitrate for the asset to be shrunk or `null` if it
 * already fits within the desired limit. Throws an exception if the asset can't
 * be kept above `minBitrate`.
 */
export function getDesiredBitrate(
	asset: Asset,
	sizeLimit: number = 100_000_000,
	minBitrate: number = 100_000
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

/**
 * Creates the full ffmpeg profile specification for a given asset to be
 * transcoded to the specified bitrate. Also picks an acceptable resolution
 * based on the desired bitrate.
 *
 * @param asset The asset that will be transcoded.
 *
 * @param desiredBitrate The desired bitrate for the transcoded asset. Can be
 * obtained from {@link getDesiredBitrate} to shrink an asset to a certain size.
 *
 * @returns The ffmpeg profile for the asset to be transcoded to.
 */
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
