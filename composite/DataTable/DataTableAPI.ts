import axios, { type AxiosInstance } from 'axios';

// API response interface
export interface APIResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

export class DataTableAPI {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:3000') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async fetchData(params: Record<string, any> = {}): Promise<APIResponse> {
    const response = await this.client.get('/api/members', { params });
    return response.data;
  }

  async addMember(memberData: any): Promise<any> {
    const response = await this.client.post('/api/members', memberData);
    return response.data;
  }

  async updateMember(id: string | number, memberData: any): Promise<any> {
    const response = await this.client.put(`/api/members/${id}`, memberData);
    return response.data;
  }

  async deleteMember(id: string | number): Promise<any> {
    const response = await this.client.delete(`/api/members/${id}`);
    return response.data;
  }

  async importCSV(csvData: any, mappings: Record<string, string>): Promise<any> {
    const formData = new FormData();
    formData.append('csvFile', csvData.file);
    formData.append('mappings', JSON.stringify(mappings));

    const response = await this.client.post('/api/members/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  // Setup Server-Sent Events for real-time updates
  setupSSE(onUpdate: (data: any) => void): EventSource {
    const eventSource = new EventSource(`${this.client.defaults.baseURL}/api/members/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onUpdate(data);
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    return eventSource;
  }
}
