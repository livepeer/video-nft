import VodApi from './api';
import { fileOpen } from 'browser-fs-access';
import { getDesiredBitrate, makeProfile } from './transcode';

export class VideoNFT {
	private api: VodApi;

	constructor(apiKey: string, apiEndpoint?: string) {
		this.api = new VodApi(apiKey, apiEndpoint);
	}

	async mintNft(args: {
		assetName: string;
		filename: string;
		nftMetadata: string;
	}) {
		const { handle } = await fileOpen({
			description: 'MP4 Video files',
			mimeTypes: ['video/mp4'],
			extensions: ['mp4', 'mov', 'm4v']
		});

		const {
			url: uploadUrl,
			asset: { id: assetId },
			task: importTask
		} = await this.api.requestUploadUrl(args.assetName);

		const file = await handle?.getFile();
		if (!file) {
			throw new Error('Failed to open file');
		}
		await this.api.uploadFile(uploadUrl, file.stream());
		await this.api.waitTask(importTask);

		let asset = await this.api.getAsset(assetId ?? '');
		const desiredBitrate = await getDesiredBitrate(asset).catch(() => null);
		if (desiredBitrate) {
			const transcode = await this.api.transcodeAsset(
				asset,
				makeProfile(asset, desiredBitrate)
			);
			await this.api.waitTask(transcode.task);
			asset = transcode.asset;
		}

		let { task: exportTask } = await this.api.exportAsset(
			asset.id ?? '',
			JSON.parse(args.nftMetadata)
		);
		exportTask = await this.api.waitTask(exportTask);

		return exportTask.output?.export;
	}
}
