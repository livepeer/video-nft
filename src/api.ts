import * as fs from 'fs';
import axios, { AxiosInstance, Method } from 'axios';
import { Asset, Task, FfmpegProfile } from './types/schema';

export default class VodApi {
	private client: AxiosInstance;

	constructor(
		private readonly apiHost: string,
		private readonly apiToken: string
	) {
		this.client = axios.create({
			baseURL: apiHost,
			headers: {
				Authorization: `Bearer ${apiToken}`
			},
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

	async requestUploadUrl(assetName: string) {
		return this.makeRequest<{ url: string; asset: Asset; task: Task }>(
			'post',
			`/api/asset/request-upload`,
			{
				name: assetName
			}
		);
	}

	async uploadFile(url: string, filename: string) {
		let file: fs.ReadStream | null = null;
		try {
			file = fs.createReadStream(filename);
			await this.makeRequest('put', url, file);
		} finally {
			file?.close();
		}
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

	async exportAsset(id: string, nftMetadata: Object) {
		return this.makeRequest<{ task: Task }>(
			'post',
			`/api/asset/${id}/export`,
			{
				ipfs: { nftMetadata }
			}
		);
	}

	// next level utilities

	async waitTask(task: Task) {
		console.log(
			`Waiting for ${task.type} task completion... id=${task.id}`
		);
		let lastProgress = 0;
		while (
			task.status?.phase !== 'completed' &&
			task.status?.phase !== 'failed'
		) {
			const progress = task.status?.progress;
			if (progress && progress !== lastProgress) {
				console.log(` - progress: ${100 * progress}%`);
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
