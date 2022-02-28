import parseCli from './cli';
import VodApi from './api';
import { Asset, FfmpegProfile } from './types/schema';

const openSeaNftSizeLimit = 100_000_000; // 100 MB

function getDesiredProfile(asset: Asset): FfmpegProfile | null {
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

async function videoNft() {
	const args = await parseCli();
	const api = new VodApi(args.apiHost, args.apiToken as string);

	console.log('1. Requesting upload URL... ');
	const {
		url: uploadUrl,
		asset: pendingAsset,
		task: importTask
	} = await api.requestUploadUrl(args.assetName);
	console.log(`Pending asset with id=${pendingAsset.id}`);

	console.log('2. Uploading file...');
	await api.uploadFile(uploadUrl, args.filename as string);
	await api.waitTask(importTask);

	let asset = await api.getAsset(pendingAsset.id ?? '');
	const desiredProfile = getDesiredProfile(asset);
	if (desiredProfile) {
		console.log(
			`3. Transcoding asset to ${desiredProfile.width} x ${
				desiredProfile.height
			} @ ${Math.round(desiredProfile.bitrate / 1024)} kbps bitrate`
		);
		const transcode = await api.transcodeAsset(asset, desiredProfile);
		await api.waitTask(transcode.task);
		asset = transcode.asset;
	}

	console.log('3. Starting export... ');
	let { task: exportTask } = await api.exportAsset(
		asset.id ?? '',
		JSON.parse(args.nftMetadata)
	);
	console.log(`Created export task with id=${exportTask.id}`);
	exportTask = await api.waitTask(exportTask);

	const result = exportTask.output?.export?.ipfs;
	console.log(
		`4. Export successful! Result: \n${JSON.stringify(result, null, 2)}`
	);

	if (args.mintNft) {
		console.log(
			`5. Mint your NFT at:\n` +
				`https://livepeer-com-git-vg-feateth-tx-page-livepeer.vercel.app/transact/eth?tokenUri=${result?.nftMetadataUrl}`
		);
	}
}

videoNft().catch(err => {
	console.error(err);
	process.exit(1);
});
