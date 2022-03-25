import { ethers } from 'ethers';

import VodApi, { ApiAuthorization } from './api';
import { fileOpen } from 'browser-fs-access';
import { getDesiredBitrate, makeProfile } from './transcode';
import { Asset } from './types/schema';
import { getBuiltinChain, toHexChainId } from './chains';

type EthereumOrProvider =
	| ethers.providers.ExternalProvider
	| ethers.providers.JsonRpcFetchFunc
	| ethers.providers.JsonRpcProvider;

const asJsonRpcProvider = (ethOrPrv?: EthereumOrProvider) =>
	!ethOrPrv
		? undefined
		: ethOrPrv instanceof ethers.providers.JsonRpcProvider
		? ethOrPrv
		: new ethers.providers.Web3Provider(ethOrPrv);

type MintedNftInfo = {
	tokenId?: number;
	opensea?: {
		tokenUrl?: string;
		contractUrl: string;
	};
};

const videoNftAbi = [
	'event Mint(address indexed sender, address indexed owner, string tokenURI, uint256 tokenId)',
	'function mint(address owner, string tokenURI) returns (uint256)'
];

export class VideoNFT {
	private ethProvider?: ethers.providers.JsonRpcProvider;
	private chainId: string;
	private api: VodApi;

	constructor(
		api: { auth: ApiAuthorization; endpoint?: string },
		web3?: {
			ethereum: EthereumOrProvider;
			chainId: string | number;
		}
	) {
		this.api = new VodApi(api.auth, api.endpoint);
		this.ethProvider = asJsonRpcProvider(web3?.ethereum);
		// The chainId would not be really necessary since we can get it from the
		// provider. But the provider explodes if the chain changes, so we force
		// users to send the chainId here so it's clear they need to recreate
		// the SDK instance if the chain changes.
		this.chainId = toHexChainId(web3?.chainId);
	}

	async createNft(args: {
		assetName: string;
		skipNormalize: boolean;
		nftMetadata: string;
		mint: {
			contractAddress?: string;
			to?: string;
		};
	}) {
		const file = await this.pickFile();
		let asset = await this.createAsset(args.assetName, { file });
		if (!args.skipNormalize) {
			asset = await this.nftNormalize(asset);
		}
		const ipfsInfo = await this.exportToIPFS(asset.id, args.nftMetadata);
		if (!args.mint || !this.ethProvider) {
			return null;
		}
		const {
			mint: { contractAddress, to }
		} = args;
		const tx = await this.mintNft(
			ipfsInfo?.nftMetadataUrl ?? '',
			contractAddress,
			to
		);
		return this.getMintedNftInfo(tx);
	}

	async pickFile() {
		const { handle } = await fileOpen({
			description: 'MP4 Video files',
			mimeTypes: ['video/mp4'],
			extensions: ['.mp4', '.mov', '.m4v']
		});
		const file = await handle?.getFile();
		if (!file) {
			throw new Error('Failed to open file');
		}
		return file;
		// return null as any;
	}

	async createAsset(
		name: string,
		contents: { file: File } | { stream: NodeJS.ReadableStream },
		reportProgress?: (progress: number) => void
	) {
		const {
			url: uploadUrl,
			asset: { id: assetId },
			task
		} = await this.api.requestUploadUrl(name);
		const stream =
			'file' in contents ? contents.file.stream() : contents.stream;
		await this.api.uploadFile(uploadUrl, stream);
		await this.api.waitTask(task, reportProgress);
		return await this.api.getAsset(assetId);
	}

	checkNftNormalize(asset: Asset) {
		try {
			const desiredBitrate = getDesiredBitrate(asset);
			return {
				possible: true,
				desiredBitrate
			};
		} catch (e) {
			return { possible: false, desiredBitrate: null };
		}
	}

	async nftNormalize(
		asset: Asset,
		reportProgress?: (progress: number) => void
	) {
		const { possible, desiredBitrate } = this.checkNftNormalize(asset);
		if (!possible || !desiredBitrate) {
			return asset;
		}

		const transcode = await this.api.transcodeAsset(
			asset,
			makeProfile(asset, desiredBitrate)
		);
		await this.api.waitTask(transcode.task, reportProgress);
		return await this.api.getAsset(transcode.asset.id);
	}

	async exportToIPFS(
		assetId: string,
		nftMetadata?: string | Record<string, any>,
		reportProgress?: (progress: number) => void
	) {
		if (typeof nftMetadata === 'string') {
			nftMetadata = JSON.parse(nftMetadata) as Record<string, any>;
		}
		let { task } = await this.api.exportAsset(assetId, {
			ipfs: { nftMetadata }
		});
		task = await this.api.waitTask(task, reportProgress);
		return task.output?.export?.ipfs;
	}

	async mintNft(
		tokenUri: string,
		contractAddress?: string,
		to?: string
	): Promise<ethers.ContractTransaction> {
		contractAddress ||= getBuiltinChain(this.chainId)?.defaultContract;
		if (!contractAddress) {
			throw new Error('No contract address provided nor builtin chain');
		}
		if (!this.ethProvider) {
			throw new Error('No Ethereum provider configured');
		}
		const net = await this.ethProvider.getNetwork();
		const currChainId = toHexChainId(net.chainId);
		if (currChainId !== this.chainId) {
			throw new Error(
				`Inconsistent chain ID: created for ${this.chainId} but found ${currChainId}`
			);
		}

		const signer = this.ethProvider.getSigner();
		const videoNft = new ethers.Contract(
			contractAddress,
			videoNftAbi,
			signer
		);
		const owner = to ?? (await signer.getAddress());
		return await videoNft.mint(owner, tokenUri);
	}

	async getMintedNftInfo(
		tx: ethers.ContractTransaction
	): Promise<MintedNftInfo> {
		const receipt = await tx.wait();
		const mintEv = receipt.events?.find(ev => ev?.event === 'Mint')?.args;
		const tokenId =
			mintEv && mintEv.length > 3
				? (mintEv[3].toNumber() as number)
				: undefined;
		let info: MintedNftInfo = { tokenId };
		const chainInfo = getBuiltinChain(this.chainId);
		if (chainInfo?.opensea) {
			const {
				opensea: { baseUrl, chainName }
			} = chainInfo;
			const { to: contractAddr } = receipt;
			info = {
				...info,
				opensea: {
					contractUrl: `${baseUrl}/assets?search%5Bquery%5D=${contractAddr}`,
					tokenUrl: !tokenId
						? undefined
						: `${baseUrl}/assets/${chainName}/${contractAddr}/${tokenId}`
				}
			};
		}
		return info;
	}
}
