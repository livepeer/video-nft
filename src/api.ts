import fs from 'fs';
import axios, { AxiosInstance } from 'axios';
import { Asset, Task } from './types/schema';

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
		const { data } = await this.client.get<Task>(`/api/asset/${id}`);
		return data;
	}

	async getTask(id: string) {
		const { data } = await this.client.get<Task>(`/api/task/${id}`);
		return data;
	}

	async requestUploadUrl(assetName: string) {
		const { data } = await this.client.post('/api/asset/request-upload', {
			name: assetName
		});
		return data as { url: string; asset: Asset; task: Task };
	}

	async uploadFile(url: string, filename: string) {
		return await this.client.put(url, fs.createReadStream(filename));
	}

	async exportAsset(id: string, nftMetadata: Object) {
		const { data } = await this.client.post(`/api/asset/${id}/export`, {
			ipfs: { nftMetadata }
		});
		return data as { task: Task };
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
}
