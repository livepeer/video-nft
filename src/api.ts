import axios, { AxiosInstance, Method } from 'axios';
import { Asset, Task, FfmpegProfile } from './types/schema';

export const prodApiEndpoint = 'https://livepeer.com';

type ExportTaskParams = NonNullable<Task['params']>['export'];

export type ApiAuthorization = { apiKey: string } | { jwt: string };

export default class VodApi {
	private client: AxiosInstance;

	constructor(auth: ApiAuthorization, apiEndpoint: string = prodApiEndpoint) {
		this.client = axios.create({
			baseURL: apiEndpoint,
			headers:
				'apiKey' in auth
					? { Authorization: `Bearer ${auth.apiKey}` }
					: 'jwt' in auth
					? { Authorization: `JWT ${auth.jwt}` }
					: {},
			maxContentLength: Infinity,
			maxBodyLength: Infinity
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

	async getAsset(id: string) {
		return this.makeRequest<Asset>('get', `/api/asset/${id}`);
	}

	async getTask(id: string) {
		return this.makeRequest<Task>('get', `/api/task/${id}`);
	}

	async requestUploadUrl(assetName: string, objectStoreId?: string) {
		return this.makeRequest<{ url: string; asset: Asset; task: Task }>(
			'post',
			`/api/asset/request-upload`,
			{
				name: assetName,
				objectStoreId
			}
		);
	}

	uploadFile(url: string, contents: NodeJS.ReadableStream) {
		return this.makeRequest('put', url, contents);
	}

	async transcodeAsset(src: Asset, profile: FfmpegProfile, name?: string) {
		return this.makeRequest<{ asset: Asset; task: Task }>(
			'post',
			`/api/asset/transcode`,
			{
				assetId: src.id,
				name: name ?? `${src.name} (${profile.name})`,
				profile
			}
		);
	}

	async exportAsset(id: string, params: ExportTaskParams) {
		return this.makeRequest<{ task: Task }>(
			'post',
			`/api/asset/${id}/export`,
			params
		);
	}

	// next level utilities

	async waitTask(task: Task, reportProgress?: (progress: number) => void) {
		let lastProgress = 0;
		while (
			task.status?.phase !== 'completed' &&
			task.status?.phase !== 'failed'
		) {
			const progress = task.status?.progress;
			if (progress && progress !== lastProgress) {
				if (reportProgress) reportProgress(progress);
				lastProgress = progress;
			}
			new Promise(resolve => setTimeout(resolve, 1000));
			task = await this.getTask(task.id ?? '');
		}

		if (task.status.phase === 'failed') {
			throw new Error(
				`${task.type} task failed. error: ${task.status.errorMessage}`
			);
		}
		return task;
	}

	private async makeRequest<T>(method: Method, path: string, data?: any) {
		try {
			const res = await this.client.request({ method, url: path, data });
			res.request;
			return res.data as T;
		} catch (err: any) {
			if (!axios.isAxiosError(err) || !err.response) {
				throw err;
			}
			const { status, statusText, data } = err.response;
			let msg = JSON.stringify(data);
			if (Array.isArray(data.errors) && data.errors.length > 0) {
				msg = data.errors[0];
			}

			throw new Error(
				`Request to ${path} failed (${status} ${statusText}): ${msg}`
			);
		}
	}
}
