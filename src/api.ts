import axios, { AxiosInstance, AxiosRequestConfig, Method } from 'axios';
import { Asset, Task, FfmpegProfile } from './types/schema';

export * from './types/schema';

/**
 * Endpoint of the production Livepeer API. Can be used as the `apiEndpoint`
 * parameter for the {@link VodApi} constructor.
 */
export const prodApiEndpoint = 'https://livepeer.com';

const fileUploadClient = axios.create({
	maxContentLength: Infinity,
	maxBodyLength: Infinity,
	maxRedirects: 0
});

async function makeRequest<T>(
	client: AxiosInstance,
	method: Method,
	url: string,
	data?: any,
	additionalConfig?: AxiosRequestConfig<any>
) {
	try {
		const res = await client.request({
			...additionalConfig,
			method,
			url,
			data
		});
		return res.data as T;
	} catch (err: any) {
		if (!axios.isAxiosError(err) || !err.response) {
			throw err;
		}
		const { status, statusText, data } = err.response;
		let msg = JSON.stringify(data);
		if (Array.isArray(data?.errors) && data.errors.length > 0) {
			msg = data.errors[0];
		}

		throw new Error(
			`Request to ${url} failed (${status} ${statusText}): ${msg}`
		);
	}
}

type ExportTaskParams = NonNullable<Task['params']>['export'];

/**
 * This encapsulates the possible ways of authenticating with the API.
 *
 * @remarks
 *
 * The most common scenario is using API key authentication, so just create an
 * object with a single property `apiKey` and pass it to the {@link VodApi}
 * constructor.
 *
 * @remarks
 * Follow
 * {@link https://livepeer.com/docs/guides/start-live-streaming/api-key | these instrutions }
 * for more info on how to get an API key.
 */
export type ApiAuthentication = { apiKey: string } | { jwt: string };

/**
 * Options for instantiating a new {@link VodApi} client.
 */
export type ApiOptions = {
	/**
	 * Desired authentication method with the API, defaulting to no authentication
	 * if not specified. See {@link ApiAuthentication}.
	 */
	auth?: ApiAuthentication;
	/**
	 * Base endpoint to use when connection to the API. Must include scheme and
	 * hostname. Defaults to the Livepeer production endpoint if running on a
	 * backend, or the current origin if running in the browser. All APIs will be
	 * prefixed with an `/api` path segment.
	 */
	endpoint?: string;
};

const defaultApiEndpoint = typeof window !== 'undefined' ? '' : prodApiEndpoint;

/**
 * Simplified client to the Livepeer API, exposing only the VOD endpoints.
 *
 * @remarks
 *
 * This class can be used directly to make requests to the VOD API of Livepeer.
 * In the most common case you should be using the {@link VideoNft} class
 * instead for higher level utilities for uploading, processing and minting
 * video files.
 *
 * @public
 */
export class VodApi {
	private client: AxiosInstance;

	/**
	 * Creates a VodApi instance.
	 *
	 * @param opts - Options for the API client.
	 */
	constructor(opts: ApiOptions = {}) {
		const { auth, endpoint = defaultApiEndpoint } = opts;
		this.client = axios.create({
			baseURL: endpoint,
			headers: {
				Authorization: !auth
					? ''
					: 'apiKey' in auth
					? `Bearer ${auth.apiKey}`
					: 'jwt' in auth
					? `JWT ${auth.jwt}`
					: ''
			}
		});
		this.client.interceptors.response.use(res => {
			if (res.status >= 300) {
				throw new Error(
					`Error on ${res.config.method} ${res.config.url} (${
						res.status
					} ${res.statusText}): ${JSON.stringify(res.data)}`
				);
			}
			return res;
		});
	}

	/**
	 * Gets an asset from the API by ID.
	 *
	 * @remarks
	 * Refer to
	 * {@link https://livepeer.com/docs/api-reference/vod/list#retrieve-an-asset | the API reference}
	 * for more info.
	 *
	 * @param id - the ID of the asset to fetch
	 *
	 * @returns the asset object as returned by the API.
	 */
	async getAsset(id: string) {
		return this.makeRequest<Asset>('get', `/api/asset/${id}`);
	}

	/**
	 * Gets a task from the API by ID.
	 *
	 * @remarks
	 * Refer to
	 * {@link https://livepeer.com/docs/api-reference/vod/list-tasks#retrieve-a-task | the API reference}
	 * for more info.
	 *
	 * @param id - the ID of the task to fetch
	 * @returns the task object as returned by the API.
	 */
	async getTask(id: string) {
		return this.makeRequest<Task>('get', `/api/task/${id}`);
	}

	/**
	 * This is used to request a direct upload URL for a file to be uploaded to
	 * the API.
	 *
	 * @remarks
	 * This API is especially useful if you want to avoid proxying the whole file
	 * upload from your end-user. Your backend can just create an upload URL in
	 * the Livepeer API and return that URL to the frontend application, and your
	 * frontend itself can upload the file contents directly without any proxying.
	 *
	 * @remarks
	 * Refer to
	 * {@link https://livepeer.com/docs/api-reference/vod/upload | the API reference}
	 * for more info.
	 *
	 * @param assetName - the name of the asset that will be created for the file
	 * in the API.
	 *
	 * @returns An object with the `url`, and created `asset` and `task`. The
	 * `url` is the one that should be used to upload the file directly through
	 * {@link uploadFile}. The `asset` and `task` are the ones created for the
	 * file, which will get processed as soon as the contents are uploaded to the
	 * `url`. Check {@link getTask} to track task progress.
	 */
	async requestUploadUrl(assetName: string) {
		return this.makeRequest<{ url: string; asset: Asset; task: Task }>(
			'post',
			`/api/asset/request-upload`,
			{
				name: assetName
			}
		);
	}

	/**
	 * This is used to upload a file to a direct upload URL obtained from the
	 * {@link requestUploadUrl} method.
	 *
	 * @remarks
	 * This works both from a browser or from node.js. The file `content` should
	 * be a `File` object when using this from the browser or a `ReadableStream`
	 * when using this from Node.js. To get a stream from a file in node use
	 * `fs.createReadStream(filename)`.
	 *
	 * @param url The url returned by {@link requestUploadUrl}.
	 * @param content The content of the file to upload. A `File` from the browser
	 * or a `ReadableStream` from node.js.
	 * @param reportProgress An optional callback that will be called with the
	 * upload progress, useful for giving some UI feedback to users. This is
	 * currently only supported from the browser.
	 * @param mimeType An optional `mimeType` for the file. Defaults to
	 * `octet-stream` and exact type will be detected automatically later.
	 *
	 * @returns A promise that will be completed when the upload is done. Will
	 * throw an exception on any error. Refer back to the `asset` and `task`
	 * objects returned by {@link requestUploadUrl} for updates on the file
	 * processing.
	 */
	static async uploadFile(
		url: string,
		content: File | NodeJS.ReadableStream,
		reportProgress?: (progress: number) => void,
		mimeType?: string
	): Promise<void> {
		const defaultMimeType =
			typeof File !== 'undefined' && content instanceof File
				? content.type
				: 'application/octet-stream';
		return makeRequest(fileUploadClient, 'put', url, content, {
			headers: {
				contentType: mimeType || defaultMimeType
			},
			onUploadProgress:
				reportProgress && (p => reportProgress(p.loaded / p.total))
		});
	}

	/**
	 * Requests for an asset stored in the Livepeer API to be transcoded to a
	 * different video profile.
	 *
	 * @param assetId - the ID of the input asset to be transcoded.
	 * @param name - the name of the output asset to be created.
	 * @param profile - descripiton of the desired video profile for the output
	 * asset.
	 * @returns an object with the created `asset` and `task`. The `task` can be
	 * used to poll for the transcoding progress (check {@link getTask}) and after
	 * it is done the finalized `asset` can be fetched with {@link getAsset}.
	 */
	async transcodeAsset(
		assetId: string,
		name: string,
		profile: FfmpegProfile
	) {
		return this.makeRequest<{ asset: Asset; task: Task }>(
			'post',
			`/api/asset/transcode`,
			{
				assetId,
				name,
				profile
			}
		);
	}

	/**
	 * Requests for an asset to be exported from the Livepeer API to any external
	 * location, most commonly to IPFS.
	 *
	 * @remarks
	 * Refer to
	 * {@link https://livepeer.com/docs/api-reference/vod/export | the API reference}
	 * for more info.
	 *
	 * @param id - the ID of the asset to be exported.
	 * @param params - the export task parameters. Set `ipfs` field to export to
	 * IPFS and the optional `nftMetadata` sub-field to customize the NFT metadata.
	 *
	 * @returns the export `task` object that can be used to track progress and
	 * wait for the output (check {@link getTask}).
	 */
	async exportAsset(id: string, params: ExportTaskParams) {
		return this.makeRequest<{ task: Task }>(
			'post',
			`/api/asset/${id}/export`,
			params
		);
	}

	private makeRequest = <T>(method: Method, url: string, data?: any) =>
		makeRequest<T>(this.client, method, url, data);
}
