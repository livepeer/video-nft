/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export interface Asset {
	id: string;
	/**
	 * Type of the asset.
	 */
	type?: 'video';
	/**
	 * Used to form playback URL and storage folder
	 */
	playbackId?: string;
	/**
	 * URL for HLS playback
	 */
	playbackUrl?: string;
	/**
	 * URL to manually download the asset if desired
	 */
	downloadUrl?: string;
	/**
	 * Object store ID where the asset is stored
	 */
	objectStoreId?: string;
	storage?: {
		ipfs?: {
			spec?: {
				/**
				 * Name of the NFT metadata template to export. 'player' will embed the Livepeer Player on the NFT while 'file' will reference only the immutable MP4 files.
				 */
				nftMetadataTemplate?: 'player' | 'file';
				/**
				 * Additional data to add to the NFT metadata exported to IPFS. Will be deep merged with the default metadata exported.
				 */
				nftMetadata?: {
					[k: string]: unknown;
				};
			};
			status?: {
				/**
				 * Phase of the asset storage
				 */
				phase: 'waiting' | 'ready' | 'failed' | 'reverted';
				/**
				 * Error message if the last storage changed failed.
				 */
				errorMessage?: string;
				tasks: {
					/**
					 * ID of any currently running task that is exporting this asset to IPFS.
					 */
					pending?: string;
					/**
					 * ID of the last task to run successfully, that created the currently saved data.
					 */
					last?: string;
					/**
					 * ID of the last task to fail execution.
					 */
					failed?: string;
				};
				/**
				 * Addresses of the asset in IPFS from the last successful task execution.
				 */
				addresses?: AssetIPFSAddresses;
			};
		};
	};
	/**
	 * Status of the asset
	 */
	status?: {
		/**
		 * Phase of the asset
		 */
		phase: 'waiting' | 'ready' | 'failed';
		/**
		 * Timestamp (in milliseconds) at which the asset was last updated
		 */
		updatedAt: number;
		/**
		 * Error message if the asset creation failed.
		 */
		errorMessage?: string;
	};
	/**
	 * Name of the asset. This is not necessarily the filename, can be a custom name or title
	 */
	name: string;
	/**
	 * User input metadata associated with the asset
	 */
	meta?: {
		[k: string]: string;
	};
	/**
	 * Timestamp (in milliseconds) at which asset was created
	 */
	createdAt?: number;
	/**
	 * Size of the asset in bytes
	 */
	size?: number;
	/**
	 * Hash of the asset
	 */
	hash?: {
		/**
		 * Hash of the asset
		 */
		hash?: string;
		/**
		 * Hash algorithm used to compute the hash
		 */
		algorithm?: string;
	}[];
	/**
	 * Video metadata
	 */
	videoSpec?: {
		/**
		 * Format of the asset
		 */
		format?: string;
		/**
		 * Duration of the asset in seconds (float)
		 */
		duration?: number;
		/**
		 * Bitrate of the video in bits per second
		 */
		bitrate?: number;
		/**
		 * List of tracks associated with the asset when the format contemplates them (e.g. mp4)
		 */
		tracks?: {
			/**
			 * type of track
			 */
			type: 'video' | 'audio';
			/**
			 * Codec of the track
			 */
			codec: string;
			/**
			 * Start time of the track in seconds
			 */
			startTime?: number;
			/**
			 * Duration of the track in seconds
			 */
			duration?: number;
			/**
			 * Bitrate of the track in bits per second
			 */
			bitrate?: number;
			/**
			 * Width of the track - only for video tracks
			 */
			width?: number;
			/**
			 * Height of the track - only for video tracks
			 */
			height?: number;
			/**
			 * Pixel format of the track - only for video tracks
			 */
			pixelFormat?: string;
			/**
			 * Frame rate of the track - only for video tracks
			 */
			fps?: number;
			/**
			 * Amount of audio channels in the track
			 */
			channels?: number;
			/**
			 * Sample rate of the track in samples per second - only for audio tracks
			 */
			sampleRate?: number;
			/**
			 * Bit depth of the track - only for audio tracks
			 */
			bitDepth?: number;
		}[];
	};
	/**
	 * ID of the source asset (root) - If missing, this is a root asset
	 */
	sourceAssetId?: string;
}

export interface AssetIPFSAddresses {
	/**
	 * IPFS CID of the exported video file
	 */
	videoFileCid: string;
	/**
	 * URL for the file with the IPFS protocol
	 */
	videoFileUrl: string;
	/**
	 * URL to access file via HTTP through an IPFS gateway
	 */
	videoFileGatewayUrl: string;
	/**
	 * IPFS CID of the default metadata exported for the video
	 */
	nftMetadataCid: string;
	/**
	 * URL for the metadata file with the IPFS protocol
	 */
	nftMetadataUrl: string;
	/**
	 * URL to access metadata file via HTTP through an IPFS gateway
	 */
	nftMetadataGatewayUrl: string;
}

export interface Task {
	/**
	 * Task ID
	 */
	id: string;
	/**
	 * Type of the task
	 */
	type?: 'import' | 'export' | 'transcode';
	/**
	 * Timestamp (in milliseconds) at which task was created
	 */
	createdAt?: number;
	/**
	 * ID of the input asset
	 */
	inputAssetId?: string;
	/**
	 * ID of the output asset
	 */
	outputAssetId?: string;
	/**
	 * Parameters of the task
	 */
	params?: {
		/**
		 * Parameters for the import task
		 */
		import?: {
			/**
			 * URL of the asset to import
			 */
			url?: string;
			/**
			 * S3 object key of the uploaded asset
			 */
			uploadedObjectKey?: string;
		};
		/**
		 * Parameters for the export task
		 */
		export?:
			| {
					/**
					 * custom URL parameters for the export task
					 */
					custom: {
						/**
						 * URL where to export the asset
						 */
						url: string;
						/**
						 * Method to use on the export request
						 */
						method?: string;
						/**
						 * Headers to add to the export request
						 */
						headers?: {
							[k: string]: string;
						};
					};
			  }
			| {
					ipfs: {
						/**
						 * Custom credentials for the Piñata service. Must have either a JWT or an API key and an API secret.
						 */
						pinata:
							| {
									/**
									 * Will be added to the Authorization header as a Bearer token.
									 */
									jwt: string;
							  }
							| {
									/**
									 * Will be added to the pinata_api_key header.
									 */
									apiKey: string;
									/**
									 * Will be added to the pinata_secret_api_key header.
									 */
									apiSecret: string;
							  };
						/**
						 * Additional data to add to the NFT metadata exported to IPFS. Will be deep merged with the default metadata exported.
						 */
						nftMetadata?: {
							[k: string]: unknown;
						};
					};
			  };
		/**
		 * Parameters for the transcode task
		 */
		transcode?: {
			profile?: FfmpegProfile;
		};
	};
	/**
	 * Status of the task
	 */
	status?: {
		/**
		 * Phase of the task
		 */
		phase?:
			| 'pending'
			| 'waiting'
			| 'running'
			| 'failed'
			| 'completed'
			| 'cancelled';
		/**
		 * Timestamp (in milliseconds) at which task was updated
		 */
		updatedAt?: number;
		/**
		 * Current progress of the task in a 0-100 percentage
		 */
		progress?: number;
		/**
		 * Error message if the task failed
		 */
		errorMessage?: string;
	};
	/**
	 * Output of the task
	 */
	output?: {
		/**
		 * Output of the import task
		 */
		import?: {
			videoFilePath?: string;
			metadataFilePath?: string;
			assetSpec?: Asset;
			[k: string]: unknown;
		};
		/**
		 * Output of the export task
		 */
		export?: {
			ipfs?: AssetIPFSAddresses;
		};
		transcode?: {
			asset?: {
				videoFilePath?: string;
				metadataFilePath?: string;
				assetSpec?: {
					id?: string;
					/**
					 * Type of the asset.
					 */
					type?: 'video' | 'audio';
					/**
					 * Used to form playback URL and storage folder
					 */
					playbackId?: string;
					/**
					 * URL to manually download the asset if desired
					 */
					downloadUrl?: string;
					/**
					 * Object store ID where the asset is stored
					 */
					objectStoreId?: string;
					/**
					 * Name of the asset. This is not necessarily the filename, can be a custom name or title
					 */
					name: string;
					/**
					 * User input metadata associated with the asset
					 */
					meta?: {
						[k: string]: string;
					};
					/**
					 * Timestamp (in milliseconds) at which the asset was last updated
					 */
					updatedAt?: number;
					/**
					 * Timestamp (in milliseconds) at which asset was created
					 */
					createdAt?: number;
					/**
					 * Size of the asset in bytes
					 */
					size?: number;
					/**
					 * Hash of the asset
					 */
					hash?: {
						/**
						 * Hash of the asset
						 */
						hash?: string;
						/**
						 * Hash algorithm used to compute the hash
						 */
						algorithm?: string;
					}[];
					/**
					 * Video metadata
					 */
					videoSpec?: {
						/**
						 * Format of the asset
						 */
						format?: string;
						/**
						 * Duration of the asset in seconds (float)
						 */
						duration?: number;
						/**
						 * Bitrate of the video in bits per second
						 */
						bitrate?: number;
						/**
						 * List of tracks associated with the asset when the format contemplates them (e.g. mp4)
						 */
						tracks?: {
							/**
							 * type of track
							 */
							type: 'video' | 'audio';
							/**
							 * Codec of the track
							 */
							codec: string;
							/**
							 * Start time of the track in seconds
							 */
							startTime?: number;
							/**
							 * Duration of the track in seconds
							 */
							duration?: number;
							/**
							 * Bitrate of the track in bits per second
							 */
							bitrate?: number;
							/**
							 * Width of the track - only for video tracks
							 */
							width?: number;
							/**
							 * Height of the track - only for video tracks
							 */
							height?: number;
							/**
							 * Pixel format of the track - only for video tracks
							 */
							pixelFormat?: string;
							/**
							 * Frame rate of the track - only for video tracks
							 */
							fps?: number;
							/**
							 * Amount of audio channels in the track
							 */
							channels?: number;
							/**
							 * Sample rate of the track in samples per second - only for audio tracks
							 */
							sampleRate?: number;
							/**
							 * Bit depth of the track - only for audio tracks
							 */
							bitDepth?: number;
						}[];
					};
					/**
					 * Status of the asset
					 */
					status?: 'waiting' | 'ready' | 'failed';
					/**
					 * ID of the source asset (root) - If missing, this is a root asset
					 */
					sourceAssetId?: string;
				};
				[k: string]: unknown;
			};
		};
	};
}

/**
 * LMPS ffmpeg profile
 */
export interface FfmpegProfile {
	name: string;
	width: number;
	height: number;
	bitrate: number;
	fps: number;
	fpsDen?: number;
	gop?: string;
	profile?: 'H264Baseline' | 'H264Main' | 'H264High' | 'H264ConstrainedHigh';
	encoder?: 'h264' | 'hevc' | 'vp8' | 'vp9';
}
