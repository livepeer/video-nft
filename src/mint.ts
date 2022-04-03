import { ethers } from 'ethers';
import fs from 'fs';

import { VodApi, ApiAuthentication } from './api';
import { fileOpen } from 'browser-fs-access';
import { getDesiredBitrate, makeProfile } from './transcode';
import { Asset, FfmpegProfile } from './types/schema';
import { getBuiltinChain, toHexChainId } from './chains';

/**
 * Representation of either an `ethers` JSON RPC provider or the arguments
 * required for creating one. The `window.ethereum` object injected by MetaMask
 * is an acceptable value for this.
 */
export type EthereumOrProvider =
	| ethers.providers.ExternalProvider
	| ethers.providers.JsonRpcFetchFunc
	| ethers.providers.JsonRpcProvider;

const asJsonRpcProvider = (ethOrPrv?: EthereumOrProvider) =>
	!ethOrPrv
		? undefined
		: ethOrPrv instanceof ethers.providers.JsonRpcProvider
		? ethOrPrv
		: new ethers.providers.Web3Provider(ethOrPrv);

/**
 * Some helpful information about a newly minted NFT.
 */
export type MintedNftInfo = {
	/**
	 * The ID of the minted NFT which can be used to fetch information about it in
	 * the ERC-721 contract. Will only be available if the NFT contract emits a
	 * `Mint` event compatible with the {@link videoNftAbi}
	 */
	tokenId?: number;
	/**
	 * Helpful links about the NFT in OpenSea. Will only be available when using a
	 * {@link chains | built-in chain} for which we have the OpenSea parameters.
	 */
	opensea?: {
		tokenUrl?: string;
		contractUrl: string;
	};
};

/**
 * The ABI for the required interface that the NFT smart contract should
 * implement to be compatible with this SDK. Represented in ethers'
 * {@link https://docs.ethers.io/v5/api/utils/abi/formats/#abi-formats--human-readable-abi | human-readable ABI format}.
 *
 * @example
 * This can also be represented by the following Solidity interface:
 *
 * ```java
 * interface IVideoNFT {
 *    function mint(address owner, string memory tokenURI)
 *        public
 *        returns (uint256);
 *
 *    event Mint(
 *        address indexed sender,
 *        address indexed owner,
 *        string tokenURI,
 *        uint256 tokenId
 *    );
 * }
 * ```
 */
export const videoNftAbi = [
	'event Mint(address indexed sender, address indexed owner, string tokenURI, uint256 tokenId)',
	'function mint(address owner, string tokenURI) returns (uint256)'
] as const;

const isBrowser = typeof window !== 'undefined';

export class Uploader {
	async pickFile() {
		if (!isBrowser) {
			throw new Error('pickFile is only supported in the browser');
		}
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
	}

	openFile(name: string) {
		if (isBrowser) {
			throw new Error('openFile is only supported in node.js');
		}
		return fs.createReadStream(name);
	}

	async useFile<T>(
		name: string,
		handler: (file: fs.ReadStream) => Promise<T>
	) {
		let file: fs.ReadStream | null = null;
		try {
			file = this.openFile(name);
			return await handler(file);
		} finally {
			file?.close();
		}
	}

	uploadFile(
		url: string,
		content: File | fs.ReadStream,
		reportProgress?: (progress: number) => void,
		mimeType?: string
	) {
		return VodApi.uploadFile(url, content, reportProgress, mimeType);
	}
}

export class MinterApi {
	public vod: VodApi;

	constructor(api: { auth?: ApiAuthentication; endpoint?: string }) {
		this.vod = new VodApi(api.auth, api.endpoint);
	}

	async createAsset(
		name: string,
		content: File | fs.ReadStream,
		reportProgress: (progress: number) => void = () => {}
	) {
		const {
			url: uploadUrl,
			asset: { id: assetId },
			task
		} = await this.vod.requestUploadUrl(name);
		await VodApi.uploadFile(uploadUrl, content, p => reportProgress(p / 2));
		await this.vod.waitTask(task, p => reportProgress(0.5 + p / 2));
		return await this.vod.getAsset(assetId);
	}

	checkNftNormalize(asset: Asset) {
		let desiredProfile: FfmpegProfile | null = null;
		try {
			const desiredBitrate = getDesiredBitrate(asset);
			if (desiredBitrate) {
				desiredProfile = makeProfile(asset, desiredBitrate);
			}
			return {
				possible: true,
				desiredProfile
			};
		} catch (e) {
			return { possible: false, desiredProfile };
		}
	}

	async nftNormalize(
		asset: Asset,
		reportProgress?: (progress: number) => void
	) {
		const { possible, desiredProfile } = this.checkNftNormalize(asset);
		if (!possible || !desiredProfile) {
			return asset;
		}

		const transcode = await this.vod.transcodeAsset(
			asset.id,
			`${asset.name} (${desiredProfile.name})`,
			desiredProfile
		);
		await this.vod.waitTask(transcode.task, reportProgress);
		return await this.vod.getAsset(transcode.asset.id);
	}

	async exportToIPFS(
		assetId: string,
		nftMetadata?: string | Record<string, any>,
		reportProgress?: (progress: number) => void
	) {
		if (typeof nftMetadata === 'string') {
			nftMetadata = JSON.parse(nftMetadata) as Record<string, any>;
		}
		let { task } = await this.vod.exportAsset(assetId, {
			ipfs: { nftMetadata }
		});
		task = await this.vod.waitTask(task, reportProgress);
		return task.output?.export?.ipfs;
	}
}

export class MinterWeb3 {
	private ethProvider?: ethers.providers.JsonRpcProvider;
	private chainId: string;

	constructor(web3: {
		ethereum: EthereumOrProvider;
		chainId: string | number;
	}) {
		this.ethProvider = asJsonRpcProvider(web3.ethereum);
		// The chainId would not be really necessary since we can get it from the
		// provider. But the provider explodes if the chain changes, so we force
		// users to send the chainId here so it's clear they need to recreate
		// the SDK instance if the chain changes.
		this.chainId = toHexChainId(web3.chainId);
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

/**
 * This is the highest-level abstraction of the SDK providing all the utilities
 * for minting an NFT from a video file.
 *
 * @remarks
 * This class encapsulates both the Livepeer API-related as well as the
 * web3-related operations. It can also be used for only one or the other (for
 * example for splitting part of your logic between the frontend and the
 * backend), in which case you can create
 */
export class Minter {
	public uploader: Uploader;
	public api: MinterApi;
	public web3: MinterWeb3;

	constructor(
		api: { auth?: ApiAuthentication; endpoint?: string },
		web3: {
			ethereum: EthereumOrProvider;
			chainId: string | number;
		}
	) {
		this.uploader = new Uploader();
		this.api = new MinterApi(api);
		this.web3 = new MinterWeb3(web3);
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
		const file = await this.uploader.pickFile();
		let asset = await this.api.createAsset(args.assetName, file);
		if (!args.skipNormalize) {
			asset = await this.api.nftNormalize(asset);
		}
		const ipfsInfo = await this.api.exportToIPFS(
			asset.id,
			args.nftMetadata
		);
		if (!args.mint) {
			return null;
		}
		const {
			mint: { contractAddress, to }
		} = args;
		const tx = await this.web3.mintNft(
			ipfsInfo?.nftMetadataUrl ?? '',
			contractAddress,
			to
		);
		return this.web3.getMintedNftInfo(tx);
	}
}
